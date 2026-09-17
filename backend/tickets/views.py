from django.contrib.auth import get_user_model
from django.db.models import Count, Avg, F, Q, ExpressionWrapper, DurationField
from django.utils import timezone
from rest_framework import viewsets, generics, permissions, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from .models import Ticket, Comment, Attachment, AuditLog
from .serializers import (
    TicketListSerializer, TicketDetailSerializer, TicketCreateSerializer,
    TicketUpdateSerializer, AgentTicketUpdateSerializer, CommentSerializer,
    AttachmentSerializer, AuditLogSerializer,
)
from .permissions import IsAdminOrAgentOrOwnerCustomer, IsAgentOrAdmin
from .filters import TicketFilter
from .notifications import broadcast_ticket_event, notify_user, notify_role, send_email_notification

User = get_user_model()


def log_audit(ticket, actor, action, detail=""):
    AuditLog.objects.create(ticket=ticket, actor=actor, action=action, detail=detail)


class TicketViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrAgentOrOwnerCustomer]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = TicketFilter
    search_fields = ["title", "description", "customer__username", "id"]
    ordering_fields = ["created_at", "updated_at", "priority", "status", "sla_due_at"]

    def get_serializer_class(self):
        if self.action == "list":
            return TicketListSerializer
        if self.action == "create":
            return TicketCreateSerializer
        if self.action in ("update", "partial_update"):
            # Only managers/admins may (re)assign or unassign a ticket — agents get a
            # serializer with no `assigned_agent` field at all, so any such value in
            # their request body is silently ignored rather than applied.
            if self.request.user.is_admin_role:
                return TicketUpdateSerializer
            return AgentTicketUpdateSerializer
        return TicketDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Ticket.objects.select_related("customer", "assigned_agent").annotate(
            comment_count=Count("comments", distinct=True)
        )
        if user.is_admin_role:
            return qs
        if user.is_agent:
            return qs.filter(Q(assigned_agent=user) | Q(assigned_agent__isnull=True))
        return qs.filter(customer=user)

    def perform_create(self, serializer):
        ticket = serializer.save()
        log_audit(ticket, self.request.user, AuditLog.Action.CREATED, f"Priority: {ticket.priority}")
        notify_role("agent", "ticket_created", {
            "ticket_id": ticket.id, "title": ticket.title, "priority": ticket.priority,
        })
        agent_emails = list(User.objects.filter(role=User.Role.AGENT).values_list("email", flat=True))
        send_email_notification(
            f"[Helpdesk] New ticket #{ticket.id}: {ticket.title}",
            f"A new {ticket.priority} priority ticket was created by {ticket.customer.username}.\n\n{ticket.description}",
            agent_emails,
        )

    def perform_update(self, serializer):
        ticket = self.get_object()
        old_status, old_priority, old_agent = ticket.status, ticket.priority, ticket.assigned_agent_id
        updated = serializer.save()
        actor = self.request.user

        if updated.status != old_status:
            log_audit(updated, actor, AuditLog.Action.STATUS_CHANGED, f"{old_status} -> {updated.status}")
            if updated.status == Ticket.Status.RESOLVED and not updated.resolved_at:
                updated.resolved_at = timezone.now()
                updated.save(update_fields=["resolved_at"])
                log_audit(updated, actor, AuditLog.Action.RESOLVED)
            if old_status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED) and updated.status not in (
                Ticket.Status.RESOLVED, Ticket.Status.CLOSED
            ):
                log_audit(updated, actor, AuditLog.Action.REOPENED)
            broadcast_ticket_event(updated.id, "status_changed", {"status": updated.status})
            if updated.customer_id:
                notify_user(updated.customer_id, "status_changed", {
                    "ticket_id": updated.id, "title": updated.title, "status": updated.status,
                })
                send_email_notification(
                    f"[Helpdesk] Ticket #{updated.id} status updated to {updated.get_status_display()}",
                    f"Your ticket '{updated.title}' is now marked as {updated.get_status_display()}.",
                    [updated.customer.email],
                )

        if updated.priority != old_priority:
            log_audit(updated, actor, AuditLog.Action.PRIORITY_CHANGED, f"{old_priority} -> {updated.priority}")
            broadcast_ticket_event(updated.id, "priority_changed", {"priority": updated.priority})

        if updated.assigned_agent_id != old_agent:
            if updated.assigned_agent_id:
                log_audit(updated, actor, AuditLog.Action.ASSIGNED, f"Assigned to {updated.assigned_agent.username}")
                notify_user(updated.assigned_agent_id, "ticket_assigned", {
                    "ticket_id": updated.id, "title": updated.title,
                })
                send_email_notification(
                    f"[Helpdesk] Ticket #{updated.id} assigned to you",
                    f"Ticket '{updated.title}' has been assigned to you.",
                    [updated.assigned_agent.email],
                )
            else:
                log_audit(updated, actor, AuditLog.Action.UNASSIGNED)
            broadcast_ticket_event(updated.id, "assignment_changed", {
                "assigned_agent": updated.assigned_agent.username if updated.assigned_agent else None,
            })


