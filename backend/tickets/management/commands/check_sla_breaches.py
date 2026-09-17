from django.core.management.base import BaseCommand
from tickets.models import Ticket, AuditLog
from tickets.notifications import broadcast_ticket_event, notify_user, send_email_notification


class Command(BaseCommand):
    help = "Checks all open tickets for SLA breaches, marks them, logs audit, and notifies. Run periodically (e.g. every minute via cron/celery-beat)."

    def handle(self, *args, **options):
        candidates = Ticket.objects.exclude(status__in=["resolved", "closed"]).filter(sla_breached=False)
        breached_count = 0
        for ticket in candidates:
            if ticket.check_and_mark_breach():
                breached_count += 1
                AuditLog.objects.create(
                    ticket=ticket, actor=None, action=AuditLog.Action.SLA_BREACHED,
                    detail="SLA deadline passed",
                )
                broadcast_ticket_event(ticket.id, "sla_breached", {"ticket_id": ticket.id, "title": ticket.title})
                if ticket.assigned_agent_id:
                    notify_user(ticket.assigned_agent_id, "sla_breached", {
                        "ticket_id": ticket.id, "title": ticket.title,
                    })
                    send_email_notification(
                        f"[Helpdesk] SLA BREACHED: Ticket #{ticket.id}",
                        f"Ticket '{ticket.title}' has breached its SLA deadline.",
                        [ticket.assigned_agent.email],
                    )
        self.stdout.write(self.style.SUCCESS(f"Checked {candidates.count()} tickets, {breached_count} newly breached."))
