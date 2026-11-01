import { fmtDateTime } from "../../api";
import type { Run } from "./types";

const STATUS: Record<Run["status"], { label: string; cls: string }> = {
  succeeded: { label: "Done", cls: "ok" },
  partial: { label: "Some steps failed", cls: "warn" },
  failed: { label: "Failed", cls: "warn" },
};

/** Every run of the user's automations, newest first, with each step's result. */
export function ActivityFeed({ runs }: { runs: Run[] }) {
  if (!runs.length) {
    return <p className="muted">Nothing has run yet. Use Test run on an automation, or wait for its trigger to happen.</p>;
  }
  return (
    <ol className="activity">
      {runs.map((r) => (
        <li key={r.id} className="activity-item">
          <div className="activity-head">
            <strong>{r.ruleName}</strong>
            {r.test && <span className="pill">Test</span>}
            <span className={`badge ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
            <span className="muted small activity-time">{fmtDateTime(r.startedAt)}</span>
          </div>
          <p className="muted small activity-summary">{r.summary}</p>
          <ul className="activity-steps">
            {r.actions.map((a, i) => (
              <li key={i} className={`${a.ok ? "ok" : "failed"} ${a.type === "ai" ? "ai" : ""} ${a.type === "notify" ? "notify" : ""}`}>
                <span aria-label={a.ok ? "Done" : "Failed"}>{a.ok ? "✓" : "✗"}</span>
                <div>
                  <span className="activity-step-label">{a.label}</span>
                  <p>{a.output}</p>
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
