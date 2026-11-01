import { IconBolt, IconX } from "./icons";

export interface Toast {
  id: string;
  title: string;
  message: string;
  meta?: string;
}

/** Small pop-up boxes stacked just under the navbar. Screen readers hear each new one. */
export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" role="region" aria-label="Pop-ups" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="status">
          <span className="toast-icon" aria-hidden="true">
            <IconBolt size={16} />
          </span>
          <div className="toast-body">
            <strong>{t.title}</strong>
            <p>{t.message}</p>
            {t.meta && <span className="muted small">{t.meta}</span>}
          </div>
          <button type="button" className="btn ghost small toast-close" aria-label={`Dismiss ${t.title}`} onClick={() => onDismiss(t.id)}>
            <IconX size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
