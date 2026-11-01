import { useCallback, useState } from "react";
import { api } from "../../api";
import { ErrorNote, IconSparkle, StatusMessage, Tabs } from "../../components";
import { useAction, usePolling } from "../../hooks";
import { ActivityFeed } from "./ActivityFeed";
import { RuleBuilder } from "./RuleBuilder";
import { RuleCard } from "./RuleCard";
import type { Catalog, Rule, RuleInput, Run } from "./types";

type Tab = "rules" | "activity";
type Editing = { rule?: Rule; template?: RuleInput } | null;

/** Automations workflow: build rules (trigger → actions) and watch what they did. */
export function AutomationsWorkflow({ onReady }: { onReady: () => void }) {
  const [tab, setTab] = useState<Tab>("rules");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, notice, run, setNotice } = useAction();

  const load = useCallback(async () => {
    try {
      const [c, r, a] = await Promise.all([
        catalog ? Promise.resolve(catalog) : api<Catalog>("/api/automations/catalog"),
        api<{ rules: Rule[] }>("/api/automations"),
        api<{ runs: Run[] }>("/api/automations/runs"),
      ]);
      setCatalog(c);
      setRules(r.rules);
      setRuns(a.runs);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [catalog]);
  // Rules run in the background when their trigger happens, so keep the activity fresh.
  const reload = usePolling(load, onReady, 5000);

  async function toggle(rule: Rule) {
    const ok = await run(`toggle-${rule.id}`, () => api(`/api/automations/${rule.id}`, { method: "PATCH", json: { enabled: !rule.enabled } }), `${rule.name} is ${rule.enabled ? "off" : "on"}.`);
    if (ok) await reload();
  }

  async function test(rule: Rule) {
    const r = await run(`test-${rule.id}`, () => api<{ run: Run }>(`/api/automations/${rule.id}/test`, { method: "POST", json: {} }), "Test run finished. See the result in Activity.");
    if (r) {
      await reload();
      setTab("activity");
    }
  }

  async function remove(rule: Rule) {
    const ok = await run(`delete-${rule.id}`, () => api(`/api/automations/${rule.id}`, { method: "DELETE" }).then(() => true), `Deleted ${rule.name}.`);
    if (ok) await reload();
  }

  async function saved(msg: string) {
    setEditing(null);
    setNotice(msg);
    await reload();
  }

  const unused = catalog?.templates.filter((t) => !rules.some((r) => r.name === t.name)) ?? [];

  return (
    <section className="card wide" aria-labelledby="auto-title">
      <div className="card-head">
        <div>
          <h2 id="auto-title">Automations</h2>
          <p className="muted small">When something happens, Recura runs your steps automatically, in order.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({})} disabled={!catalog}>
          + New automation
        </button>
      </div>

      <Tabs items={{ rules: `My automations (${rules.length})`, activity: `Activity (${runs.length})` }} value={tab} onChange={setTab} label="Automations" />
      <StatusMessage notice={notice} error={error} />
      <ErrorNote error={loadError} />

      {tab === "rules" && catalog && (
        <div className="stack">
          {rules.length > 0 ? (
            <ul className="rule-list">
              {rules.map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  catalog={catalog}
                  busy={busy}
                  onToggle={() => toggle(r)}
                  onTest={() => test(r)}
                  onEdit={() => setEditing({ rule: r })}
                  onDelete={() => remove(r)}
                />
              ))}
            </ul>
          ) : (
            <p className="muted">No automations yet. Start from a template below, or build your own.</p>
          )}

          {unused.length > 0 && (
            <div>
              <h3 className="section-label">Start from a template</h3>
              <ul className="template-list">
                {unused.map((t) => (
                  <li key={t.name}>
                    <button className="template-card" onClick={() => setEditing({ template: t })}>
                      <strong>{t.name}</strong>
                      <span className="muted small">{catalog.triggers.find((x) => x.type === t.trigger.type)?.label}</span>
                      {t.actions.some((a) => catalog.actions.find((x) => x.type === a.type)?.ai) && (
                        <span className="pill">
                          <IconSparkle size={12} /> Uses Claude
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "activity" && <ActivityFeed runs={runs} />}

      {editing && catalog && <RuleBuilder catalog={catalog} rule={editing.rule} template={editing.template} onClose={() => setEditing(null)} onSaved={saved} />}
    </section>
  );
}
