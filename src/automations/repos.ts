import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "../db/pool.js";
import type { AutomationRepo, Notification, Rule, Run, TriggerType } from "./types.js";

const MAX_RUNS = 500; // newest runs kept per person (the History report)
const MAX_POPUPS = 100; // newest pop-ups kept per person

/** Keeps each person's newest `max` entries (the list is newest first). */
function capPerUser<T>(list: T[], userOf: (t: T) => string, max: number): T[] {
  const counts = new Map<string, number>();
  return list.filter((t) => {
    const n = (counts.get(userOf(t)) ?? 0) + 1;
    counts.set(userOf(t), n);
    return n <= max;
  });
}

/**
 * Single-instance store: rules, recent runs, and notifications in memory, saved to data/automations.json
 * (DATA_DIR moves it) so they survive restarts.
 */
export class FileAutomationRepo implements AutomationRepo {
  private rules = new Map<string, Rule>();
  private runList: Run[] = [];
  private inbox: Notification[] = [];
  private file = join(process.env.DATA_DIR ?? "data", "automations.json");

  constructor() {
    if (!existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8")) as { rules?: Rule[]; runs?: Run[]; notifications?: Notification[] };
      for (const r of saved.rules ?? []) this.rules.set(r.id, r);
      this.runList = saved.runs ?? [];
      this.inbox = saved.notifications ?? [];
    } catch (e) {
      console.error(`Couldn't read ${this.file} (${(e as Error).message}); starting with no automations.`);
    }
  }

  private persist() {
    mkdirSync(join(this.file, ".."), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ rules: [...this.rules.values()], runs: this.runList, notifications: this.inbox }));
  }

  async listRules(ownerId: string) {
    return [...this.rules.values()].filter((r) => r.ownerId === ownerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getRule(id: string) {
    return this.rules.get(id);
  }
  async rulesForTrigger(type: TriggerType) {
    return [...this.rules.values()].filter((r) => r.trigger.type === type);
  }
  async saveRule(rule: Rule) {
    this.rules.set(rule.id, rule);
    this.persist();
  }
  async deleteRule(id: string) {
    this.rules.delete(id);
    this.persist();
  }
  async addRun(run: Run) {
    this.runList = capPerUser([run, ...this.runList], (r) => r.ownerId, MAX_RUNS);
    this.persist();
  }
  async runs(ownerId: string, limit: number) {
    return this.runList.filter((r) => r.ownerId === ownerId).slice(0, limit);
  }
  async addNotification(n: Notification) {
    this.inbox = capPerUser([n, ...this.inbox], (x) => x.userId, MAX_POPUPS);
    this.persist();
  }
  async notifications(userId: string, limit: number) {
    return this.inbox.filter((n) => n.userId === userId).slice(0, limit);
  }
}

/** Postgres store (AUTOMATIONS_STORE=external), shared by every API instance. */
export class PostgresAutomationRepo implements AutomationRepo {
  static async connect() {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS automation_rules (
        id text PRIMARY KEY, owner_id text NOT NULL, trigger_type text NOT NULL, data jsonb NOT NULL);
      CREATE INDEX IF NOT EXISTS automation_rules_owner ON automation_rules (owner_id);
      CREATE INDEX IF NOT EXISTS automation_rules_trigger ON automation_rules (trigger_type);
      CREATE TABLE IF NOT EXISTS automation_runs (
        id text PRIMARY KEY, owner_id text NOT NULL, started_at timestamptz NOT NULL, data jsonb NOT NULL);
      CREATE INDEX IF NOT EXISTS automation_runs_owner ON automation_runs (owner_id, started_at DESC);
      CREATE TABLE IF NOT EXISTS automation_notifications (
        id text PRIMARY KEY, user_id text NOT NULL, at timestamptz NOT NULL, data jsonb NOT NULL);
      CREATE INDEX IF NOT EXISTS automation_notifications_user ON automation_notifications (user_id, at DESC);
    `);
    return new PostgresAutomationRepo();
  }

  async listRules(ownerId: string) {
    const r = await getPool().query("SELECT data FROM automation_rules WHERE owner_id = $1 ORDER BY data->>'createdAt'", [ownerId]);
    return r.rows.map((row) => row.data as Rule);
  }
  async getRule(id: string) {
    const r = await getPool().query("SELECT data FROM automation_rules WHERE id = $1", [id]);
    return r.rows[0]?.data as Rule | undefined;
  }
  async rulesForTrigger(type: TriggerType) {
    const r = await getPool().query("SELECT data FROM automation_rules WHERE trigger_type = $1", [type]);
    return r.rows.map((row) => row.data as Rule);
  }
  async saveRule(rule: Rule) {
    await getPool().query(
      `INSERT INTO automation_rules (id, owner_id, trigger_type, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET trigger_type = EXCLUDED.trigger_type, data = EXCLUDED.data`,
      [rule.id, rule.ownerId, rule.trigger.type, rule]
    );
  }
  async deleteRule(id: string) {
    await getPool().query("DELETE FROM automation_rules WHERE id = $1", [id]);
  }
  async addRun(run: Run) {
    await getPool().query("INSERT INTO automation_runs (id, owner_id, started_at, data) VALUES ($1, $2, $3, $4)", [
      run.id,
      run.ownerId,
      run.startedAt,
      run,
    ]);
  }
  async runs(ownerId: string, limit: number) {
    const r = await getPool().query("SELECT data FROM automation_runs WHERE owner_id = $1 ORDER BY started_at DESC LIMIT $2", [ownerId, limit]);
    return r.rows.map((row) => row.data as Run);
  }
  async addNotification(n: Notification) {
    await getPool().query("INSERT INTO automation_notifications (id, user_id, at, data) VALUES ($1, $2, $3, $4)", [n.id, n.userId, n.at, n]);
  }
  async notifications(userId: string, limit: number) {
    const r = await getPool().query("SELECT data FROM automation_notifications WHERE user_id = $1 ORDER BY at DESC LIMIT $2", [userId, limit]);
    return r.rows.map((row) => row.data as Notification);
  }
}
