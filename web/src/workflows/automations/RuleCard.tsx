import { useState } from "react";
import { timeAgo } from "../../api";
import { IconPlay, IconSparkle, Spinner } from "../../components";
import { OPERATORS, type Catalog, type Rule } from "./types";

/** One rule as a readable sentence (When … only if … → Then 1, 2, 3) with its controls. */
export function RuleCard({
  rule,
  catalog,
  busy,
  onToggle,
  onTest,
  onEdit,
  onDelete,
}: {
  rule: Rule;
  catalog: Catalog;
  busy: string | null;
  onToggle: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const trigger = catalog.triggers.find((t) => t.type === rule.trigger.type);
  const fieldLabel = (key: string) => trigger?.fields.find((f) => f.key === key)?.label.toLowerCase() ?? key;

  return (
    <li className={`rule-card ${rule.enabled ? "" : "off"}`}>
      <div className="rule-card-head">
        <h3>{rule.name}</h3>
        <label className="switch">
          <input type="checkbox" checked={rule.enabled} onChange={onToggle} disabled={busy === `toggle-${rule.id}`} />
          <span aria-hidden="true" />
          <span className="sr-only">Turn {rule.name} {rule.enabled ? "off" : "on"}</span>
        </label>
      </div>

      <div className="rule-flow">
        <p>
          <span className="rule-step-tag when">When</span> {trigger?.label ?? rule.trigger.type}
          {rule.trigger.conditions.map((c, i) => (
            <span key={i} className="muted">
              {i === 0 ? ", only if " : " and "}
              {fieldLabel(c.field)} {OPERATORS[c.op]} <strong>{String(c.value)}</strong>
            </span>
          ))}
        </p>
        <p className="rule-then">
          <span className="rule-step-tag then">Then</span>
          {rule.actions.map((a, i) => {
            const def = catalog.actions.find((x) => x.type === a.type);
            return (
              <span key={i} className={`rule-chip ${def?.ai ? "ai" : ""}`}>
                {def?.ai && <IconSparkle size={13} />}
                {i + 1}. {def?.label ?? a.type}
              </span>
            );
          })}
        </p>
      </div>

      <div className="rule-card-foot">
        <span className="muted small">{rule.lastRunAt ? `Last ran ${timeAgo(rule.lastRunAt)}` : "Hasn't run yet"}</span>
        <span className="row gap">
          <button className="btn small" onClick={onTest} disabled={busy === `test-${rule.id}`}>
            {busy === `test-${rule.id}` ? <Spinner /> : <IconPlay size={13} />} Test run
          </button>
          <button className="btn small" onClick={onEdit}>
            Edit
          </button>
          {confirming ? (
            <>
              <button className="btn small danger" onClick={onDelete}>
                Confirm delete
              </button>
              <button className="btn small ghost" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="btn small ghost" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </span>
      </div>
    </li>
  );
}
