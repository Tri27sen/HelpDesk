import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, LabelList,
} from "recharts";
import { getAnalytics } from "../api/tickets";

const STATUS_COLORS = {
  open: "#5c7c93",
  in_progress: "#b07f0a",
  on_hold: "#a89a78",
  resolved: "#7f9d52",
  closed: "#8c866f",
};
const STATUS_LABELS = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  resolved: "Resolved",
  closed: "Closed",
};
const PRIORITY_COLORS = { low: "#7f9d52", medium: "#5c7c93", high: "#b07f0a", urgent: "#ea5a45" };

export default function AnalyticsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    getAnalytics().then(setData);
    const interval = setInterval(() => getAnalytics().then(setData), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return <div className="page">Loading analytics…</div>;

  const statusOrder = ["open", "in_progress", "on_hold", "resolved", "closed"];
  const statusData = statusOrder.map((key) => ({ name: STATUS_LABELS[key], key, value: data.by_status[key] || 0 }));
  const priorityData = Object.entries(data.by_priority).map(([name, value]) => ({ name, value }));
  const dailyData = data.daily_created.map((d) => ({ day: d.day.slice(5), count: d.c }));

  return (
    <div className="page">
      <h1>Analytics</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 22 }}>
        {data.total_tickets} tickets created in total — a full breakdown of what's open, resolved, closed, and who
        closed them is below.
      </p>

      {/* Explicit count for every single status, so nothing is left ambiguous */}
      <h3>Tickets by status</h3>
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value">{data.total_tickets}</div>
          <div className="stat-label">Total created</div>
        </div>
        {statusOrder.map((key) => (
          <div className="stat-card" key={key}>
            <div className="stat-value" style={{ color: STATUS_COLORS[key] }}>{data.by_status[key] || 0}</div>
            <div className="stat-label">{STATUS_LABELS[key]}</div>
          </div>
        ))}
      </div>

      <h3>Other metrics</h3>
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value">{data.active_tickets}</div>
          <div className="stat-label">Active (open + in progress + on hold)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.avg_resolution_hours ?? "—"}h</div>
          <div className="stat-label">Avg resolution time</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-value">{data.sla_breached_count}</div>
          <div className="stat-label">SLA breaches</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Tickets by status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={2}
              >
                {statusData.map((entry) => (
                  <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [`${value} tickets`, name]} />
              <Legend
                verticalAlign="bottom"
                formatter={(value, entry) => `${value}: ${entry.payload.value}`}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Tickets by priority</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={priorityData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(value) => [`${value} tickets`, "Count"]} />
              <Bar dataKey="value">
                <LabelList dataKey="value" position="top" />
                {priorityData.map((entry) => (
                  <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card wide">
          <h3>Tickets created (last 14 days)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(value) => [`${value} tickets`, "Created"]} />
              <Line type="monotone" dataKey="count" stroke="#c1440e" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card wide">
          <h3>Who closed how many tickets</h3>
          {data.agent_breakdown.length === 0 ? (
            <div className="empty-state">No tickets have been assigned to an agent yet.</div>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Total assigned</th>
                  <th>Still open / in progress / on hold</th>
                  <th>Resolved</th>
                  <th>Closed</th>
                </tr>
              </thead>
              <tbody>
                {data.agent_breakdown.map((a) => (
                  <tr key={a.agent_id}>
                    <td><strong>{a.agent}</strong></td>
                    <td>{a.total}</td>
                    <td>{a.open}</td>
                    <td style={{ color: STATUS_COLORS.resolved }}>{a.resolved}</td>
                    <td style={{ color: STATUS_COLORS.closed, fontWeight: 700 }}>{a.closed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}