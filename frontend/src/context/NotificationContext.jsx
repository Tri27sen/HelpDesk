import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { getTokens } from "../api/client";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
const NotificationContext = createContext(null);

const LABELS = {
  ticket_created: (d) => `New ticket #${d.ticket_id}: ${d.title}`,
  ticket_assigned: (d) => `Ticket #${d.ticket_id} assigned to you: ${d.title}`,
  status_changed: (d) => `Ticket #${d.ticket_id} status changed to ${d.status}`,
  new_comment: (d) => `New reply on ticket #${d.ticket_id}: ${d.title}`,
  sla_breached: (d) => `⚠️ SLA breached on ticket #${d.ticket_id}: ${d.title}`,
};

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [toasts, setToasts] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const pushToast = useCallback((type, data) => {
    const id = Math.random().toString(36).slice(2);
    const message = LABELS[type] ? LABELS[type](data) : `Update: ${type}`;
    setToasts((prev) => [...prev, { id, type, data, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!user) {
      wsRef.current?.close();
      return;
    }

    let cancelled = false;

    function connect() {
      const { access } = getTokens();
      if (!access) return;
      const ws = new WebSocket(`${WS_URL}/ws/notifications/?token=${access}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === "connected") return;
        pushToast(msg.type, msg.data);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [user, pushToast]);

  return (
    <NotificationContext.Provider value={{ toasts, dismissToast, connected }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
