import { useState, type FormEvent } from "react";
import { api, navigate, setToken, type User } from "./api";
import { ErrorNote, IconField, IconUser, PasswordField, Spinner } from "./components";
import { useAction } from "./hooks";
import { AuthLayout } from "./Login";

type AccountType = "patient" | "manager";

const TYPES: Array<{ id: AccountType; title: string }> = [
  { id: "patient", title: "Patient" },
  { id: "manager", title: "Manager" },
];

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

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
  const { busy, error, run, setError } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Same rules as the server, checked here first so mistakes show instantly.
    if (!name.trim()) return setError("Enter your full name");
    if (!USERNAME_RE.test(username.trim())) return setError("Username must be 3–32 letters, numbers, dots, dashes, or underscores");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    const r = await run("signup", () =>
      api<{ token: string; user: User }>("/api/auth/signup", { method: "POST", json: { name: name.trim(), username: username.trim(), password, role: type } })
    );
    if (r) {
      setToken(r.token);
      // Signed in: open the Access Portal (keeping any workflow picked on the home page).
      navigate(`/login${window.location.search}`);
    }
  }

  return (
    <AuthLayout
      titleId="signup-title"
      eyebrow="Welcome to Recura"
      title="Create your account"
      lede="Choose an account type, then fill in your details."
      switchText="Already have an account?"
      switchLink="Sign in"
      switchTo="/login"
    >
      <form onSubmit={submit} className="stack" noValidate>
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
          <IconField icon={<IconUser />} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} required />
        </label>
        <label>
          Username
          <IconField icon={<IconUser />} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={32} required />
        </label>
        <label>
          Password
          <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={128} required aria-describedby="pw-hint" />
          <span id="pw-hint" className="muted small field-hint">
            At least 8 characters.
          </span>
        </label>
        <ErrorNote error={error} />
        <button className="btn primary block lg" disabled={busy !== null}>
          {busy && <Spinner />}
          {busy ? "Creating your account" : `Sign Up as a ${type === "patient" ? "Patient" : "Manager"}`}
        </button>
      </form>
    </AuthLayout>
  );
}
