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

/** Fired when the server rejects our saved session; App listens and returns to sign-in. */
export const SESSION_EXPIRED = "recura:session-expired";
const TIMEOUT_MS = 20_000;

/** fetch with the shared timeout, turning network failures into readable errors. */
async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new ApiError(0, "The server took too long to respond. Try again.");
    }
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
}

/** A failed response: use the server's `error` message, else a plain description. */
async function failure(res: Response, hadToken: boolean): Promise<ApiError> {
  if (res.status === 401 && hadToken) {
    setToken(null);
    window.dispatchEvent(new Event(SESSION_EXPIRED));
  }
  const body = await res.json().catch(() => null);
  const fallback = res.status >= 500 ? "Something went wrong on the server. Try again." : `Request failed (${res.status})`;
  return new ApiError(res.status, typeof body?.error === "string" ? body.error : fallback);
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  const res = await send(path, {
    // Always check with the server before reusing a cached answer. Unchanged data comes
    // back as a tiny 304 (via ETag), so repeat polling stays cheap but is never stale.
    cache: "no-cache",
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (!res.ok) throw await failure(res, Boolean(token));
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, "The server sent a response we couldn't read. Try again.");
  }
}

export async function download(path: string, filename: string) {
  const token = getToken();
  const res = await send(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw await failure(res, Boolean(token));
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
