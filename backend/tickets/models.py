from django.conf import settings
from django.db import models
from django.utils import timezone


class Ticket(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In Progress"
        ON_HOLD = "on_hold", "On Hold"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    title = models.CharField(max_length=255)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="tickets_created",
        on_delete=models.CASCADE,
    )
    assigned_agent = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="tickets_assigned",
        on_delete=models.SET_NULL, null=True, blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    sla_due_at = models.DateTimeField(null=True, blank=True)
    sla_breached = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["priority"]),
        ]

    def __str__(self):
        return f"#{self.id} {self.title}"

    def compute_sla_due_at(self):
        from django.conf import settings as dj_settings
        hours = dj_settings.SLA_HOURS.get(self.priority, 24)
        base = self.created_at or timezone.now()
        return base + timezone.timedelta(hours=hours)

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        if is_new and not self.created_at:
            self.created_at = timezone.now()
        super().save(*args, **kwargs)
        if self.sla_due_at is None:
            self.sla_due_at = self.compute_sla_due_at()
            super().save(update_fields=["sla_due_at"])

    def check_and_mark_breach(self):
        """Returns True if just transitioned into breach."""
        if self.status in (self.Status.RESOLVED, self.Status.CLOSED):
            return False
        if self.sla_due_at and timezone.now() > self.sla_due_at and not self.sla_breached:
            self.sla_breached = True
            self.save(update_fields=["sla_breached"])
            return True
        return False

    @property
    def time_remaining_seconds(self):
        if not self.sla_due_at:
            return None
        delta = self.sla_due_at - timezone.now()
        return int(delta.total_seconds())


class Comment(models.Model):
    ticket = models.ForeignKey(Ticket, related_name="comments", on_delete=models.CASCADE)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    body = models.TextField()
    is_internal_note = models.BooleanField(default=False)  # agent/admin-only private note
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment #{self.id} on Ticket #{self.ticket_id}"


def attachment_upload_path(instance, filename):
    return f"tickets/{instance.ticket_id}/{filename}"


class Attachment(models.Model):
    ticket = models.ForeignKey(Ticket, related_name="attachments", on_delete=models.CASCADE)
    comment = models.ForeignKey(Comment, related_name="attachments", on_delete=models.CASCADE, null=True, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    file = models.FileField(upload_to=attachment_upload_path)
    original_name = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.original_name


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATED = "created", "Created"
        STATUS_CHANGED = "status_changed", "Status Changed"
        PRIORITY_CHANGED = "priority_changed", "Priority Changed"
        ASSIGNED = "assigned", "Assigned"
        UNASSIGNED = "unassigned", "Unassigned"
        COMMENTED = "commented", "Commented"
        ATTACHMENT_ADDED = "attachment_added", "Attachment Added"
        SLA_BREACHED = "sla_breached", "SLA Breached"
        RESOLVED = "resolved", "Resolved"
        REOPENED = "reopened", "Reopened"

    ticket = models.ForeignKey(Ticket, related_name="audit_logs", on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=30, choices=Action.choices)
    detail = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} on Ticket #{self.ticket_id}"
