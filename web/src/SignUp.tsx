import { useState, type FormEvent } from "react";
import { api, navigate, setToken, type User } from "./api";
import { ErrorNote, Spinner } from "./components";
import { AuthArt } from "./Login";
import { IconLock, IconUser } from "./icons";

type AccountType = "patient" | "manager";

const TYPES: Array<{ id: AccountType; title: string }> = [
  { id: "patient", title: "Patient" },
  { id: "manager", title: "Manager" },
];

/** Sign Up from a workflow card picks the matching account type (appointments → Patient, others → Manager). */
function initialType(): AccountType {
  const wf = new URLSearchParams(window.location.search).get("workflow");
  return wf === "restock" || wf === "food" ? "manager" : "patient";
}

export function SignUpPage() {
  const [type, setType] = useState<AccountType>(initialType);
  const [name, setName] = useState("");
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
      const r = await api<{ token: string; user: User }>("/api/auth/signup", {
        method: "POST",
        json: { name, username, password, role: type },
      });
      setToken(r.token);
      // Signed in: open the Access Portal (keeping any workflow picked on the home page).
      navigate(`/login${window.location.search}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const loginHref = `/login${window.location.search}`;

  return (
    <main className="auth">
      <AuthArt />
      <section className="auth-panel">
        <div className="auth-card" aria-labelledby="signup-title">
          <span className="eyebrow">Welcome to Recura</span>
          <h1 id="signup-title">Create your account</h1>
          <p className="lede">Choose an account type, then fill in your details.</p>

          <form onSubmit={submit} className="stack">
            <fieldset className="type-picker">
              <legend>Account type</legend>
              {TYPES.map((t) => (
                <label key={t.id} className={`type-card ${type === t.id ? "selected" : ""}`}>
                  <input type="radio" name="account-type" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} />
                  <span className="type-light" aria-hidden="true" />
                  <strong>{t.title}</strong>
                </label>
              ))}
            </fieldset>

            <label>
              Full name
              <span className="field">
                <IconUser />
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} required />
              </span>
            </label>
            <label>
              Username
              <span className="field">
                <IconUser />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  pattern="[A-Za-z0-9._\-]{3,32}"
                  title="3–32 letters, numbers, dots, dashes, or underscores"
                  required
                />
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
                  autoComplete="new-password"
                  minLength={8}
                  required
                  aria-describedby="pw-hint"
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
              <span id="pw-hint" className="muted small field-hint">
                At least 8 characters.
              </span>
            </label>
            <ErrorNote error={error} />
            <button className="btn primary block lg" disabled={busy}>
              {busy && <Spinner />}
              {busy ? "Creating your account" : `Sign Up as a ${type === "patient" ? "Patient" : "Manager"}`}
            </button>
          </form>

          <div className="auth-switch">
            <span>Already have an account?</span>
            <a href={loginHref} onClick={(e) => (e.preventDefault(), navigate(loginHref))}>
              Sign in →
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
