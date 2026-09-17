export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{status.replace("_", " ")}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`badge priority-${priority}`}>{priority}</span>;
}

export function SlaBadge({ ticket }) {
  if (!ticket.sla_due_at) return null;
  const isDone = ["resolved", "closed"].includes(ticket.status);
  if (isDone) return <span className="badge sla-ok">SLA met</span>;
  if (ticket.sla_breached || ticket.is_breached) {
    return <span className="badge sla-breach">SLA breached</span>;
  }
  const remaining = new Date(ticket.sla_due_at) - new Date();
  const hours = Math.round(remaining / 3600000);
  return (
    <span className={`badge ${hours < 2 ? "sla-warn" : "sla-ok"}`}>
      {hours > 0 ? `${hours}h left` : "overdue"}
    </span>
  );
}
