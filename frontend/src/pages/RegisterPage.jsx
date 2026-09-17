import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "customer" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      navigate("/tickets");
    } catch (err) {
      const data = err.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <h1>Get Support</h1>
        <p>Create an account to open tickets, chat with agents in real time, and track every reply.</p>
        <Link to="/login" className="auth-learnmore">Already a member?</Link>
      </div>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand-row">
          <span className="logo">🎫</span>
          <h2>Create your account</h2>
        </div>
        <p className="auth-subtitle">Ask a simple question, we'll take it from there.</p>

        {error && <div className="alert-error">{error}</div>}

        <label>
          Username
          <input value={form.username} onChange={(e) => update("username", e.target.value)} required autoFocus />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
            minLength={6}
          />
        </label>
        <label>
          I am a…
          <select value={form.role} onChange={(e) => update("role", e.target.value)}>
            <option value="customer">Customer (need support)</option>
            <option value="agent">Support Agent</option>
            <option value="admin">Manager (assigns &amp; oversees tickets)</option>
          </select>
        </label>

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Submit"}
        </button>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}