from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        AGENT = "agent", "Agent"
        ADMIN = "admin", "Manager"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)
    email = models.EmailField(unique=True)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    def __str__(self):
        return f"{self.username} ({self.role})"

    @property
    def is_agent(self):
        return self.role == self.Role.AGENT

    @property
    def is_customer_role(self):
        return self.role == self.Role.CUSTOMER

    @property
    def is_admin_role(self):
        return self.role == self.Role.ADMIN or self.is_superuser