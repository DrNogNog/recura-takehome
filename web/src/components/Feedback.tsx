/** Loading and message components: spinners, the full-screen loader, errors, and action results. */

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="pulse-logo" aria-hidden="true">R</div>
        <Spinner />
        <p>{label}…</p>
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error}
    </p>
  );
}

/** Success message and/or error from an action, announced to screen readers. */
export function StatusMessage({ notice, error }: { notice?: string | null; error?: string | null }) {
  return (
    <div aria-live="polite" className="status-message">
      {notice && <p className="badge ok">{notice}</p>}
      <ErrorNote error={error} />
    </div>
  );
}
