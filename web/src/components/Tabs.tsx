/** Segmented tabs. `items` maps each tab id to its label. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: Record<T, string>;
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {(Object.keys(items) as T[]).map((id) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? "active" : ""} onClick={() => onChange(id)}>
          {items[id]}
        </button>
      ))}
    </div>
  );
}
