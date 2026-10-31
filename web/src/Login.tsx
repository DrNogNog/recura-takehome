import { useState, type FormEvent, type ReactNode } from "react";
import { api, navigate, setToken, type User } from "./api";
import { ErrorNote, IconField, IconUser, ImageIcon, PasswordField, Spinner } from "./components";
import { useAction } from "./hooks";

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
function AuthArt() {
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

/** Shared layout for the login and sign-up pages: brand panel + form card + a link to the other page. */
export function AuthLayout({
  titleId,
  eyebrow,
  title,
  lede,
  switchText,
  switchLink,
  switchTo,
  children,
}: {
  titleId: string;
  eyebrow: string;
  title: string;
  lede: string;
  switchText: string;
  switchLink: string;
  switchTo: string;
  children: ReactNode;
}) {
  const href = `${switchTo}${window.location.search}`;
  return (
    <main className="auth">
      <AuthArt />
      <section className="auth-panel">
        <div className="auth-card" aria-labelledby={titleId}>
          <span className="eyebrow">{eyebrow}</span>
          <h1 id={titleId}>{title}</h1>
          <p className="lede">{lede}</p>
          {children}
          <div className="auth-switch">
            <span>{switchText}</span>
            <a href={href} onClick={(e) => (e.preventDefault(), navigate(href))}>
              {switchLink} →
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

export function Login({ onLogin, notice }: { onLogin: (u: User) => void; notice?: string | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run("login", () => api<{ token: string; user: User }>("/api/auth/login", { method: "POST", json: { username: username.trim(), password } }));
    if (r) {
      setToken(r.token);
      onLogin(r.user);
    }
  }

  return (
    <AuthLayout
      titleId="login-title"
      eyebrow="Welcome to Recura"
      title="Access Portal"
      lede="Log in with the correct information and choose your workflow."
      switchText="New to Recura?"
      switchLink="Create an account"
      switchTo="/signup"
    >
      {notice && !error && (
        <p className="badge warn session-note" role="status">
          {notice}
        </p>
      )}
      <form onSubmit={submit} className="stack">
        <label>
          Username
          <IconField icon={<IconUser />} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>
          Password
          <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <ErrorNote error={error} />
        <button className="btn primary block lg" disabled={busy !== null}>
          {busy && <Spinner />}
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
      <p className="auth-hint">
        Demo accounts are in <code>seed/users.json</code>
      </p>
    </AuthLayout>
  );
}
