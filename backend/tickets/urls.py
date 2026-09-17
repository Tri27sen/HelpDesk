from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    TicketViewSet, TicketCommentListCreateView, TicketAttachmentUploadView,
    TicketAuditLogView, AnalyticsSummaryView, self_assign_ticket,
)

router = DefaultRouter()
router.register(r"tickets", TicketViewSet, basename="ticket")

urlpatterns = [
    path("tickets/<int:ticket_id>/comments/", TicketCommentListCreateView.as_view(), name="ticket-comments"),
    path("tickets/<int:ticket_id>/attachments/", TicketAttachmentUploadView.as_view(), name="ticket-attachments"),
    path("tickets/<int:ticket_id>/audit/", TicketAuditLogView.as_view(), name="ticket-audit"),
    path("tickets/<int:ticket_id>/self-assign/", self_assign_ticket, name="ticket-self-assign"),
    path("analytics/summary/", AnalyticsSummaryView.as_view(), name="analytics-summary"),
] + router.urls
