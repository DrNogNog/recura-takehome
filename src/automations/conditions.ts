import type { Condition, EventData } from "./types.js";

/** True when the event satisfies every condition (no conditions = always). */
export function matches(conditions: Condition[], data: EventData): boolean {
  return conditions.every((c) => test(c, data[c.field]));
}

function test({ op, value }: Condition, actual: string | number | undefined): boolean {
  if (actual === undefined) return false;
  if (op === "contains") return String(actual).toLowerCase().includes(String(value).toLowerCase());
  if (op === "eq") {
    return typeof actual === "number" ? actual === Number(value) : String(actual).toLowerCase() === String(value).toLowerCase();
  }
  const a = Number(actual);
  const b = Number(value);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
}

/**
 * Fills {{field}} placeholders from the event, and {{previous}} with the output of the
 * action before this one (e.g. the text Claude wrote). Unknown placeholders are left as-is.
 */
export function render(template: string, data: EventData, previous?: string): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key: string) => {
    if (key === "previous") return previous ?? "";
    const v = data[key];
    return v === undefined ? whole : String(v);
  });
}
