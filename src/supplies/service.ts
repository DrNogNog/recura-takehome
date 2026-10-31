import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { onLeader } from "../lib/leader.js";
import { MemorySupplyRepo, PostgresSupplyRepo } from "./repos.js";
import type { ExpenseLabel, HistoryEntry, SupplyItem, SupplyRepo } from "./types.js";

const DAY = 86_400_000;
const RATE_WINDOW_DAYS = 30;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString().slice(0, 10);

let repo: SupplyRepo;

export async function initSupplies() {
  repo = config.suppliesStore === "external" ? await PostgresSupplyRepo.connect() : new MemorySupplyRepo();
  if ((await repo.list()).length === 0) await seed();
  onLeader(recomputeReorderDates, 60 * 60_000);
}

async function seed() {
  const raw: Array<Partial<SupplyItem>> = JSON.parse(readFileSync("seed/supplies.json", "utf8"));
  const now = new Date();
  for (const [i, s] of raw.entries()) {
    const item = {
      expenseLabel: "business_expense",
      isEstimate: false,
      isUnorganized: false,
      ...s,
      id: `sup-${i + 1}`,
      updatedAt: now.toISOString(),
      version: 1,
    } as SupplyItem;
    await repo.insert(item);
    if (!item.consumable) continue;
    // A little usage history so consumption rates aren't empty on first run.
    for (let d = 1; d <= 14; d++) {
      const qty = Math.max(1, Math.round((item.reorderThreshold / 20) * (0.5 + ((d * (i + 3)) % 7) / 7)));
      await repo.addUsage({
        itemId: item.id,
        location: item.location,
        quantity: qty,
        usedAt: new Date(now.getTime() - d * DAY).toISOString(),
      });
    }
  }
}

/** Units consumed per day, per item and per location, over the last 30 days. */
export async function consumptionRates() {
  const since = new Date(Date.now() - RATE_WINDOW_DAYS * DAY).toISOString();
  const usage = await repo.usageSince(since);
  const items = new Map((await repo.list()).map((i) => [i.id, i]));
  const byKey = new Map<string, { itemId: string; itemName: string; location: string; unit: string; total: number }>();
  for (const u of usage) {
    const item = items.get(u.itemId);
    if (!item) continue;
    const key = `${u.itemId}|${u.location}`;
    const row = byKey.get(key) ?? { itemId: u.itemId, itemName: item.name, location: u.location, unit: item.unit, total: 0 };
    row.total += u.quantity;
    byKey.set(key, row);
  }
  return [...byKey.values()]
    .map((r) => ({ ...r, perDay: +(r.total / RATE_WINDOW_DAYS).toFixed(2), windowDays: RATE_WINDOW_DAYS }))
    .sort((a, b) => a.location.localeCompare(b.location) || b.perDay - a.perDay);
}

function dailyRateFor(itemId: string, rates: Awaited<ReturnType<typeof consumptionRates>>) {
  return rates.filter((r) => r.itemId === itemId).reduce((sum, r) => sum + r.perDay, 0);
}

/** Adds the computed fields the UI shows next to each stored item. */
function enrich(item: SupplyItem, rates: Awaited<ReturnType<typeof consumptionRates>>) {
  const perDay = dailyRateFor(item.id, rates);
  const daysOfStock = perDay > 0 ? Math.floor(item.quantity / perDay) : null;
  const endOfLife = addDays(item.purchaseDate, Math.round(item.avgLifespanMonths * 30.44));
  const needsSterilization =
    item.requiresSterilization &&
    (!item.lastSterilizedDate || (item.sterilizeAfterEachUse && !!item.lastUsedDate && item.lastUsedDate > item.lastSterilizedDate));
  return {
    ...item,
    consumptionPerDay: +perDay.toFixed(2),
    daysOfStock,
    endOfLifeDate: endOfLife,
    pastLifespan: endOfLife < today(),
    belowThreshold: item.quantity <= item.reorderThreshold,
    needsSterilization,
  };
}

export async function listSupplies() {
  const rates = await consumptionRates();
  const items = (await repo.list()).map((i) => enrich(i, rates)).sort((a, b) => a.name.localeCompare(b.name));
  const lastUpdated = items.map((i) => i.updatedAt).sort().at(-1);
  return { items, lastUpdated };
}

