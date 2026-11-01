import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { AppDialog, ErrorNote, IconSparkle, IconX, MenuSelect, Spinner } from "../../components";
import { useAction } from "../../hooks";
import { actionsForTrigger, OPERATORS, optionsFor, opsFor, type ActionStep, type Catalog, type Condition, type Rule, type RuleInput } from "./types";

type Draft = {
  name: string;
  triggerType: string;
  conditions: Array<{ field: string; op: Condition["op"]; value: string }>;
  actions: Array<{ type: string; params: Record<string, string> }>;
  cooldownMinutes: string;
};

const toDraft = (r: RuleInput): Draft => ({
  name: r.name,
  triggerType: r.trigger.type,
  conditions: r.trigger.conditions.map((c) => ({ ...c, value: String(c.value) })),
  actions: r.actions.map((a) => ({ type: a.type, params: Object.fromEntries(Object.entries(a.params).map(([k, v]) => [k, String(v)])) })),
  cooldownMinutes: String(r.cooldownMinutes),
});

/** A new step with empty fields; choices start on their first option for this trigger. */
const blankAction = (catalog: Catalog, type: string, triggerType: string): Draft["actions"][number] => ({
  type,
  params: Object.fromEntries(
    (catalog.actions.find((a) => a.type === type)?.params ?? []).map((p) => [p.key, p.type === "choice" ? optionsFor(p, triggerType)[0]?.id ?? "" : ""])
  ),
});

/** Keeps a step's choices valid after the trigger changes (e.g. "My doctor" → "Me"). */
function fitChoices(catalog: Catalog, action: Draft["actions"][number], triggerType: string): Draft["actions"][number] {
  const def = catalog.actions.find((a) => a.type === action.type);
  const params = { ...action.params };
  for (const p of def?.params ?? []) {
    if (p.type !== "choice") continue;
    const options = optionsFor(p, triggerType);
    if (!options.some((o) => o.id === params[p.key])) params[p.key] = options[0]?.id ?? "";
  }
  return { ...action, params };
}

