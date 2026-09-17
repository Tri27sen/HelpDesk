import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { listTickets } from "../api/tickets";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { StatusBadge, PriorityBadge, SlaBadge } from "../components/Badges";

const STATUS_OPTIONS = ["open", "in_progress", "on_hold", "resolved", "closed"];
const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low"];

export default function TicketListPage() {
  const { user } = useAuth();
  const { toasts } = useNotifications();
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [unassigned, setUnassigned] = useState(false);
  const [ordering, setOrdering] = useState("-created_at");

  const fetchTickets = useCallback(() => {
    setLoading(true);
    const params = { ordering };
    if (search) params.search = search;
    if (status) params.status = status;
    if (priority) params.priority = priority;
    if (unassigned) params.unassigned = true;
    listTickets(params)
      .then((data) => {
        setTickets(data.results);
        setCount(data.count);
      })
      .finally(() => setLoading(false));
  }, [search, status, priority, unassigned, ordering]);

  useEffect(() => {
    const t = setTimeout(fetchTickets, 300);
    return () => clearTimeout(t);
  }, [fetchTickets]);

  // refresh silently whenever a relevant live notification comes in
  useEffect(() => {
    if (toasts.length > 0) fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts.length]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tickets <span className="muted">({count})</span></h1>
        {user.role === "customer" && (
          <Link to="/tickets/new" className="btn-primary">+ New Ticket</Link>
        )}
      </div>

      <div className="filters-bar">
        <input
          className="search-input"
          placeholder="Search title, description, customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={ordering} onChange={(e) => setOrdering(e.target.value)}>
          <option value="-created_at">Newest first</option>
          <option value="created_at">Oldest first</option>
          <option value="sla_due_at">SLA due soon</option>
          <option value="-priority">Priority</option>
        </select>
        {user.role === "agent" && (
          <label className="checkbox-label">
            <input type="checkbox" checked={unassigned} onChange={(e) => setUnassigned(e.target.checked)} />
            Unassigned only
          </label>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <div className="empty-state">No tickets found.</div>
      ) : (
        <div className="ticket-table">
          <div className="ticket-row ticket-row-head">
            <span>ID</span>
            <span>Title</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Customer</span>
            <span>Agent</span>
            <span>Comments</span>
            <span>SLA</span>
          </div>
          {tickets.map((t) => (
            <Link to={`/tickets/${t.id}`} key={t.id} className="ticket-row">
              <span className="muted">#{t.id}</span>
              <span className="ticket-title">{t.title}</span>
              <span><StatusBadge status={t.status} /></span>
              <span><PriorityBadge priority={t.priority} /></span>
              <span>{t.customer?.username}</span>
              <span>{t.assigned_agent?.username || <span className="muted">unassigned</span>}</span>
              <span>{t.comment_count ?? 0}</span>
              <span><SlaBadge ticket={t} /></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
