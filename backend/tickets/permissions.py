from rest_framework import permissions


class IsAdminOrAgentOrOwnerCustomer(permissions.BasePermission):
    """
    Read (GET/HEAD/OPTIONS):
      - Admin ("manager"): sees everything.
      - Agent: sees tickets assigned to them or unassigned (queryset already scopes this).
      - Customer: sees only their own tickets.

    Write (PATCH/PUT/DELETE):
      - Admin: full control — including (re)assigning to any agent or removing an
        agent from a ticket.
      - Agent: may only update a ticket that is *already assigned to them* (status,
        priority, etc. via AgentTicketUpdateSerializer, which has no assigned_agent
        field). They cannot reassign/unassign — that's manager-only — and cannot
        touch a ticket assigned to a different agent. To pick up an unassigned
        ticket they must use the dedicated self-assign endpoint.
      - Customer: cannot modify tickets at all — they can only raise queries
        (create) and comment.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_admin_role:
            return True

        if request.method in permissions.SAFE_METHODS:
            if user.is_agent:
                return True  # queryset already scopes visibility to own + unassigned
            return obj.customer_id == user.id

        if request.method == "DELETE":
            return False  # only managers may delete tickets

        if user.is_agent:
            return obj.assigned_agent_id == user.id

        return False  # customers cannot modify tickets directly


class IsAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin_role)


class IsAgentOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and
            (request.user.is_agent or request.user.is_admin_role)
        )