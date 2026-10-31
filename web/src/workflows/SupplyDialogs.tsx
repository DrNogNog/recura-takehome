import { useState, type FormEvent } from "react";
import { api } from "../api";
import { AppDialog, ErrorNote, MenuSelect, Spinner } from "../components";
import { useAction } from "../hooks";

/** The stored fields of a supply item (what the add/edit form works with). */
export interface SupplyFields {
  id: string;
  name: string;
  category: string;
  location: string;
  supplier: { name: string; url?: string; leadTimeDays: number };
  consumable: boolean;
  quantity: number;
  unit: string;
  reorderThreshold: number;
  unitCost: number;
  purchaseDate: string;
  avgLifespanMonths: number;
  expenseLabel: string;
  isEstimate: boolean;
  isUnorganized: boolean;
  requiresSterilization: boolean;
  sterilizeAfterEachUse: boolean;
  lastSterilizedDate?: string;
}

export const EXPENSE_LABELS = [
  ["business_expense", "Business expense"],
  ["capital_asset", "Capital asset"],
  ["reimbursable", "Reimbursable"],
  ["personal", "Personal"],
] as const;

const today = () => new Date().toISOString().slice(0, 10);

/** Add a new supply (item undefined) or edit an existing one. */
export function SupplyFormDialog({ item, onClose, onSaved }: { item?: SupplyFields; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState(() => ({
    name: item?.name ?? "",
    category: item?.category ?? "",
    location: item?.location ?? "",
    supplierName: item?.supplier.name ?? "",
    supplierUrl: item?.supplier.url ?? "",
    leadTimeDays: String(item?.supplier.leadTimeDays ?? 5),
    consumable: item?.consumable ?? true,
    quantity: String(item?.quantity ?? 0),
    unit: item?.unit ?? "units",
    reorderThreshold: String(item?.reorderThreshold ?? 10),
    unitCost: String(item?.unitCost ?? 0),
    purchaseDate: item?.purchaseDate ?? today(),
    avgLifespanMonths: String(item?.avgLifespanMonths ?? 24),
    expenseLabel: item?.expenseLabel ?? "business_expense",
    isEstimate: item?.isEstimate ?? false,
    isUnorganized: item?.isUnorganized ?? false,
    requiresSterilization: item?.requiresSterilization ?? false,
    sterilizeAfterEachUse: item?.sterilizeAfterEachUse ?? false,
    lastSterilizedDate: item?.lastSterilizedDate ?? "",
  }));
  const { busy, error, run } = useAction();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: f.name,
      category: f.category,
      location: f.location,
      supplier: { name: f.supplierName, url: f.supplierUrl || undefined, leadTimeDays: Number(f.leadTimeDays) },
      consumable: f.consumable,
      quantity: Number(f.quantity),
      unit: f.unit,
      reorderThreshold: Number(f.reorderThreshold),
      unitCost: Number(f.unitCost),
      purchaseDate: f.purchaseDate,
      avgLifespanMonths: Number(f.avgLifespanMonths),
      expenseLabel: f.expenseLabel,
      isEstimate: f.isEstimate,
      isUnorganized: f.isUnorganized,
      requiresSterilization: f.requiresSterilization,
      sterilizeAfterEachUse: f.requiresSterilization && f.sterilizeAfterEachUse,
      ...(f.requiresSterilization ? { lastSterilizedDate: f.lastSterilizedDate || null } : {}),
    };
    const ok = await run("save", () => (item ? api(`/api/supplies/${item.id}`, { method: "PATCH", json: body }) : api("/api/supplies", { method: "POST", json: body })));
    if (ok) onSaved(item ? `Saved changes to ${f.name.trim()}.` : `Added ${f.name.trim()} to the supply list.`);
  }

  return (
    <AppDialog title={item ? `Edit ${item.name}` : "Add a supply"} onClose={onClose}>
      <form onSubmit={submit} className="supply-form">
        <fieldset>
          <legend>Item</legend>
          <label className="span2">
            Name
            <input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} required autoFocus />
          </label>
          <label>
            Category
            <input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. PPE, Instruments" maxLength={40} required />
          </label>
          <label>
            Location
            <input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Exam Room A" maxLength={40} required />
          </label>
          <label className="check span2">
            <input type="checkbox" checked={f.consumable} onChange={(e) => set("consumable", e.target.checked)} />
            Consumable (used up, like gloves or gauze). Leave unchecked for reusable equipment.
          </label>
        </fieldset>

        <fieldset>
          <legend>Stock</legend>
          <label>
            Quantity on hand
            <input type="number" min={0} step={1} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} required />
          </label>
          <label>
            Unit
            <input value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="units, gloves, pads…" maxLength={20} required />
          </label>
          <label>
            Reorder when at or below
            <input type="number" min={0} step={1} value={f.reorderThreshold} onChange={(e) => set("reorderThreshold", e.target.value)} required />
          </label>
          <label>
            Unit cost ($)
            <input type="number" min={0} step="any" value={f.unitCost} onChange={(e) => set("unitCost", e.target.value)} required />
          </label>
        </fieldset>

        <fieldset>
          <legend>Supplier</legend>
          <label>
            Supplier
            <input value={f.supplierName} onChange={(e) => set("supplierName", e.target.value)} maxLength={60} required />
          </label>
          <label>
            Lead time (days)
            <input type="number" min={0} max={365} step={1} value={f.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} required />
          </label>
          <label className="span2">
            Supplier website (optional)
            <input type="url" value={f.supplierUrl} onChange={(e) => set("supplierUrl", e.target.value)} placeholder="https://" maxLength={200} />
          </label>
        </fieldset>

        <fieldset>
          <legend>Lifespan</legend>
          <label>
            Purchase date
            <input type="date" value={f.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} required />
          </label>
          <label>
            Average lifespan (months)
            <input type="number" min={1} max={600} step={1} value={f.avgLifespanMonths} onChange={(e) => set("avgLifespanMonths", e.target.value)} required />
          </label>
        </fieldset>

        <fieldset>
          <legend>Sterilization</legend>
          <label className="check span2">
            <input type="checkbox" checked={f.requiresSterilization} onChange={(e) => set("requiresSterilization", e.target.checked)} />
            Needs sterilizing
          </label>
          {f.requiresSterilization && (
            <>
              <label className="check span2">
                <input type="checkbox" checked={f.sterilizeAfterEachUse} onChange={(e) => set("sterilizeAfterEachUse", e.target.checked)} />
                Sterilize after every appointment
              </label>
              <label>
                Last sterilized
                <input type="date" value={f.lastSterilizedDate} onChange={(e) => set("lastSterilizedDate", e.target.value)} />
              </label>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Accounting</legend>
          <label className="span2">
            <span>Expense label</span>
            <MenuSelect
              size="sm"
              ariaLabel="Expense label"
              value={f.expenseLabel}
              options={EXPENSE_LABELS.map(([id, label]) => ({ id, label }))}
              onChange={(v) => set("expenseLabel", v)}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={f.isEstimate} onChange={(e) => set("isEstimate", e.target.checked)} />
            Numbers are an estimate
          </label>
          <label className="check">
            <input type="checkbox" checked={f.isUnorganized} onChange={(e) => set("isUnorganized", e.target.checked)} />
            Unorganized
          </label>
        </fieldset>

        <ErrorNote error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy !== null}>
            {busy && <Spinner />} {item ? "Save changes" : "Add supply"}
          </button>
        </div>
      </form>
    </AppDialog>
  );
}

