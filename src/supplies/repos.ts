import { getPool } from "../db/pool.js";
import type { HistoryEntry, SupplyItem, SupplyRepo, UsageEntry } from "./types.js";

export class MemorySupplyRepo implements SupplyRepo {
  private items = new Map<string, SupplyItem>();
  private usage: UsageEntry[] = [];
  private log: HistoryEntry[] = [];

  async list() {
    return [...this.items.values()].map((i) => structuredClone(i));
  }
  async get(id: string) {
    const i = this.items.get(id);
    return i && structuredClone(i);
  }
  async insert(item: SupplyItem) {
    this.items.set(item.id, structuredClone(item));
  }
  async update(item: SupplyItem, expectedVersion: number) {
    if (this.items.get(item.id)?.version !== expectedVersion) return false;
    this.items.set(item.id, structuredClone(item));
    return true;
  }
  async addUsage(entry: UsageEntry) {
    this.usage.push(entry);
  }
  async usageSince(sinceIso: string) {
    return this.usage.filter((u) => u.usedAt >= sinceIso);
  }
  async addHistory(entry: HistoryEntry) {
    this.log.push(entry);
  }
  async history(itemId?: string, limit = 200) {
    return this.log
      .filter((h) => !itemId || h.itemId === itemId)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
      .slice(0, limit);
  }
}

/** Postgres store: items as JSONB with a version column for optimistic locking. */
export class PostgresSupplyRepo implements SupplyRepo {
  static async connect() {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS supply_items (
        id text PRIMARY KEY, data jsonb NOT NULL, version int NOT NULL);
      CREATE TABLE IF NOT EXISTS supply_usage (
        id bigserial PRIMARY KEY, item_id text NOT NULL, location text NOT NULL,
        quantity numeric NOT NULL, used_at timestamptz NOT NULL);
      CREATE INDEX IF NOT EXISTS supply_usage_used_at ON supply_usage (used_at);
      CREATE TABLE IF NOT EXISTS supply_history (
        id text PRIMARY KEY, item_id text NOT NULL, data jsonb NOT NULL, changed_at timestamptz NOT NULL);
      CREATE INDEX IF NOT EXISTS supply_history_item ON supply_history (item_id, changed_at DESC);
    `);
    return new PostgresSupplyRepo();
  }

  async list() {
    const r = await getPool().query("SELECT data FROM supply_items ORDER BY data->>'name'");
    return r.rows.map((row) => row.data as SupplyItem);
  }
  async get(id: string) {
    const r = await getPool().query("SELECT data FROM supply_items WHERE id = $1", [id]);
    return r.rows[0]?.data as SupplyItem | undefined;
  }
  async insert(item: SupplyItem) {
    await getPool().query(
      "INSERT INTO supply_items (id, data, version) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
      [item.id, item, item.version]
    );
  }
  async update(item: SupplyItem, expectedVersion: number) {
    const r = await getPool().query(
      "UPDATE supply_items SET data = $2, version = $3 WHERE id = $1 AND version = $4",
      [item.id, item, item.version, expectedVersion]
    );
    return r.rowCount === 1;
  }
  async addUsage(e: UsageEntry) {
    await getPool().query(
      "INSERT INTO supply_usage (item_id, location, quantity, used_at) VALUES ($1, $2, $3, $4)",
      [e.itemId, e.location, e.quantity, e.usedAt]
    );
  }
  async usageSince(sinceIso: string) {
    const r = await getPool().query(
      "SELECT item_id, location, quantity, used_at FROM supply_usage WHERE used_at >= $1",
      [sinceIso]
    );
    return r.rows.map((row) => ({
      itemId: row.item_id,
      location: row.location,
      quantity: Number(row.quantity),
      usedAt: row.used_at.toISOString(),
    }));
  }
  async addHistory(h: HistoryEntry) {
    await getPool().query(
      "INSERT INTO supply_history (id, item_id, data, changed_at) VALUES ($1, $2, $3, $4)",
      [h.id, h.itemId, h, h.changedAt]
    );
  }
  async history(itemId?: string, limit = 200) {
    const r = itemId
      ? await getPool().query(
          "SELECT data FROM supply_history WHERE item_id = $1 ORDER BY changed_at DESC LIMIT $2",
          [itemId, limit]
        )
      : await getPool().query("SELECT data FROM supply_history ORDER BY changed_at DESC LIMIT $1", [limit]);
    return r.rows.map((row) => row.data as HistoryEntry);
  }
}
