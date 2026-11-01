import { AsyncLocalStorage } from "node:async_hooks";
import type { DomainEvent, TriggerType } from "./types.js";

/**
 * In-process event bus. Workflow services publish what happened here and know nothing
 * about automations; the automation engine subscribes. Listeners run after the current
 * request finishes, so a slow automation never delays the user's action.
 */
type Listener = (event: DomainEvent) => Promise<void>;
const listeners: Listener[] = [];
const quiet = new AsyncLocalStorage<true>();

export function subscribe(listener: Listener) {
  listeners.push(listener);
}

export function emit(type: TriggerType, event: Omit<DomainEvent, "type" | "at">) {
  // Changes made by an automation's own actions don't trigger more automations (no loops).
  if (quiet.getStore()) return;
  const full: DomainEvent = { ...event, type, at: new Date().toISOString() };
  for (const listener of listeners) {
    setImmediate(() => listener(full).catch((e) => console.error(`[automations] ${type} failed:`, e)));
  }
}

/** Runs `fn` with event publishing switched off. */
export const withoutEvents = <T>(fn: () => Promise<T>) => quiet.run(true, fn);
