import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";

const ROLE_LABELS = { customer: "customer", agent: "agent", admin: "manager" };

export default function Navbar() {
  const { user, logout } = useAuth();
  const { connected } = useNotifications();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink to="/tickets" className="brand">
          🎫 Helpdesk
        </NavLink>
        <nav className="nav-links">
          <NavLink to="/tickets" end>Tickets</NavLink>
          {user.role === "customer" && <NavLink to="/tickets/new">New Ticket</NavLink>}
          {(user.role === "agent" || user.role === "admin") && <NavLink to="/analytics">Analytics</NavLink>}
        </nav>
        <div className="navbar-right">
          <span className={`ws-dot ${connected ? "on" : "off"}`} title={connected ? "Live" : "Reconnecting…"} />
          <span className="me">
            {user.username} <span className={`role-badge role-${user.role}`}>{ROLE_LABELS[user.role] || user.role}</span>
          </span>
          <button
            className="btn-ghost"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}