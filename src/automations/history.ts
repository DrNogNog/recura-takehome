import { TRIGGERS } from "./triggers.js";
import type { Run, TriggerType } from "./types.js";

export type Part = "appointments" | "supplies" | "food";

export const PARTS: Record<Part, string> = {
  appointments: "Patient appointments",
  supplies: "Restock medical supplies",
  food: "Food recommendations",
};

export const partOf = (trigger: TriggerType): Part =>
  trigger.startsWith("appointment.") ? "appointments" : trigger.startsWith("supply.") ? "supplies" : "food";

export interface HistoryFilter {
  part?: Part;
  status?: Run["status"];
  /** Test runs (sample data) are left out unless asked for. */
  includeTests?: boolean;
}

/** Reads the report filters from a query string, ignoring anything unrecognized. */
export function parseFilter(q: Record<string, unknown>): HistoryFilter {
  const part = typeof q.part === "string" && q.part in PARTS ? (q.part as Part) : undefined;
  const status = ["succeeded", "partial", "failed"].includes(String(q.status)) ? (q.status as Run["status"]) : undefined;
  return { part, status, includeTests: q.tests === "1" || q.tests === "true" };
}

export const applyFilter = (runs: Run[], f: HistoryFilter) =>
  runs.filter((r) => (f.includeTests || !r.test) && (!f.part || partOf(r.trigger) === f.part) && (!f.status || r.status === f.status));

/** A report of past automation runs: totals, a breakdown by part and by rule, and every run. */
export function buildReport(runs: Run[]) {
  const steps = runs.flatMap((r) => r.actions);
  const count = (status: Run["status"]) => runs.filter((r) => r.status === status).length;

  const byPart = (Object.keys(PARTS) as Part[]).map((part) => {
    const mine = runs.filter((r) => partOf(r.trigger) === part);
    return { part, label: PARTS[part], runs: mine.length, failed: mine.filter((r) => r.status !== "succeeded").length };
  });

  const rules = new Map<string, { ruleId: string; ruleName: string; trigger: string; part: string; runs: number; failed: number; lastRunAt: string }>();
  for (const r of runs) {
    const row = rules.get(r.ruleId) ?? {
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      trigger: TRIGGERS[r.trigger]?.label ?? r.trigger,
      part: PARTS[partOf(r.trigger)],
      runs: 0,
      failed: 0,
      lastRunAt: r.startedAt,
    };
    row.runs++;
    if (r.status !== "succeeded") row.failed++;
    if (r.startedAt > row.lastRunAt) row.lastRunAt = r.startedAt;
    rules.set(r.ruleId, row);
  }

  return {
    totals: {
      runs: runs.length,
      succeeded: count("succeeded"),
      partial: count("partial"),
      failed: count("failed"),
      popups: steps.reduce((n, s) => n + (s.sentTo?.length ?? 0), 0),
      aiSteps: steps.filter((s) => s.type === "ai").length,
      firstRunAt: runs.at(-1)?.startedAt ?? null,
      lastRunAt: runs[0]?.startedAt ?? null,
    },
    byPart,
    byRule: [...rules.values()].sort((a, b) => b.runs - a.runs || a.ruleName.localeCompare(b.ruleName)),
    runs,
  };
}

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The same runs as a spreadsheet: one row per run. */
export function historyCsv(runs: Run[]): string {
  const header = ["Started", "Automation", "Part", "Trigger", "What happened", "Status", "Test run", "Steps", "Pop-ups sent to"];
  const rows = runs.map((r) => [
    r.startedAt,
    r.ruleName,
    PARTS[partOf(r.trigger)],
    TRIGGERS[r.trigger]?.label ?? r.trigger,
    r.summary,
    r.status,
    r.test ? "yes" : "no",
    r.actions.map((a) => `${a.ok ? "✓" : "✗"} ${a.label}: ${a.output}`).join(" | "),
    [...new Set(r.actions.flatMap((a) => a.sentTo ?? []))].join(", "),
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\n");
}
