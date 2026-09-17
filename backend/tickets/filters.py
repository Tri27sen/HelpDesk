import django_filters
from .models import Ticket


class TicketFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    priority = django_filters.CharFilter(field_name="priority")
    assigned_agent = django_filters.NumberFilter(field_name="assigned_agent_id")
    unassigned = django_filters.BooleanFilter(method="filter_unassigned")
    breached = django_filters.BooleanFilter(field_name="sla_breached")
    created_after = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = Ticket
        fields = ["status", "priority", "assigned_agent", "unassigned", "breached"]

    def filter_unassigned(self, queryset, name, value):
        if value:
            return queryset.filter(assigned_agent__isnull=True)
        return queryset
