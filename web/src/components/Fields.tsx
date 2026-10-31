import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { IconLock } from "./icons";

/** Text input with a leading icon. */
export function IconField({ icon, ...input }: { icon: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="field">
      {icon}
      <input {...input} />
    </span>
  );
}

/** Password input with a Show/Hide toggle. */
export function PasswordField(input: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <span className="field">
      <IconLock />
      <input {...input} className="has-toggle" type={show ? "text" : "password"} />
      <button type="button" className="field-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
        {show ? "Hide" : "Show"}
      </button>
    </span>
  );
}
