import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtTime } from "../../api";
import { ToastStack, type Toast } from "../../components";
import type { Notification } from "./types";

const POLL_MS = 4000;
const SHOW_MS = 12_000;
const MAX_SHOWN = 4;
const seenKey = (userId: string) => `recura.popups.seen.${userId}`;

function readSeen(userId: string): string {
  try {
    return localStorage.getItem(seenKey(userId)) ?? "";
  } catch {
    return "";
  }
}
function writeSeen(userId: string, at: string) {
  try {
    localStorage.setItem(seenKey(userId), at);
  } catch {
    // Storage blocked: pop-ups still show, they just may repeat after a reload.
  }
}

/**
 * Pops up automation messages for the signed-in account under the navbar, on every page.
 * It checks for new ones every few seconds; anything that arrived while the person was
 * away pops up the next time they sign in (the newest few). Each closes on its own.
 */
export function AutomationPopups({ userId }: { userId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(readSeen(userId));

  const dismiss = useCallback((id: string) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  useEffect(() => {
    let stopped = false;
    async function check() {
      try {
        const since = seen.current ? `?since=${encodeURIComponent(seen.current)}` : "";
        const { notifications } = await api<{ notifications: Notification[] }>(`/api/automations/inbox${since}`);
        if (stopped) return;
        if (!notifications.length) {
          // Nothing yet on this browser: start counting from now, so the next ones all pop up.
          if (!seen.current) seen.current = new Date(Date.now() - POLL_MS).toISOString();
          return;
        }
        // First visit ever: start from now instead of replaying old history.
        const fresh = seen.current ? notifications : notifications.slice(0, 1);
        seen.current = notifications[0].at;
        writeSeen(userId, seen.current);
        const added = fresh
          .slice(0, MAX_SHOWN)
          .reverse()
          .map((n) => ({ id: n.id, title: n.ruleName, message: n.message, meta: `From ${n.fromName} · ${fmtTime(n.at)}` }));
        setToasts((all) => [...added, ...all].slice(0, MAX_SHOWN));
        for (const t of added) setTimeout(() => dismiss(t.id), SHOW_MS);
      } catch {
        // Offline or signed out: try again on the next tick.
      }
    }
    void check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [userId, dismiss]);

  return <ToastStack toasts={toasts} onDismiss={dismiss} />;
}
