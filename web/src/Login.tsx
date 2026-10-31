import { useState, type FormEvent, type ReactNode } from "react";
import { api, navigate, setToken, type User } from "./api";
import { ErrorNote, Spinner } from "./components";
import { IconLock, IconUser, ImageIcon } from "./icons";

const POINTS: Array<[ReactNode, string]> = [
  [<ImageIcon key="a" file="appointment.png" />, "Appointments, check-in, and rescheduling"],
  [<ImageIcon key="r" file="restock.png" />, "Restock medical supplies"],
  [<ImageIcon key="f" file="food_icon.png" />, "AI food recommendations"],
];

export function BrandLogo() {
  return (
    <a
      className="brand"
      href="/"
      aria-label="Recura home page"
      onClick={(e) => {
        e.preventDefault();
        navigate("/");
        window.scrollTo(0, 0);
      }}
    >
      <img className="brand-logo" src="/logic_core.png" alt="" width={247} height={118} />
      <span>Recura</span>
    </a>
  );
}

/** Brand panel beside the login and sign-up forms. */
export function AuthArt() {
  return (
    <aside className="auth-art">
      <BrandLogo />
      <div className="art-copy">
        <h2>One portal for the whole clinic.</h2>
        <p>Sign in once. Your account opens the workflows that are yours.</p>
      </div>
      <ul className="art-points">
        {POINTS.map(([icon, text]) => (
          <li key={text}>
            {icon}
            {text}
          </li>
        ))}
      </ul>
      <span className="art-foot">© {new Date().getFullYear()} Recura Health</span>
    </aside>
  );
}

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>("/api/auth/login", {
        method: "POST",
        json: { username, password },
      });
      setToken(r.token);
      onLogin(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <AuthArt />
      <section className="auth-panel">
        <div className="auth-card" aria-labelledby="login-title">
          <span className="eyebrow">Welcome to Recura</span>
          <h1 id="login-title">Access Portal</h1>
          <p className="lede">Log in with the correct information and choose your workflow.</p>

          <form onSubmit={submit} className="stack">
            <label>
              Username
              <span className="field">
                <IconUser />
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
              </span>
            </label>
            <label>
              Password
              <span className="field">
                <IconLock />
                <input
                  className="has-toggle"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="field-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <ErrorNote error={error} />
            <button className="btn primary block lg" disabled={busy}>
              {busy && <Spinner />}
              {busy ? "Signing in" : "Sign in"}
            </button>
          </form>

          <div className="auth-switch">
            <span>New to Recura?</span>
            <a href={`/signup${window.location.search}`} onClick={(e) => (e.preventDefault(), navigate(`/signup${window.location.search}`))}>
              Create an account →
            </a>
          </div>
          <p className="auth-hint">
            Demo accounts are in <code>seed/users.json</code>
          </p>
        </div>
      </section>
    </main>
  );
}
