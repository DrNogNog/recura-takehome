import { useEffect, useState } from "react";
import { api, getToken, SESSION_EXPIRED, setToken, type User } from "./api";
import { Login } from "./Login";
import { Portal } from "./Portal";
import { Home } from "./Home";
import { About } from "./About";
import { SignUpPage } from "./SignUp";
import { ErrorBoundary, LoadingScreen } from "./components";

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

export function App() {
  const path = usePath();
  // Old /patient and /staff links land on the single Access Portal.
  const page = /^\/(login|portal|patient|staff)/.test(path) ? (
    <AccessPortal />
  ) : path.startsWith("/about") ? (
    <About />
  ) : path.startsWith("/signup") ? (
    <SignUpPage />
  ) : (
    <Home />
  );
  return <ErrorBoundary label="this page">{page}</ErrorBoundary>;
}

function AccessPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.pathname !== "/login") window.history.replaceState(null, "", `/login${window.location.search}`);
    if (!getToken()) return;
    // A 401 clears the saved session (in api()); other errors keep it so a blip doesn't sign you out.
    api<{ user: User }>("/api/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  // The server rejected the session mid-use (expired or revoked): back to sign-in, with a reason.
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setNotice("Your session expired. Sign in again to continue.");
    };
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, []);

  if (checking) return <LoadingScreen label="Restoring your session" />;
  if (!user) return <Login notice={notice} onLogin={(u) => (setNotice(null), setUser(u))} />;
  return (
    <Portal
      user={user}
      onLogout={() => {
        setToken(null);
        setUser(null);
      }}
    />
  );
}
