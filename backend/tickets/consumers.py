import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer


class TicketConsumer(AsyncJsonWebsocketConsumer):
    """Live updates for a single ticket's detail page: new comments, status/priority/assignment changes."""

    async def connect(self):
        user = self.scope.get("user")
        self.ticket_id = self.scope["url_route"]["kwargs"]["ticket_id"]
        self.group_name = f"ticket_{self.ticket_id}"

        if user is None or not getattr(user, "is_authenticated", False):
            await self.close(code=4001)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "ticket_id": self.ticket_id})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Optional: support typing indicators
        if content.get("type") == "typing":
            await self.channel_layer.group_send(self.group_name, {
                "type": "ticket.event",
                "event": "typing",
                "data": {"user": self.scope["user"].username},
            })

    async def ticket_event(self, event):
        await self.send_json({"type": event["event"], "data": event["data"]})


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """Personal + role-based notification stream for the logged-in user."""

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            await self.close(code=4001)
            return

        self.user_group = f"user_{user.id}"
        self.role_group = f"role_{user.role}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.channel_layer.group_add(self.role_group, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected"})

    async def disconnect(self, close_code):
        if hasattr(self, "user_group"):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
            await self.channel_layer.group_discard(self.role_group, self.channel_name)

    async def notify_event(self, event):
        await self.send_json({"type": event["event"], "data": event["data"]})