class TicketCommentListCreateView(generics.ListCreateAPIView):
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_ticket(self):
        return Ticket.objects.get(pk=self.kwargs["ticket_id"])

    def get_queryset(self):
        ticket = self.get_ticket()
        qs = ticket.comments.select_related("author").prefetch_related("attachments")
        if self.request.user.is_customer_role:
            qs = qs.filter(is_internal_note=False)
        return qs

    def perform_create(self, serializer):
        ticket = self.get_ticket()
        comment = serializer.save(ticket=ticket, author=self.request.user)
        log_audit(ticket, self.request.user, AuditLog.Action.COMMENTED,
                  "internal note" if comment.is_internal_note else "")
        broadcast_ticket_event(
            ticket.id, "comment_added",
            CommentSerializer(comment, context=self.get_serializer_context()).data,
        )

        if not comment.is_internal_note:
            recipients = set()
            if self.request.user.id != ticket.customer_id:
                notify_user(ticket.customer_id, "new_comment", {"ticket_id": ticket.id, "title": ticket.title})
                recipients.add(ticket.customer.email)
            if ticket.assigned_agent_id and self.request.user.id != ticket.assigned_agent_id:
                notify_user(ticket.assigned_agent_id, "new_comment", {"ticket_id": ticket.id, "title": ticket.title})
                recipients.add(ticket.assigned_agent.email)
            send_email_notification(
                f"[Helpdesk] New reply on ticket #{ticket.id}",
                f"{self.request.user.username} wrote:\n\n{comment.body}",
                list(recipients),
            )


class TicketAttachmentUploadView(generics.ListCreateAPIView):
    serializer_class = AttachmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_ticket(self):
        return Ticket.objects.get(pk=self.kwargs["ticket_id"])

    def get_queryset(self):
        return self.get_ticket().attachments.select_related("uploaded_by")

    def perform_create(self, serializer):
        ticket = self.get_ticket()
        uploaded_file = self.request.FILES.get("file")
        attachment = serializer.save(
            ticket=ticket,
            uploaded_by=self.request.user,
            original_name=uploaded_file.name if uploaded_file else "file",
        )
        log_audit(ticket, self.request.user, AuditLog.Action.ATTACHMENT_ADDED, attachment.original_name)
        broadcast_ticket_event(
            ticket.id, "attachment_added",
            AttachmentSerializer(attachment, context=self.get_serializer_context()).data,
        )


class TicketAuditLogView(generics.ListAPIView):
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None  # a single ticket's history is small & bounded — return it as a plain array

    def get_queryset(self):
        return AuditLog.objects.filter(ticket_id=self.kwargs["ticket_id"]).select_related("actor")


