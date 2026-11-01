import { useCallback, useState } from "react";
import { api, download, fmtDateTime, timeAgo } from "../../api";
import { ErrorNote, MenuSelect, Spinner, Stat } from "../../components";
import { useAction, usePolling } from "../../hooks";
import { ActivityFeed } from "./ActivityFeed";
import type { Run } from "./types";

interface Report {
  totals: { runs: number; succeeded: number; partial: number; failed: number; popups: number; aiSteps: number; firstRunAt: string | null; lastRunAt: string | null };
  byPart: Array<{ part: string; label: string; runs: number; failed: number }>;
  byRule: Array<{ ruleId: string; ruleName: string; trigger: string; part: string; runs: number; failed: number; lastRunAt: string }>;
  runs: Run[];
}

const PART_OPTIONS = [
  { id: "", label: "All parts" },
  { id: "appointments", label: "Patient appointments" },
  { id: "supplies", label: "Restock medical supplies" },
  { id: "food", label: "Food recommendations" },
];
const STATUS_OPTIONS = [
  { id: "", label: "Any result" },
  { id: "succeeded", label: "Done" },
  { id: "partial", label: "Some steps failed" },
  { id: "failed", label: "Failed" },
];

/** History (hamburger menu): a report of every past automation run, with filters and a CSV export. */
export function HistoryWorkflow({ onReady }: { onReady: () => void }) {
  const [part, setPart] = useState("");
  const [status, setStatus] = useState("");
  const [tests, setTests] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const query = new URLSearchParams({ ...(part && { part }), ...(status && { status }), ...(tests && { tests: "1" }) }).toString();
  const load = useCallback(async () => {
    try {
      setReport(await api<Report>(`/api/automations/history${query ? `?${query}` : ""}`));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [query]);
  usePolling(load, onReady, 10_000);

  const t = report?.totals;
  const successRate = t && t.runs ? Math.round((t.succeeded / t.runs) * 100) : null;

  return (
    <div className="stack-lg">
      <section className="card wide" aria-labelledby="history-title">
        <div className="card-head">
          <div>
            <h2 id="history-title">Automation history</h2>
            <p className="muted small">
              {t?.runs ? `${t.runs} runs from ${fmtDateTime(t.firstRunAt ?? undefined)} to ${fmtDateTime(t.lastRunAt ?? undefined)}` : "Every run of your automations, newest first."}
            </p>
          </div>
          <button
            className="btn"
            disabled={busy === "csv" || !t?.runs}
            onClick={() => run("csv", () => download(`/api/automations/history.csv${query ? `?${query}` : ""}`, `recura-automation-history-${new Date().toISOString().slice(0, 10)}.csv`))}
          >
            {busy === "csv" && <Spinner />} Export CSV
          </button>
        </div>

        <div className="history-filters">
          <MenuSelect ariaLabel="Part" size="sm" value={part} onChange={setPart} options={PART_OPTIONS} />
          <MenuSelect ariaLabel="Result" size="sm" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <label className="check">
            <input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} /> Include test runs
          </label>
        </div>
        <ErrorNote error={loadError ?? error} />

        {t && (
          <div className="stats">
            <Stat label="Runs" value={t.runs} sub={t.lastRunAt ? `last ${timeAgo(t.lastRunAt)}` : "none yet"} />
            <Stat label="Succeeded" value={successRate === null ? "—" : `${successRate}%`} sub={`${t.succeeded} done · ${t.partial + t.failed} with failures`} />
            <Stat label="Pop-ups sent" value={t.popups} />
            <Stat label="Claude steps" value={t.aiSteps} />
          </div>
        )}

        {report && report.byRule.length > 0 && (
          <div className="history-tables">
            <div>
              <h3 className="section-label">By part</h3>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="num">Runs</th>
                    <th className="num">With failures</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byPart.map((p) => (
                    <tr key={p.part}>
                      <td>{p.label}</td>
                      <td className="num">{p.runs}</td>
                      <td className="num">{p.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="section-label">By automation</h3>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Automation</th>
                    <th>Trigger</th>
                    <th className="num">Runs</th>
                    <th>Last ran</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byRule.map((r) => (
                    <tr key={r.ruleId}>
                      <td>
                        <strong>{r.ruleName}</strong>
                        <div className="muted small">{r.part}</div>
                      </td>
                      <td>{r.trigger}</td>
                      <td className="num">
                        {r.runs}
                        {r.failed > 0 && <div className="warn-text small">{r.failed} with failures</div>}
                      </td>
                      <td>{timeAgo(r.lastRunAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="card wide" aria-labelledby="history-runs">
        <h2 id="history-runs">Every run</h2>
        {report && <ActivityFeed runs={report.runs} />}
      </section>
    </div>
  );
}