/** Create or edit a rule: When (trigger + conditions) → Then (ordered actions). */
export function RuleBuilder({
  catalog,
  rule,
  template,
  onClose,
  onSaved,
}: {
  catalog: Catalog;
  rule?: Rule;
  template?: RuleInput;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [d, setD] = useState<Draft>(() => {
    const start = rule ?? template;
    if (start) return toDraft(start);
    const trigger = catalog.triggers[0];
    return { name: "", triggerType: trigger.type, conditions: [], actions: [blankAction(catalog, "notify", trigger.type)], cooldownMinutes: "60" };
  });
  const { busy, error, run } = useAction();
  const trigger = catalog.triggers.find((t) => t.type === d.triggerType)!;
  const available = actionsForTrigger(catalog, d.triggerType);
  const update = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  function changeTrigger(type: string) {
    const fields = new Set(catalog.triggers.find((t) => t.type === type)?.fields.map((f) => f.key));
    const allowed = new Set(actionsForTrigger(catalog, type).map((a) => a.type));
    const actions = d.actions.filter((a) => allowed.has(a.type)).map((a) => fitChoices(catalog, a, type));
    update({
      triggerType: type,
      conditions: d.conditions.filter((c) => fields.has(c.field)),
      actions: actions.length ? actions : [blankAction(catalog, "notify", type)],
    });
  }

  const setCondition = (i: number, patch: Partial<Draft["conditions"][number]>) =>
    update({ conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setAction = (i: number, next: Draft["actions"][number]) => update({ actions: d.actions.map((a, j) => (j === i ? next : a)) });

  function moveAction(i: number, by: -1 | 1) {
    const actions = [...d.actions];
    [actions[i], actions[i + by]] = [actions[i + by], actions[i]];
    update({ actions });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Omit<RuleInput, "enabled"> = {
      name: d.name,
      trigger: {
        type: d.triggerType,
        conditions: d.conditions.map((c) => {
          const numeric = trigger.fields.find((f) => f.key === c.field)?.type === "number";
          return { field: c.field, op: c.op, value: numeric ? Number(c.value) : c.value };
        }),
      },
      actions: d.actions.map((a): ActionStep => {
        const def = catalog.actions.find((x) => x.type === a.type);
        return { type: a.type, params: Object.fromEntries((def?.params ?? []).map((p) => [p.key, p.type === "number" ? Number(a.params[p.key]) : (a.params[p.key] ?? "")])) };
      }),
      cooldownMinutes: Number(d.cooldownMinutes),
    };
    const ok = await run("save", () =>
      rule ? api(`/api/automations/${rule.id}`, { method: "PATCH", json: body }) : api("/api/automations", { method: "POST", json: { ...body, enabled: true } })
    );
    if (ok) onSaved(rule ? `Saved ${d.name.trim()}.` : `Created ${d.name.trim()}. It runs the next time this happens.`);
  }

  const placeholders = [...trigger.fields.map((f) => f.key), "previous"];

  return (
    <AppDialog title={rule ? `Edit ${rule.name}` : "New automation"} onClose={onClose} maxWidth="md">
      <form onSubmit={submit} className="rule-form">
        <label className="rule-name">
          Name
          <input value={d.name} onChange={(e) => update({ name: e.target.value })} maxLength={80} placeholder="e.g. Reorder gloves" required autoFocus />
        </label>

        <section className="rule-section" aria-labelledby="when-label">
          <h3 id="when-label">
            <span className="rule-step-tag when">When</span> this happens
          </h3>
          <MenuSelect
            ariaLabel="Trigger"
            size="sm"
            value={d.triggerType}
            onChange={changeTrigger}
            options={catalog.triggers.map((t) => ({ id: t.type, label: t.label, description: t.description }))}
          />
          {trigger.scope === "portal" && <p className="muted small">Clinic-wide: runs when anyone's change causes it.</p>}

          {d.conditions.map((c, i) => {
            const field = trigger.fields.find((f) => f.key === c.field);
            return (
              <div className="rule-row" key={i}>
                <span className="rule-joiner">{i === 0 ? "Only if" : "and"}</span>
                <MenuSelect
                  ariaLabel={`Condition ${i + 1} field`}
                  size="sm"
                  value={c.field}
                  onChange={(key) => {
                    const f = trigger.fields.find((x) => x.key === key);
                    setCondition(i, { field: key, op: opsFor(f)[0], value: "" });
                  }}
                  options={trigger.fields.map((f) => ({ id: f.key, label: f.label }))}
                />
                <MenuSelect
                  ariaLabel={`Condition ${i + 1} comparison`}
                  size="sm"
                  value={c.op}
                  onChange={(op) => setCondition(i, { op: op as Condition["op"] })}
                  options={opsFor(field).map((op) => ({ id: op, label: OPERATORS[op] }))}
                />
                <input
                  aria-label={`Condition ${i + 1} value`}
                  type={field?.type === "number" ? "number" : "text"}
                  step="any"
                  value={c.value}
                  onChange={(e) => setCondition(i, { value: e.target.value })}
                  maxLength={100}
                  required
                />
                <button type="button" className="btn ghost small" aria-label={`Remove condition ${i + 1}`} onClick={() => update({ conditions: d.conditions.filter((_, j) => j !== i) })}>
                  <IconX size={16} />
                </button>
              </div>
            );
          })}
          {d.conditions.length < 5 && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                const f = trigger.fields[0];
                update({ conditions: [...d.conditions, { field: f.key, op: opsFor(f)[0], value: "" }] });
              }}
            >
              + Add condition
            </button>
          )}
        </section>

        <section className="rule-section" aria-labelledby="then-label">
          <h3 id="then-label">
            <span className="rule-step-tag then">Then</span> do these, in order
          </h3>
          <ol className="rule-actions">
            {d.actions.map((a, i) => {
              const def = catalog.actions.find((x) => x.type === a.type);
              return (
                <li key={i} className={`rule-action ${def?.ai ? "ai" : ""}`}>
                  <div className="rule-action-head">
                    <span className="rule-action-num">{i + 1}</span>
                    <MenuSelect
                      ariaLabel={`Action ${i + 1}`}
                      size="sm"
                      value={a.type}
                      onChange={(type) => setAction(i, blankAction(catalog, type, d.triggerType))}
                      options={available.map((x) => ({ id: x.type, label: x.label, description: x.description, icon: x.ai ? <IconSparkle size={16} /> : undefined }))}
                    />
                    <span className="rule-action-tools">
                      <button type="button" className="btn ghost small" aria-label={`Move action ${i + 1} up`} disabled={i === 0} onClick={() => moveAction(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="btn ghost small" aria-label={`Move action ${i + 1} down`} disabled={i === d.actions.length - 1} onClick={() => moveAction(i, 1)}>
                        ↓
                      </button>
                      <button type="button" className="btn ghost small" aria-label={`Remove action ${i + 1}`} disabled={d.actions.length === 1} onClick={() => update({ actions: d.actions.filter((_, j) => j !== i) })}>
                        <IconX size={16} />
                      </button>
                    </span>
                  </div>
                  {def?.ai && !catalog.aiEnabled && <p className="muted small">Claude is off on this server, so this step writes a plain summary instead.</p>}
                  {def?.params.map((p) =>
                    p.type === "choice" ? (
                      <div key={p.key} className="rule-param">
                        <span id={`p-${i}-${p.key}`}>{p.label}</span>
                        <MenuSelect
                          labelId={`p-${i}-${p.key}`}
                          size="sm"
                          value={a.params[p.key] ?? ""}
                          onChange={(v) => setAction(i, { ...a, params: { ...a.params, [p.key]: v } })}
                          options={optionsFor(p, d.triggerType).map((o) => ({ id: o.id, label: o.label }))}
                        />
                      </div>
                    ) : (
                    <label key={p.key} className="rule-param">
                      {p.label}
                      {p.type === "longtext" ? (
                        <textarea rows={2} value={a.params[p.key] ?? ""} maxLength={p.maxLength} placeholder={p.placeholder} required onChange={(e) => setAction(i, { ...a, params: { ...a.params, [p.key]: e.target.value } })} />
                      ) : (
                        <input
                          type={p.type === "number" ? "number" : "text"}
                          min={p.min}
                          max={p.max}
                          value={a.params[p.key] ?? ""}
                          placeholder={p.placeholder}
                          required
                          onChange={(e) => setAction(i, { ...a, params: { ...a.params, [p.key]: e.target.value } })}
                        />
                      )}
                    </label>
                    )
                  )}
                </li>
              );
            })}
          </ol>
          {d.actions.length < 5 && (
            <button type="button" className="btn small" onClick={() => update({ actions: [...d.actions, blankAction(catalog, "notify", d.triggerType)] })}>
              + Add action
            </button>
          )}
          <p className="muted small rule-placeholders">
            Use in messages:{" "}
            {placeholders.map((p) => (
              <code key={p}>{`{{${p}}}`}</code>
            ))}
          </p>
        </section>

        <label className="rule-cooldown">
          Don't repeat for the same {trigger.scope === "portal" ? "item" : "event"} within
          <span>
            <input type="number" min={0} max={10080} step={1} value={d.cooldownMinutes} onChange={(e) => update({ cooldownMinutes: e.target.value })} required /> minutes
          </span>
        </label>

        <ErrorNote error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy === "save"}>
            {busy === "save" && <Spinner />} {rule ? "Save changes" : "Create automation"}
          </button>
        </div>
      </form>
    </AppDialog>
  );
}
