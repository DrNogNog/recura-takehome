import { useEffect, useRef, type ReactNode } from "react";

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

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="modal-title">
      <header className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button className="btn ghost" onClick={() => ref.current?.close()} aria-label="Close">
          ✕
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Meter({ label, percent }: { label: string; percent: number }) {
  const clamped = Math.min(percent, 150);
  const tone = percent < 70 ? "low" : percent > 120 ? "high" : "ok";
  return (
    <div className="meter">
      <div className="meter-row">
        <span>{label}</span>
        <span className="num">{percent}%</span>
      </div>
      <div className="meter-track" role="meter" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={150} aria-label={`${label} ${percent}% of daily value`}>
        <div className={`meter-fill ${tone}`} style={{ width: `${(clamped / 150) * 100}%` }} />
        <div className="meter-target" style={{ left: `${(100 / 150) * 100}%` }} />
      </div>
    </div>
  );
}