/** Order more of an item: the quantity is added to stock and logged as a restock. */
export function OrderDialog({
  item,
  suggested,
  onClose,
  onOrdered,
}: {
  item: SupplyFields;
  suggested?: number;
  onClose: () => void;
  onOrdered: (msg: string) => void;
}) {
  const [qty, setQty] = useState(String(suggested ?? Math.max(1, item.reorderThreshold * 2 - item.quantity)));
  const [cost, setCost] = useState(String(item.unitCost));
  const { busy, error, run, setError } = useAction();
  const total = (Number(qty) || 0) * (Number(cost) || 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = Number(qty);
    if (!Number.isInteger(q) || q < 1) return setError("Enter a whole number of at least 1");
    if (!(Number(cost) >= 0)) return setError("Unit cost can't be negative");
    const ok = await run("order", () => api(`/api/supplies/${item.id}/order`, { method: "POST", json: { quantity: q, unitCost: Number(cost) } }));
    if (ok) onOrdered(`Ordered ${q} ${item.unit} of ${item.name}. Stock is now ${item.quantity + q}.`);
  }

  return (
    <AppDialog title={`Order more ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="supply-form">
        <p className="muted span2 order-meta">
          From{" "}
          {item.supplier.url ? (
            <a href={item.supplier.url} target="_blank" rel="noreferrer">
              {item.supplier.name}
            </a>
          ) : (
            item.supplier.name
          )}{" "}
          · usually arrives in {item.supplier.leadTimeDays} days · you have {item.quantity} {item.unit}
        </p>
        <label>
          Quantity to order
          <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
        </label>
        <label>
          Unit cost ($)
          <input type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </label>
        <div className="order-summary span2">
          <span>
            Stock after order <strong className="num">{item.quantity + (Number(qty) || 0)} {item.unit}</strong>
          </span>
          <span>
            Order total <strong className="num">${total.toFixed(2)}</strong>
          </span>
        </div>
        <ErrorNote error={error} />
        <div className="dialog-actions span2">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy !== null}>
            {busy && <Spinner />} Place order
          </button>
        </div>
      </form>
    </AppDialog>
  );
}
