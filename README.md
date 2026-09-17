# Real-Time Helpdesk

A lightweight Zendesk/Jira-style helpdesk: customers open tickets, agents pick them up,
everyone chats in real time, and admins watch SLA/analytics.

```
Customer → Create Ticket → Support Agent → Assign Ticket → Chat / Comments → Resolve
```

**Backend:** Django + Django REST Framework + Django Channels (WebSockets) + SimpleJWT
**Frontend:** React (Vite) + React Router + Recharts, talking to the API over REST + native WebSocket

## Features

- **JWT auth** — register/login/refresh, role stored in the token
- **Roles** — Customer / Agent / Admin, enforced in querysets & permissions (customers only see their
  own tickets, agents see assigned + unassigned, admins see everything)
- **Ticket priority** (low/medium/high/urgent) driving an **SLA timer** — each ticket gets a computed
  `sla_due_at`, a live countdown in the UI, and a management command (`check_sla_breaches`) that marks
  breaches, logs them, and fires notifications — intended to run every minute via cron/celery-beat
- **Comments** — threaded per ticket, plus agent/admin-only **internal notes** invisible to customers
- **File attachments** on tickets
- **WebSocket notifications** — `ws/tickets/<id>/` for live per-ticket chat/status updates and
  `ws/notifications/` for a personal + role-based toast stream, authenticated via a custom JWT
  WebSocket middleware (`?token=<access_token>`)
- **Email notifications** on ticket creation, assignment, replies, and SLA breaches (console backend by
  default — swap `EMAIL_BACKEND` in `settings.py` for real SMTP)
- **Search** across title/description/customer + filtering by status/priority/assignment/breach
- **Analytics** — counts by status/priority, average resolution time, SLA breach count, 14-day creation
  trend, agent leaderboard
- **Audit history** — every status/priority/assignment change, comment, and attachment is logged per ticket

## Project layout

```
backend/    Django project (API + WebSockets)
frontend/   React app (Vite)
```

## Running it locally

### 1. Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate      # optional but recommended
pip install -r requirements.txt

python manage.py migrate
python manage.py seed_demo_data     # creates demo users + sample tickets (optional)
python manage.py runserver 0.0.0.0:8000
```

This starts Daphne (ASGI), serving both the REST API and WebSockets on port 8000.

Demo logins created by `seed_demo_data`:

| Username    | Password     | Role     |
|-------------|--------------|----------|
| admin       | admin123     | admin    |
| agent1/2/3  | agent123     | agent    |
| customer1-5 | customer123  | customer |

To check SLA breaches (run this periodically — e.g. `* * * * * cd backend && python manage.py check_sla_breaches` in cron):

```bash
python manage.py check_sla_breaches
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`. It talks to the API at `http://localhost:8000` (see `frontend/.env`).

### 3. Admin panel

Django admin is available at `http://localhost:8000/admin/` (log in as `admin`/`admin123`) for
inspecting/editing raw data.

## Notes on scaling this up for production

- **Channel layer**: currently `InMemoryChannelLayer` (single-process, fine for dev/demo). For
  multi-process/production, install `channels_redis` and point `CHANNEL_LAYERS` at Redis.
- **Email**: swap `EMAIL_BACKEND` to `django.core.mail.backends.smtp.EmailBackend` and set
  `EMAIL_HOST`/`EMAIL_HOST_USER`/etc.
- **SLA checks**: run `check_sla_breaches` on a schedule (cron, Celery beat, or a k8s CronJob).
- **Database**: swap SQLite for Postgres by changing `DATABASES` in `settings.py`.
- **Static/media**: in production, serve `media/` (attachments) via S3/GCS rather than local disk.
