import client from "./client";

export const listTickets = (params) => client.get("/tickets/", { params }).then((r) => r.data);
export const getTicket = (id) => client.get(`/tickets/${id}/`).then((r) => r.data);
export const createTicket = (data) => client.post("/tickets/", data).then((r) => r.data);
export const updateTicket = (id, data) => client.patch(`/tickets/${id}/`, data).then((r) => r.data);
export const selfAssignTicket = (id) => client.post(`/tickets/${id}/self-assign/`).then((r) => r.data);

export const listComments = (ticketId) => client.get(`/tickets/${ticketId}/comments/`).then((r) => r.data);
export const addComment = (ticketId, data) => client.post(`/tickets/${ticketId}/comments/`, data).then((r) => r.data);

export const listAttachments = (ticketId) => client.get(`/tickets/${ticketId}/attachments/`).then((r) => r.data);
export const uploadAttachment = (ticketId, file) => {
  const form = new FormData();
  form.append("file", file);
  return client
    .post(`/tickets/${ticketId}/attachments/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export const getAuditLog = (ticketId) =>
  client.get(`/tickets/${ticketId}/audit/`).then((r) => (Array.isArray(r.data) ? r.data : r.data.results || []));
export const getAnalytics = () => client.get("/analytics/summary/").then((r) => r.data);
export const listAgents = () => client.get("/auth/agents/").then((r) => r.data);