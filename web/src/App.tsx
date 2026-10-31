import { useEffect, useState } from "react";
import { api, getToken, setToken, type User } from "./api";
import { Login } from "./Login";
import { Portal } from "./Portal";
import { Home } from "./Home";
import { About } from "./About";
import { SignUpPage } from "./SignUp";
import { LoadingScreen } from "./components";

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
  if (/^\/(login|portal|patient|staff)/.test(path)) return <AccessPortal />;
  if (path.startsWith("/about")) return <About />;
  if (path.startsWith("/signup")) return <SignUpPage />;
  return <Home />;
}

function AccessPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(Boolean(getToken()));

  useEffect(() => {
    if (window.location.pathname !== "/login") window.history.replaceState(null, "", `/login${window.location.search}`);
    if (!getToken()) return;
    api<{ user: User }>("/api/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <LoadingScreen label="Restoring your session" />;
  if (!user) return <Login onLogin={setUser} />;
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
