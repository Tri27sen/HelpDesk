from django.contrib import admin
from .models import Ticket, Comment, Attachment, AuditLog


class CommentInline(admin.TabularInline):
    model = Comment
    extra = 0


class AttachmentInline(admin.TabularInline):
    model = Attachment
    extra = 0


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "status", "priority", "customer", "assigned_agent", "sla_breached", "created_at"]
    list_filter = ["status", "priority", "sla_breached"]
    search_fields = ["title", "description"]
    inlines = [CommentInline, AttachmentInline]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["ticket", "action", "actor", "created_at"]
    list_filter = ["action"]
