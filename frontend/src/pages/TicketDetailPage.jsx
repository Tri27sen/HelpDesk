import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getTicket, updateTicket, addComment, uploadAttachment, getAuditLog,
  selfAssignTicket, listAgents,
} from "../api/tickets";
import { useAuth } from "../context/AuthContext";
import { useTicketSocket } from "../hooks/useTicketSocket";
import { StatusBadge, PriorityBadge, SlaBadge } from "../components/Badges";

const STATUS_OPTIONS = ["open", "in_progress", "on_hold", "resolved", "closed"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Append an item to a list only if its id isn't already present. Used for both
// comments and attachments, since each can arrive twice — once as the direct
// REST response to the action that created it, and once via the WebSocket
// broadcast the same client is subscribed to for this ticket. Without this
// guard, whichever of the two arrives second gets appended unconditionally,
// producing a visible duplicate.
function addUnique(list, item) {
  return list.some((existing) => existing.id === item.id) ? list : [...list, item];
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [agents, setAgents] = useState([]);
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [file, setFile] = useState(null);
  const [tab, setTab] = useState("conversation");
  const [typingUser, setTypingUser] = useState(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const typingTimeout = useRef(null);

  const isAdmin = user.role === "admin";
  const isAgent = user.role === "agent";
  const isAgentOrAdmin = isAgent || isAdmin;
  // Agents may only edit a ticket once it's assigned to them; managers (admin) can always edit.
  const canEditTicket = isAdmin || (isAgent && ticket?.assigned_agent?.id === user.id);

  const loadAll = useCallback(async () => {
    const [t, a] = await Promise.all([getTicket(id), getAuditLog(id)]);
    setTicket(t);
    setComments(t.comments || []);
    setAudit(a);
  }, [id]);

  useEffect(() => {
    loadAll();
    if (isAgentOrAdmin) {
      listAgents().then((data) => setAgents(data.results || data));
    }
  }, [loadAll, isAgentOrAdmin]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [comments]);

  const { sendTyping } = useTicketSocket(id, {
    comment_added: (data) => {
      setComments((prev) => addUnique(prev, data));
      setTypingUser(null);
    },
    status_changed: (data) => setTicket((prev) => (prev ? { ...prev, status: data.status } : prev)),
    priority_changed: (data) => setTicket((prev) => (prev ? { ...prev, priority: data.priority } : prev)),
    assignment_changed: () => getTicket(id).then(setTicket),
    attachment_added: (data) =>
      setTicket((prev) => (prev ? { ...prev, attachments: addUnique(prev.attachments || [], data) } : prev)),
    sla_breached: () => setTicket((prev) => (prev ? { ...prev, sla_breached: true } : prev)),
    typing: (data) => {
      if (data.user === user.username) return;
      setTypingUser(data.user);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTypingUser(null), 2500);
    },
  });

  async function handleFieldChange(field, value) {
    const updated = await updateTicket(id, { [field]: value });
    setTicket((prev) => ({ ...prev, ...updated }));
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!body.trim() && !file) return;
    setSending(true);
    try {
      const comment = await addComment(id, { body: body.trim() || "(attachment)", is_internal_note: isInternal });
      // Dedup here too: the WebSocket broadcast for this same comment can arrive
      // before this REST response does, in which case it's already in state.
      setComments((prev) => addUnique(prev, comment));
      if (file) {
        const att = await uploadAttachment(id, file);
        setTicket((prev) => ({ ...prev, attachments: addUnique(prev.attachments || [], att) }));
        setFile(null);
      }
      setBody("");
    } finally {
      setSending(false);
    }
  }

  if (!ticket) return <div className="page">Loading ticket…</div>;

  const visibleComments = comments.filter((c) => !c.is_internal_note || isAgentOrAdmin);

  return (
    <div className="page ticket-detail">
      <Link to="/tickets" className="back-link">&larr; All tickets</Link>

      <div className="ticket-header">
        <div>
          <h1>#{ticket.id} {ticket.title}</h1>
          <div className="badge-row">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <SlaBadge ticket={ticket} />
          </div>
        </div>
        <div className="ticket-meta">
          <div>Customer: <strong>{ticket.customer?.username}</strong></div>
          <div>Agent: <strong>{ticket.assigned_agent?.username || "Unassigned"}</strong></div>
          <div className="muted">Opened {timeAgo(ticket.created_at)}</div>
        </div>
      </div>

      <p className="ticket-description">{ticket.description}</p>

      {isAgentOrAdmin && (
        <div className="agent-controls">
          <label>
            Status
            <select
              value={ticket.status}
              disabled={!canEditTicket}
              onChange={(e) => handleFieldChange("status", e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={ticket.priority}
              disabled={!canEditTicket}
              onChange={(e) => handleFieldChange("priority", e.target.value)}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>

          {/* Assignment itself is manager-only. Agents get a read-only view of who
              it's assigned to, plus a self-assign action when it's unclaimed. */}
          {isAdmin ? (
            <label>
              Assigned agent
              <select
                value={ticket.assigned_agent?.id || ""}
                onChange={(e) => handleFieldChange("assigned_agent", e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.username}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Assigned agent
              <span className="readonly-value">{ticket.assigned_agent?.username || "Unassigned"}</span>
            </label>
          )}

          {isAgent && !ticket.assigned_agent && (
            <button className="btn-secondary" onClick={() => selfAssignTicket(id).then(setTicket)}>
              Self-assign to me
            </button>
          )}
          {isAgent && !canEditTicket && ticket.assigned_agent && (
            <span className="muted small">Only {ticket.assigned_agent.username} or a manager can edit this ticket.</span>
          )}
        </div>
      )}

      <div className="tabs">
        <button className={tab === "conversation" ? "tab active" : "tab"} onClick={() => setTab("conversation")}>
          Conversation
        </button>
        <button className={tab === "attachments" ? "tab active" : "tab"} onClick={() => setTab("attachments")}>
          Attachments ({ticket.attachments?.length || 0})
        </button>
        <button className={tab === "audit" ? "tab active" : "tab"} onClick={() => setTab("audit")}>
          History
        </button>
      </div>

      {tab === "conversation" && (
        <div className="conversation">
          <div className="comment-list" ref={scrollRef}>
            {visibleComments.length === 0 && <div className="empty-state">No comments yet. Say hello!</div>}
            {visibleComments.map((c) => (
              <div
                key={c.id}
                className={`comment-bubble ${c.author?.id === user.id ? "own" : ""} ${c.is_internal_note ? "internal" : ""}`}
              >
                <div className="comment-head">
                  <strong>{c.author?.username}</strong>
                  {c.is_internal_note && <span className="internal-tag">internal note</span>}
                  <span className="muted small">{timeAgo(c.created_at)}</span>
                </div>
                <div className="comment-body">{c.body}</div>
              </div>
            ))}
            {typingUser && <div className="typing-indicator">{typingUser} is typing…</div>}
          </div>

          <form className="comment-form" onSubmit={handleSend}>
            <textarea
              placeholder={isInternal ? "Write an internal note (not visible to customer)…" : "Write a reply…"}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                sendTyping();
              }}
              rows={3}
            />
            <div className="comment-form-actions">
              <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} />
              {isAgentOrAdmin && (
                <label className="checkbox-label">
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                  Internal note
                </label>
              )}
              <button className="btn-primary" type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === "attachments" && (
        <div className="attachment-list">
          {(!ticket.attachments || ticket.attachments.length === 0) && (
            <div className="empty-state">No files attached yet.</div>
          )}
          {ticket.attachments?.map((a) => (
            <a key={a.id} href={a.file} target="_blank" rel="noreferrer" className="attachment-item">
              📎 {a.original_name} <span className="muted small">by {a.uploaded_by?.username}</span>
            </a>
          ))}
        </div>
      )}

      {tab === "audit" && (
        <div className="audit-list">
          {audit.map((entry) => (
            <div key={entry.id} className="audit-item">
              <span className="audit-action">{entry.action.replace("_", " ")}</span>
              {entry.detail && <span className="muted"> — {entry.detail}</span>}
              <span className="muted small"> · {entry.actor?.username || "system"} · {timeAgo(entry.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}