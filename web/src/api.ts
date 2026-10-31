export type Role = "patient" | "doctor" | "manager" | "boss";
export type PortalName = "patient" | "staff";
export interface User {
  id: string;
  name: string;
  role: Role;
  portal: PortalName;
}

const tokenKey = () => "recura.token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(tokenKey());
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(tokenKey(), token);
    else sessionStorage.removeItem(tokenKey());
  } catch {
    // Storage blocked (private mode); the session just won't survive a reload.
  }
}

/** Minimal client-side navigation: / (home) and /login (Access Portal). */
export function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(path, {
    // Always check with the server before reusing a cached answer. Unchanged data comes
    // back as a tiny 304 (via ETag), so repeat polling stays cheap but is never stale.
    cache: "no-cache",
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function download(path: string, filename: string) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, "Export failed");
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
export const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export function timeAgo(iso?: string) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
