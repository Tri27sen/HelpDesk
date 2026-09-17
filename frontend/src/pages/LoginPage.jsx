import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/tickets");
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <h1>Track Tickets</h1>
        <p>Add a supporting line that complements your statement above.</p>
        <Link to="/register" className="auth-learnmore">Learn More</Link>
      </div>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand-row">
          <span className="logo">🎫</span>
          <h2>Sign in to Helpdesk</h2>
        </div>
        <p className="auth-subtitle">Welcome back — enter your details below.</p>

        {error && <div className="alert-error">{error}</div>}

        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Submit"}
        </button>

        <p className="auth-footer">
          No account? <Link to="/register">Register</Link>
        </p>
        <div className="demo-hint">
          Demo logins: <code>admin/admin123</code> · <code>agent1/agent123</code> · <code>customer1/customer123</code>
        </div>
      </form>
    </div>
  );
}