class AnalyticsSummaryView(APIView):
    permission_classes = [IsAgentOrAdmin]

    def get(self, request):
        user = request.user
        qs = Ticket.objects.all()
        # A manager (admin) sees org-wide analytics; an agent sees only their own workload.
        if user.is_agent and not user.is_admin_role:
            qs = qs.filter(assigned_agent=user)

        # Always report every status/priority explicitly, defaulting to 0, so the
        # frontend never has to guess whether a missing key means "zero" or
        # "not loaded yet" — e.g. "closed" won't silently disappear just because
        # no ticket happens to be closed right now.
        by_status = {value: 0 for value, _ in Ticket.Status.choices}
        for row in qs.values("status").annotate(c=Count("id")):
            by_status[row["status"]] = row["c"]

        by_priority = {value: 0 for value, _ in Ticket.Priority.choices}
        for row in qs.values("priority").annotate(c=Count("id")):
            by_priority[row["priority"]] = row["c"]

        total = qs.count()
        active_count = by_status["open"] + by_status["in_progress"] + by_status["on_hold"]

        resolved_qs = qs.filter(resolved_at__isnull=False).annotate(
            resolution_time=ExpressionWrapper(F("resolved_at") - F("created_at"), output_field=DurationField())
        )
        avg_resolution = resolved_qs.aggregate(avg=Avg("resolution_time"))["avg"]
        avg_resolution_hours = round(avg_resolution.total_seconds() / 3600, 2) if avg_resolution else None

        sla_breached_count = qs.filter(sla_breached=True).count()

        since = timezone.now() - timezone.timedelta(days=14)
        daily = (
            qs.filter(created_at__gte=since)
            .extra(select={"day": "date(created_at)"})
            .values("day")
            .annotate(c=Count("id"))
            .order_by("day")
        )

        # Explicit per-agent breakdown — "who closed how many tickets" — instead of
        # a single combined "resolved" bucket, so open/resolved/closed are each
        # visible per agent rather than folded together.
        agent_qs = Ticket.objects.filter(assigned_agent__isnull=False)
        if user.is_agent and not user.is_admin_role:
            agent_qs = agent_qs.filter(assigned_agent=user)
        agent_rows = (
            agent_qs.values("assigned_agent__id", "assigned_agent__username")
            .annotate(
                total=Count("id"),
                open_count=Count("id", filter=Q(status__in=["open", "in_progress", "on_hold"])),
                resolved_count=Count("id", filter=Q(status="resolved")),
                closed_count=Count("id", filter=Q(status="closed")),
            )
            .order_by("-closed_count", "-total")
        )
        agent_breakdown = [
            {
                "agent_id": row["assigned_agent__id"],
                "agent": row["assigned_agent__username"],
                "total": row["total"],
                "open": row["open_count"],
                "resolved": row["resolved_count"],
                "closed": row["closed_count"],
            }
            for row in agent_rows
        ]

        return Response({
            "total_tickets": total,
            "active_tickets": active_count,
            "by_status": by_status,
            "by_priority": by_priority,
            "avg_resolution_hours": avg_resolution_hours,
            "sla_breached_count": sla_breached_count,
            "daily_created": list(daily),
            "agent_breakdown": agent_breakdown,
        })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def self_assign_ticket(request, ticket_id):
    """Agent self-assigns an unassigned ticket."""
    if not request.user.is_agent:
        return Response({"detail": "Only agents can self-assign."}, status=status.HTTP_403_FORBIDDEN)
    try:
        ticket = Ticket.objects.get(pk=ticket_id)
    except Ticket.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    if ticket.assigned_agent_id and ticket.assigned_agent_id != request.user.id:
        return Response({"detail": "Ticket already assigned."}, status=status.HTTP_400_BAD_REQUEST)
    ticket.assigned_agent = request.user
    ticket.save(update_fields=["assigned_agent"])
    log_audit(ticket, request.user, AuditLog.Action.ASSIGNED, f"Self-assigned by {request.user.username}")
    broadcast_ticket_event(ticket.id, "assignment_changed", {"assigned_agent": request.user.username})
    return Response(TicketDetailSerializer(ticket, context={"request": request}).data)