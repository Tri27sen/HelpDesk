import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTicket } from "../api/tickets";

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ticket = await createTicket({ title, description, priority });
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      const data = err.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Failed to create ticket.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page narrow">
      <h1>New Ticket</h1>
      <form className="card-form" onSubmit={handleSubmit}>
        {error && <div className="alert-error">{error}</div>}
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={255} autoFocus />
        </label>
        <label>
          Description
          <textarea
            rows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="Describe the issue in detail — steps to reproduce, what you expected, screenshots you'll attach, etc."
          />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low — response within 72h</option>
            <option value="medium">Medium — response within 24h</option>
            <option value="high">High — response within 8h</option>
            <option value="urgent">Urgent — response within 4h</option>
          </select>
        </label>
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Submitting…" : "Submit Ticket"}
        </button>
      </form>
    </div>
  );
}
