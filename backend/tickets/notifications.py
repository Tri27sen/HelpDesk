from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.mail import send_mail
from django.conf import settings


def _channel_layer():
    return get_channel_layer()


def broadcast_ticket_event(ticket_id, event_type, payload):
    """Send an event to everyone viewing this ticket's detail page (ws/tickets/<id>/)."""
    layer = _channel_layer()
    if not layer:
        return
    async_to_sync(layer.group_send)(
        f"ticket_{ticket_id}",
        {"type": "ticket.event", "event": event_type, "data": payload},
    )


def notify_user(user_id, event_type, payload):
    """Send a personal notification to a specific user (ws/notifications/)."""
    layer = _channel_layer()
    if not layer:
        return
    async_to_sync(layer.group_send)(
        f"user_{user_id}",
        {"type": "notify.event", "event": event_type, "data": payload},
    )


def notify_role(role, event_type, payload):
    """Broadcast to all connected users of a role, e.g. all agents about a new unassigned ticket."""
    layer = _channel_layer()
    if not layer:
        return
    async_to_sync(layer.group_send)(
        f"role_{role}",
        {"type": "notify.event", "event": event_type, "data": payload},
    )


def send_email_notification(subject, message, recipient_list):
    if not recipient_list:
        return
    try:
        send_mail(
            subject, message, settings.DEFAULT_FROM_EMAIL, recipient_list,
            fail_silently=True,
        )
    except Exception:
        pass