function diff(before: SupplyItem, after: SupplyItem) {
  const changes: HistoryEntry["changes"] = {};
  for (const key of Object.keys(after) as Array<keyof SupplyItem>) {
    if (key === "updatedAt" || key === "version") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = { from: before[key], to: after[key] };
  }
  return changes;
}

async function save(before: SupplyItem, patch: Partial<SupplyItem>, changedBy: string, action: HistoryEntry["action"]) {
  const after: SupplyItem = { ...before, ...patch, updatedAt: new Date().toISOString(), version: before.version + 1 };
  const changes = diff(before, after);
  if (Object.keys(changes).length === 0) return after;
  if (!(await repo.update(after, before.version))) {
    throw new HttpError(409, `${before.name} was changed by someone else, refresh and try again`);
  }
  await repo.addHistory({
    id: randomUUID(),
    itemId: after.id,
    itemName: after.name,
    action,
    changedBy,
    changedAt: after.updatedAt,
    changes,
  });
  return after;
}

const EDITABLE: Array<keyof SupplyItem> = [
  "name", "category", "location", "supplier", "consumable", "quantity", "unit", "reorderThreshold", "unitCost",
  "purchaseDate", "avgLifespanMonths", "lastUsedDate", "reorderDate", "expenseLabel", "isEstimate",
  "isUnorganized", "requiresSterilization", "sterilizeAfterEachUse", "lastSterilizedDate",
];
const LABELS: ExpenseLabel[] = ["business_expense", "capital_asset", "personal", "reimbursable"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (msg: string): never => {
  throw new HttpError(400, msg);
};
const text = (v: unknown, field: string, max: number, required = true) => {
  if (typeof v !== "string" || (required && !v.trim()) || v.length > max) bad(`${field} is required (up to ${max} characters)`);
  return (v as string).trim();
};
const num = (v: unknown, field: string, min: number, max: number) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) bad(`${field} must be a number from ${min} to ${max}`);
  return v as number;
};
const bool = (v: unknown, field: string) => (typeof v === "boolean" ? v : bad(`${field} must be true or false`));
const date = (v: unknown, field: string) => (typeof v === "string" && DATE_RE.test(v) ? v : bad(`${field} must be a date (YYYY-MM-DD)`));
const optionalDate = (v: unknown, field: string) => (v === null || v === "" || v === undefined ? undefined : date(v, field));

