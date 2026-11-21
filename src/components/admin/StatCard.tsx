import type { ReactNode } from "react";

// A dashboard figure in the Metis style: icon tile, small uppercase label, large value, optional delta or hint.
// Server-safe (no hooks). `tone` colours the delta line only; the value itself stays neutral.
export default function StatCard({ icon, label, value, hint, delta, tone }: {
  icon?: ReactNode; label: string; value: ReactNode; hint?: ReactNode; delta?: string; tone?: "good" | "bad" | "neutral";
}) {
  return <div className="am-card am-stat">
    {icon && <span className="am-stat-icon" aria-hidden="true">{icon}</span>}
    <div className="min-w-0">
      <p className="am-stat-label">{label}</p>
      <p className="am-stat-value">{value}</p>
      {delta && <p className={`am-delta ${tone === "good" ? "good" : tone === "bad" ? "bad" : ""}`}>{delta}</p>}
      {hint && !delta && <p className="am-delta">{hint}</p>}
    </div>
  </div>;
}
