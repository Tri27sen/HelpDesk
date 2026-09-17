from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Ticket, Comment, Attachment, AuditLog

User = get_user_model()


class MiniUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "role"]


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = MiniUserSerializer(read_only=True)

    class Meta:
        model = Attachment
        fields = ["id", "ticket", "comment", "file", "original_name", "uploaded_by", "uploaded_at"]
        read_only_fields = ["id", "ticket", "original_name", "uploaded_by", "uploaded_at"]
        extra_kwargs = {"comment": {"required": False, "allow_null": True}}


class CommentSerializer(serializers.ModelSerializer):
    author = MiniUserSerializer(read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "ticket", "author", "body", "is_internal_note", "created_at", "attachments"]
        read_only_fields = ["id", "ticket", "author", "created_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        if attrs.get("is_internal_note") and request and request.user.is_customer_role:
            raise serializers.ValidationError("Customers cannot create internal notes.")
        return attrs


class AuditLogSerializer(serializers.ModelSerializer):
    actor = MiniUserSerializer(read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "action", "detail", "actor", "created_at"]


class TicketListSerializer(serializers.ModelSerializer):
    customer = MiniUserSerializer(read_only=True)
    assigned_agent = MiniUserSerializer(read_only=True)
    comment_count = serializers.IntegerField(read_only=True, required=False)
    is_breached = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "title", "status", "priority", "customer", "assigned_agent",
            "created_at", "updated_at", "resolved_at", "sla_due_at", "sla_breached",
            "comment_count", "is_breached",
        ]

    def get_is_breached(self, obj):
        return obj.sla_breached or (
            obj.sla_due_at is not None and obj.status not in ("resolved", "closed")
            and obj.time_remaining_seconds is not None and obj.time_remaining_seconds < 0
        )


class TicketDetailSerializer(serializers.ModelSerializer):
    customer = MiniUserSerializer(read_only=True)
    assigned_agent = MiniUserSerializer(read_only=True)
    comments = serializers.SerializerMethodField()
    attachments = AttachmentSerializer(many=True, read_only=True)
    time_remaining_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id", "title", "description", "status", "priority", "customer", "assigned_agent",
            "created_at", "updated_at", "resolved_at", "sla_due_at", "sla_breached",
            "time_remaining_seconds", "comments", "attachments",
        ]
        read_only_fields = ["id", "customer", "created_at", "updated_at", "resolved_at", "sla_due_at", "sla_breached"]

    def get_comments(self, obj):
        request = self.context.get("request")
        qs = obj.comments.select_related("author").prefetch_related("attachments")
        if request and request.user.is_customer_role:
            qs = qs.filter(is_internal_note=False)
        return CommentSerializer(qs, many=True, context=self.context).data


class TicketCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ["id", "title", "description", "priority"]

    def create(self, validated_data):
        request = self.context["request"]
        validated_data["customer"] = request.user
        return super().create(validated_data)


class TicketUpdateSerializer(serializers.ModelSerializer):
    """Used for admins/managers — full control, including (re)assigning or unassigning an agent."""

    class Meta:
        model = Ticket
        fields = ["title", "description", "status", "priority", "assigned_agent"]

    def validate_assigned_agent(self, value):
        if value is not None and not value.is_agent:
            raise serializers.ValidationError("Can only assign tickets to users with the agent role.")
        return value


class AgentTicketUpdateSerializer(serializers.ModelSerializer):
    """
    Used for agents — deliberately excludes `assigned_agent`. Agents may update the
    status/priority of tickets already assigned to them, but assignment/unassignment
    is a manager-only action (done via TicketUpdateSerializer) or the self-assign endpoint.
    """

    class Meta:
        model = Ticket
        fields = ["title", "description", "status", "priority"]