/** Checks and normalizes the editable fields present in `body`. */
function validatePatch(body: Record<string, unknown>): Partial<SupplyItem> {
  const p: Partial<SupplyItem> = {};
  const has = (k: keyof SupplyItem) => k in body;
  if (has("name")) p.name = text(body.name, "Name", 80);
  if (has("category")) p.category = text(body.category, "Category", 40);
  if (has("location")) p.location = text(body.location, "Location", 40);
  if (has("supplier")) {
    const s = (body.supplier ?? {}) as Record<string, unknown>;
    const url = s.url === undefined || s.url === "" ? undefined : text(s.url, "Supplier website", 200);
    if (url && !/^https?:\/\//i.test(url)) bad("Supplier website must start with http:// or https://");
    p.supplier = { name: text(s.name, "Supplier", 60), url, leadTimeDays: Math.round(num(s.leadTimeDays, "Lead time (days)", 0, 365)) };
  }
  if (has("consumable")) p.consumable = bool(body.consumable, "Consumable");
  if (has("quantity")) p.quantity = Math.round(num(body.quantity, "Quantity", 0, 1_000_000));
  if (has("unit")) p.unit = text(body.unit, "Unit", 20);
  if (has("reorderThreshold")) p.reorderThreshold = Math.round(num(body.reorderThreshold, "Reorder threshold", 0, 1_000_000));
  if (has("unitCost")) p.unitCost = +num(body.unitCost, "Unit cost", 0, 1_000_000).toFixed(4);
  if (has("purchaseDate")) p.purchaseDate = date(body.purchaseDate, "Purchase date");
  if (has("avgLifespanMonths")) p.avgLifespanMonths = num(body.avgLifespanMonths, "Average lifespan (months)", 1, 600);
  if (has("lastUsedDate")) p.lastUsedDate = optionalDate(body.lastUsedDate, "Last used");
  if (has("reorderDate")) p.reorderDate = optionalDate(body.reorderDate, "Reorder by");
  if (has("lastSterilizedDate")) p.lastSterilizedDate = optionalDate(body.lastSterilizedDate, "Last sterilized");
  if (has("expenseLabel")) {
    if (!LABELS.includes(body.expenseLabel as ExpenseLabel)) bad("Unknown expense label");
    p.expenseLabel = body.expenseLabel as ExpenseLabel;
  }
  if (has("isEstimate")) p.isEstimate = bool(body.isEstimate, "Estimate");
  if (has("isUnorganized")) p.isUnorganized = bool(body.isUnorganized, "Unorganized");
  if (has("requiresSterilization")) p.requiresSterilization = bool(body.requiresSterilization, "Requires sterilization");
  if (has("sterilizeAfterEachUse")) p.sterilizeAfterEachUse = bool(body.sterilizeAfterEachUse, "Sterilize after each use");
  if (p.requiresSterilization === false) p.sterilizeAfterEachUse = false;
  return p;
}

export async function updateSupply(id: string, body: Record<string, unknown>, changedBy: string) {
  const item = await repo.get(id);
  if (!item) throw new HttpError(404, "Supply not found");
  const editable = Object.fromEntries(Object.entries(body).filter(([k]) => EDITABLE.includes(k as keyof SupplyItem)));
  return save(item, validatePatch(editable), changedBy, "update");
}

const REQUIRED_ON_CREATE: Array<keyof SupplyItem> = [
  "name", "category", "location", "supplier", "consumable", "quantity", "unit", "reorderThreshold", "unitCost",
  "purchaseDate", "avgLifespanMonths",
];

/** Adds a new item to the supply list. Everything is a business expense until labeled otherwise. */
export async function createSupply(body: Record<string, unknown>, changedBy: string) {
  const missing = REQUIRED_ON_CREATE.filter((k) => !(k in body));
  if (missing.length) bad(`Missing: ${missing.join(", ")}`);
  const fields = validatePatch(body);
  const now = new Date().toISOString();
  const defaults: Partial<SupplyItem> = {
    expenseLabel: "business_expense",
    isEstimate: false,
    isUnorganized: false,
    requiresSterilization: false,
    sterilizeAfterEachUse: false,
  };
  const item = { ...defaults, ...fields, id: `sup-${randomUUID().slice(0, 8)}`, updatedAt: now, version: 1 } as SupplyItem;
  if ((await repo.list()).some((i) => i.name.toLowerCase() === item.name.toLowerCase() && i.location.toLowerCase() === item.location.toLowerCase())) {
    throw new HttpError(409, `${item.name} already exists in ${item.location}. Use Order more to add stock.`);
  }
  await repo.insert(item);
  await repo.addHistory({
    id: randomUUID(),
    itemId: item.id,
    itemName: item.name,
    action: "create",
    changedBy,
    changedAt: now,
    changes: { quantity: { from: null, to: item.quantity } },
  });
  return item;
}

/**
 * Orders more of an item: adds the quantity to stock, updates the unit cost if given,
 * and records today as the purchase date (so lifespan counts from the newest batch).
 */
export async function orderSupply(id: string, quantity: unknown, unitCost: unknown, changedBy: string) {
  const item = await repo.get(id);
  if (!item) throw new HttpError(404, "Supply not found");
  const qty = Math.round(num(quantity, "Quantity", 1, 1_000_000));
  const patch: Partial<SupplyItem> = { quantity: item.quantity + qty, purchaseDate: today() };
  // Push the reorder date out right away for the new stock level, rather than waiting for the hourly job.
  const reorderDate = reorderDateFor({ ...item, quantity: item.quantity + qty }, await consumptionRates());
  if (reorderDate) patch.reorderDate = reorderDate;
  if (unitCost !== undefined && unitCost !== null && unitCost !== "") patch.unitCost = +num(unitCost, "Unit cost", 0, 1_000_000).toFixed(4);
  return save(item, patch, changedBy, "restock");
}

export async function recordUse(id: string, quantity: number, location: string | undefined, changedBy: string) {
  const item = await repo.get(id);
  if (!item) throw new HttpError(404, "Supply not found");
  if (!(quantity > 0)) throw new HttpError(400, "quantity must be positive");
  const usedAt = new Date().toISOString();
  // Reusable equipment isn't used up: record the use (which can trigger sterilization) but keep the count.
  if (!item.consumable) return save(item, { lastUsedDate: usedAt.slice(0, 10) }, changedBy, "use");
  await repo.addUsage({ itemId: id, location: location ?? item.location, quantity, usedAt });
  return save(item, { quantity: Math.max(0, item.quantity - quantity), lastUsedDate: usedAt.slice(0, 10) }, changedBy, "use");
}

export async function markSterilized(id: string, changedBy: string) {
  const item = await repo.get(id);
  if (!item) throw new HttpError(404, "Supply not found");
  return save(item, { lastSterilizedDate: today() }, changedBy, "sterilize");
}

export const history = (itemId?: string) => repo.history(itemId);

/** Items to buy: low stock, a reorder date within a week, or past their lifespan. */
export async function shoppingList() {
  const { items } = await listSupplies();
  const soon = addDays(today(), 7);
  return items
    .filter((i) => i.belowThreshold || (i.reorderDate && i.reorderDate <= soon) || i.pastLifespan)
    .map((i) => {
      // Consumables: restock to a month of usage. Reusable gear: replace worn-out units or top up to the threshold.
      const buy = i.consumable
        ? Math.max(0, Math.max(i.reorderThreshold * 2, Math.ceil(i.consumptionPerDay * 30)) - i.quantity)
        : i.pastLifespan
          ? i.quantity
          : Math.max(1, i.reorderThreshold - i.quantity);
      return {
        id: i.id,
        name: i.name,
        supplier: i.supplier.name,
        supplierUrl: i.supplier.url,
        location: i.location,
        have: i.quantity,
        buy,
        unit: i.unit,
        estCost: +(buy * i.unitCost).toFixed(2),
        reason: i.pastLifespan ? "Past expected lifespan" : i.belowThreshold ? "Low stock" : `Reorder by ${i.reorderDate}`,
        isEstimate: i.isEstimate,
      };
    })
    .filter((s) => s.buy > 0); // nothing to buy (e.g. just restocked) means it's not on the list
}

/** When to reorder a consumable: before stock hits the threshold, allowing for supplier lead time. */
function reorderDateFor(item: Pick<SupplyItem, "id" | "consumable" | "quantity" | "reorderThreshold" | "supplier">, rates: Awaited<ReturnType<typeof consumptionRates>>) {
  if (!item.consumable) return undefined;
  const perDay = dailyRateFor(item.id, rates);
  if (perDay <= 0) return undefined;
  const daysUntilThreshold = Math.max(0, Math.floor((item.quantity - item.reorderThreshold) / perDay));
  return addDays(today(), Math.max(0, daysUntilThreshold - item.supplier.leadTimeDays));
}

/** Leader-only job: sets each item's reorder date from its consumption rate and supplier lead time. */
async function recomputeReorderDates() {
  const rates = await consumptionRates();
  for (const item of await repo.list()) {
    const reorderDate = reorderDateFor(item, rates);
    if (reorderDate && reorderDate !== item.reorderDate) {
      await save(item, { reorderDate }, "system:leader", "auto_reorder_date").catch(() => undefined);
    }
  }
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function accountingCsv() {
  const { items } = await listSupplies();
  const header = [
    "Item", "Category", "Location", "Supplier", "Quantity", "Unit", "Unit cost", "Total value",
    "Purchase date", "Expense label", "Estimate", "Unorganized",
  ];
  const rows = items.map((i) => [
    i.name, i.category, i.location, i.supplier.name, i.quantity, i.unit, i.unitCost.toFixed(2),
    (i.quantity * i.unitCost).toFixed(2), i.purchaseDate, i.expenseLabel, i.isEstimate ? "yes" : "no",
    i.isUnorganized ? "yes" : "no",
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
