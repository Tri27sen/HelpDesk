import { useEffect, useRef, useState, useCallback } from "react";
import { getTokens } from "../api/client";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

export function useTicketSocket(ticketId, handlers) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const sendTyping = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing" }));
    }
  }, []);

  useEffect(() => {
    if (!ticketId) return;
    const { access } = getTokens();
    if (!access) return;

    let cancelled = false;
    let reconnectTimer = null;
    let ws;

    function connect() {
      ws = new WebSocket(`${WS_URL}/ws/tickets/${ticketId}/?token=${access}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        const fn = handlersRef.current?.[msg.type];
        if (fn) fn(msg.data);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [ticketId]);

  return { connected, sendTyping };
}
