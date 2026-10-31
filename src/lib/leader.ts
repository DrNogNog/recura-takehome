import type pg from "pg";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";

/**
 * Leader election so background jobs (like recomputing reorder dates) run on exactly
 * one API instance behind the load balancer. With Postgres, the leader is whichever
 * instance holds a session-level advisory lock; if it dies, its connection closes, the
 * lock frees, and another instance takes over on its next attempt. Without Postgres
 * there is only one instance, so it leads.
 */
const LOCK_KEY = 427_001;
const RETRY_MS = 10_000;

let leader = false;
let lockClient: pg.PoolClient | undefined;
const jobs: Array<{ run: () => Promise<void>; everyMs: number; timer?: NodeJS.Timeout }> = [];

export const isLeader = () => leader;

export function onLeader(run: () => Promise<void>, everyMs: number) {
  jobs.push({ run, everyMs });
}

function becomeLeader() {
  if (leader) return;
  leader = true;
  console.log(`[leader] ${config.instanceId} is now the leader`);
  for (const job of jobs) {
    job.run().catch((e) => console.error("[leader] job failed", e));
    job.timer = setInterval(() => job.run().catch((e) => console.error("[leader] job failed", e)), job.everyMs);
  }
}

function loseLeadership() {
  leader = false;
  for (const job of jobs) clearInterval(job.timer);
  lockClient?.release(true);
  lockClient = undefined;
}

async function tryAcquire() {
  try {
    lockClient ??= await getPool().connect();
    lockClient.once("error", loseLeadership);
    const r = await lockClient.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (r.rows[0].ok) becomeLeader();
    else {
      lockClient.release();
      lockClient = undefined;
    }
  } catch (e) {
    console.error("[leader] election attempt failed", (e as Error).message);
    loseLeadership();
  }
}

export function startLeaderElection() {
  if (config.suppliesStore !== "external" || !config.databaseUrl) {
    becomeLeader();
    return;
  }
  void tryAcquire();
  setInterval(() => {
    if (!leader) void tryAcquire();
  }, RETRY_MS).unref();
}
