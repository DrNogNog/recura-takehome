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

export async function updateSupply(id: string, body: Record<string, unknown>, changedBy: string) {
  const item = await repo.get(id);
  if (!item) throw new HttpError(404, "Supply not found");
  const patch: Partial<SupplyItem> = {};
  for (const key of EDITABLE) if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  if (patch.expenseLabel && !LABELS.includes(patch.expenseLabel)) throw new HttpError(400, "Unknown expense label");
  return save(item, patch, changedBy, "update");
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
    });
}

/** Leader-only job: sets each item's reorder date from its consumption rate and supplier lead time. */
async function recomputeReorderDates() {
  const rates = await consumptionRates();
  for (const item of await repo.list()) {
    if (!item.consumable) continue;
    const perDay = dailyRateFor(item.id, rates);
    if (perDay <= 0) continue;
    const daysUntilThreshold = Math.max(0, Math.floor((item.quantity - item.reorderThreshold) / perDay));
    const reorderDate = addDays(today(), Math.max(0, daysUntilThreshold - item.supplier.leadTimeDays));
    if (reorderDate !== item.reorderDate) {
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
