import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs user actions with shared busy / error / success-message state.
 * `run(key, fn, done)` marks `key` busy, clears old messages, and shows `done` on success
 * (a string, or a function of the result) or the error message on failure.
 * Returns the result, or undefined if it failed — so for calls with no response body
 * (e.g. DELETE → 204), make `fn` return `true` to tell success apart from failure.
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(async <T>(key: string, fn: () => Promise<T>, done?: string | ((result: T) => string)) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (done) setNotice(typeof done === "function" ? done(result) : done);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);

  return { busy, error, notice, run, setError, setNotice };
}

/**
 * Loads data now, calls `onReady` after the first load (to drop the loading screen),
 * then reloads every `everyMs` (if given). Returns a `reload` function.
 */
export function usePolling(load: () => Promise<unknown>, onReady?: () => void, everyMs?: number) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(() => loadRef.current(), []);

  useEffect(() => {
    reload().finally(() => onReady?.());
    if (!everyMs) return;
    const t = setInterval(reload, everyMs);
    return () => clearInterval(t);
    // `load` may change (e.g. a new day picked); re-run when it does.
  }, [load, onReady, everyMs, reload]);

  return reload;
}
