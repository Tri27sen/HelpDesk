import { useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";

export default function ToastStack() {
  const { toasts, dismissToast } = useNotifications();
  const navigate = useNavigate();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.type === "sla_breached" ? "toast-danger" : ""}`}
          onClick={() => {
            if (t.data?.ticket_id) navigate(`/tickets/${t.data.ticket_id}`);
            dismissToast(t.id);
          }}
        >
          <span>{t.message}</span>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(t.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
