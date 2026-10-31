import type { ReactNode } from "react";

/** A labeled number tile. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

/** A percent-of-target bar (0–150%), colored low / ok / high, with a 100% marker. */
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
