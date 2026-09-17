import random
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from tickets.models import Ticket, Comment, AuditLog

User = get_user_model()

TITLES = [
    "Cannot log into my account",
    "Payment failed but I was charged",
    "App crashes on startup",
    "Feature request: dark mode",
    "Unable to reset password",
    "Export to CSV is broken",
    "Slow loading dashboard",
    "Invoice missing for last month",
    "Integration with Slack not working",
    "Need help configuring webhooks",
]


class Command(BaseCommand):
    help = "Seeds demo users and tickets for local development/testing."

    def handle(self, *args, **options):
        admin, created = User.objects.get_or_create(
            username="admin", defaults={"email": "admin@example.com", "role": "admin", "is_staff": True, "is_superuser": True}
        )
        if created:
            admin.set_password("admin123")
            admin.save()

        agents = []
        for i in range(1, 4):
            u, created = User.objects.get_or_create(
                username=f"agent{i}", defaults={"email": f"agent{i}@example.com", "role": "agent"}
            )
            if created:
                u.set_password("agent123")
                u.save()
            agents.append(u)

        customers = []
        for i in range(1, 6):
            u, created = User.objects.get_or_create(
                username=f"customer{i}", defaults={"email": f"customer{i}@example.com", "role": "customer"}
            )
            if created:
                u.set_password("customer123")
                u.save()
            customers.append(u)

        priorities = ["low", "medium", "high", "urgent"]
        statuses = ["open", "in_progress", "on_hold", "resolved", "closed"]

        for i, title in enumerate(TITLES):
            ticket, created = Ticket.objects.get_or_create(
                title=title,
                defaults=dict(
                    description=f"Detailed description for: {title}",
                    priority=random.choice(priorities),
                    status=random.choice(statuses),
                    customer=random.choice(customers),
                    assigned_agent=random.choice(agents + [None]),
                ),
            )
            if created:
                AuditLog.objects.create(ticket=ticket, actor=ticket.customer, action="created")
                Comment.objects.create(ticket=ticket, author=ticket.customer, body="Here's more detail on the issue I'm facing.")
                if ticket.assigned_agent:
                    Comment.objects.create(ticket=ticket, author=ticket.assigned_agent, body="Thanks, looking into this now.")

        self.stdout.write(self.style.SUCCESS(
            "Seeded demo data. Login as admin/admin123, agent1/agent123, customer1/customer123"
        ))
