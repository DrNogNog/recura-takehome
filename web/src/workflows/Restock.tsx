import { useCallback, useEffect, useId, useState } from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Divider from "@mui/material/Divider";
import { api, download, fmtDateTime, timeAgo } from "../api";
import { ErrorNote, Modal, Spinner } from "../components";
import { MenuSelect } from "../MenuSelect";
import { IconBox, IconCheck, IconChevron, IconShield, IconSparkle, IconX } from "../icons";
import { EXPENSE_LABELS, OrderDialog, SupplyFormDialog } from "./SupplyDialogs";

interface Supply {
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
  lastUsedDate?: string;
  reorderDate?: string;
  expenseLabel: string;
  isEstimate: boolean;
  isUnorganized: boolean;
  requiresSterilization: boolean;
  sterilizeAfterEachUse: boolean;
  lastSterilizedDate?: string;
  updatedAt: string;
  consumptionPerDay: number;
  daysOfStock: number | null;
  endOfLifeDate: string;
  pastLifespan: boolean;
  belowThreshold: boolean;
  needsSterilization: boolean;
}

interface Rate {
  itemId: string;
  itemName: string;
  location: string;
  unit: string;
  perDay: number;
  total: number;
}
interface ShopItem {
  id: string;
  name: string;
  supplier: string;
  supplierUrl?: string;
  location: string;
  have: number;
  buy: number;
  unit: string;
  estCost: number;
  reason: string;
  isEstimate: boolean;
}
interface History {
  id: string;
  itemName: string;
  action: string;
  changedBy: string;
  changedAt: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

type Tab = "inventory" | "consumption" | "shopping" | "history";

export function RestockWorkflow({ onReady }: { onReady: () => void }) {
  const [tab, setTab] = useState<Tab>("inventory");
  const [items, setItems] = useState<Supply[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [innovationsFor, setInnovationsFor] = useState<Supply | null>(null);
  const [editing, setEditing] = useState<Supply | "new" | null>(null);
  const [ordering, setOrdering] = useState<{ item: Supply; suggested?: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // bumps the shopping list after changes
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Supply[]; lastUpdated?: string }>("/api/supplies");
      setItems(r.items);
      setLastUpdated(r.lastUpdated);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load().finally(onReady);
  }, [load, onReady]);

  async function act(item: Supply, path: string, json?: unknown, method = "POST", done?: string) {
    setError(null);
    setNotice(null);
    try {
      await api(`/api/supplies/${item.id}${path}`, { method, json });
      await load();
      setRefreshKey((k) => k + 1);
      if (done) setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** After the add/edit or order dialog saves. */
  async function saved(msg: string) {
    setEditing(null);
    setOrdering(null);
    setError(null);
    setNotice(msg);
    await load();
    setRefreshKey((k) => k + 1);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await download("/api/supplies/export/accounting.csv", `recura-supplies-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const alerts = {
    low: items.filter((i) => i.belowThreshold).length,
    sterile: items.filter((i) => i.needsSterilization).length,
    eol: items.filter((i) => i.pastLifespan).length,
  };

  return (
    <section className="card wide" aria-labelledby="restock-title">
      <div className="card-head">
        <div>
          <h2 id="restock-title">Restock medical supplies</h2>
          <p className="muted small">Catalog updated {timeAgo(lastUpdated)}</p>
        </div>
        <div className="row gap">
          <button className="btn primary" onClick={() => setEditing("new")}>
            + Add supply
          </button>
          <button className="btn" onClick={exportCsv} disabled={exporting}>
            {exporting && <Spinner />} Export to accounting
          </button>
        </div>
      </div>

      <div className="alert-row">
        <span className={`badge ${alerts.low ? "warn" : "ok"}`}>{alerts.low} low stock</span>
        <span className={`badge ${alerts.sterile ? "warn" : "ok"}`}>{alerts.sterile} need sterilizing</span>
        <span className={`badge ${alerts.eol ? "warn" : "ok"}`}>{alerts.eol} past lifespan</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Supply views">
        {(["inventory", "consumption", "shopping", "history"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {{ inventory: "Supply list", consumption: "Consumption", shopping: "Shopping list", history: "Update history" }[t]}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {notice && <p className="badge ok">{notice}</p>}
      </div>
      <ErrorNote error={error} />

      {tab === "inventory" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Stock</th>
                <th scope="col">Supplier</th>
                <th scope="col">Last used</th>
                <th scope="col">Reorder by</th>
                <th scope="col">Lifespan</th>
                <th scope="col">Sterilized</th>
                <th scope="col">Labels</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.name}</strong>
                    <div className="muted small">
                      {i.category} · {i.location}
                    </div>
                  </td>
                  <td className={i.belowThreshold ? "warn-text" : ""}>
                    <span className="num">{i.quantity}</span> {i.unit}
                    <div className="muted small">
                      {i.consumptionPerDay}/day{i.daysOfStock !== null && ` · ~${i.daysOfStock} days left`}
                    </div>
                  </td>
                  <td>
                    {i.supplier.url ? (
                      <a href={i.supplier.url} target="_blank" rel="noreferrer">
                        {i.supplier.name}
                      </a>
                    ) : (
                      i.supplier.name
                    )}
                    <div className="muted small">{i.supplier.leadTimeDays}-day lead time</div>
                  </td>
                  <td>{i.lastUsedDate ?? "—"}</td>
                  <td>{i.reorderDate ?? "—"}</td>
                  <td className={i.pastLifespan ? "warn-text" : ""}>
                    {i.avgLifespanMonths} mo avg
                    <div className="muted small">ends {i.endOfLifeDate}</div>
                  </td>
                  <td>
                    {i.requiresSterilization ? (
                      <>
                        <span className={i.needsSterilization ? "warn-text" : ""}>{i.lastSterilizedDate ?? "never"}</span>
                        <label className="check small">
                          <input
                            type="checkbox"
                            checked={i.sterilizeAfterEachUse}
                            onChange={(e) => act(i, "", { sterilizeAfterEachUse: e.target.checked }, "PATCH")}
                          />
                          after every appointment
                        </label>
                      </>
                    ) : (
                      <span className="muted">n/a</span>
                    )}
                  </td>
                  <td>
                    <MenuSelect
                      size="sm"
                      ariaLabel={`Expense label for ${i.name}`}
                      value={i.expenseLabel}
                      options={EXPENSE_LABELS.map(([id, label]) => ({ id, label }))}
                      onChange={(v) => act(i, "", { expenseLabel: v }, "PATCH")}
                    />
                    <label className="check small">
                      <input type="checkbox" checked={i.isEstimate} onChange={(e) => act(i, "", { isEstimate: e.target.checked }, "PATCH")} />
                      Estimate
                    </label>
                    <label className="check small">
                      <input type="checkbox" checked={i.isUnorganized} onChange={(e) => act(i, "", { isUnorganized: e.target.checked }, "PATCH")} />
                      Unorganized
                    </label>
                  </td>
                  <td>
                    <RowActions
                      item={i}
                      onEdit={() => setEditing(i)}
                      onOrder={() => setOrdering({ item: i })}
                      onUse={() => act(i, "/use", { quantity: 1 }, "POST", i.consumable ? `Used 1 ${i.unit} of ${i.name}.` : `Logged a use of ${i.name}.`)}
                      onSterilize={() => act(i, "/sterilize", undefined, "POST", `Marked ${i.name} as sterilized today.`)}
                      onInnovations={() => setInnovationsFor(i)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "consumption" && <Consumption />}
      {tab === "shopping" && (
        <ShoppingList
          refreshKey={refreshKey}
          onOrder={(id, qty) => {
            const item = items.find((x) => x.id === id);
            if (item) setOrdering({ item, suggested: qty });
          }}
        />
      )}
      {tab === "history" && <HistoryLog refreshKey={refreshKey} />}

      {innovationsFor && <Innovations item={innovationsFor} onClose={() => setInnovationsFor(null)} />}
      {editing && (
        <SupplyFormDialog item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={saved} />
      )}
      {ordering && <OrderDialog item={ordering.item} suggested={ordering.suggested} onClose={() => setOrdering(null)} onOrdered={saved} />}
    </section>
  );
}

/** One "Actions" button per row that opens an MUI menu of everything you can do to the item. */
function RowActions({
  item,
  onEdit,
  onOrder,
  onUse,
  onSterilize,
  onInnovations,
}: {
  item: Supply;
  onEdit: () => void;
  onOrder: () => void;
  onUse: () => void;
  onSterilize: () => void;
  onInnovations: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const run = (fn: () => void) => () => {
    setAnchor(null);
    fn();
  };
  return (
    <>
      <button
        className="btn small actions-btn"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? menuId : undefined}
        aria-label={`Actions for ${item.name}`}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        Actions <IconChevron size={14} />
      </button>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        <MenuItem onClick={run(onOrder)}>
          <ListItemIcon>
            <IconBox />
          </ListItemIcon>
          Order more
        </MenuItem>
        <MenuItem onClick={run(onEdit)}>
          <ListItemIcon>
            <IconSparkle />
          </ListItemIcon>
          Edit details
        </MenuItem>
        <Divider />
        <MenuItem onClick={run(onUse)}>
          <ListItemIcon>
            <IconX />
          </ListItemIcon>
          {item.consumable ? `Use 1 ${item.unit}` : "Log a use"}
        </MenuItem>
        {item.requiresSterilization && (
          <MenuItem onClick={run(onSterilize)}>
            <ListItemIcon>
              <IconShield />
            </ListItemIcon>
            Mark sterilized today
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={run(onInnovations)}>
          <ListItemIcon>
            <IconCheck />
          </ListItemIcon>
          Recent innovations
        </MenuItem>
      </Menu>
    </>
  );
}

function Consumption() {
  const [rates, setRates] = useState<Rate[] | null>(null);
  useEffect(() => {
    api<{ rates: Rate[] }>("/api/supplies/consumption").then((r) => setRates(r.rates));
  }, []);
  if (!rates) return <Spinner />;
  const byLocation = rates.reduce<Record<string, Rate[]>>((acc, r) => ((acc[r.location] ??= []).push(r), acc), {});
  const max = Math.max(...rates.map((r) => r.perDay), 1);
  return (
    <div className="grid two">
      {Object.entries(byLocation).map(([loc, rs]) => (
        <div key={loc} className="subcard">
          <h3>{loc}</h3>
          <ul className="bars">
            {rs.map((r) => (
              <li key={r.itemId}>
                <span className="bar-label">{r.itemName}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(r.perDay / max) * 100}%` }} />
                </span>
                <span className="num small">
                  {r.perDay} {r.unit}/day
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ShoppingList({ refreshKey, onOrder }: { refreshKey: number; onOrder: (id: string, qty: number) => void }) {
  const [data, setData] = useState<{ items: ShopItem[]; total: number } | null>(null);
  useEffect(() => {
    api<{ items: ShopItem[]; total: number }>("/api/supplies/shopping-list").then(setData);
  }, [refreshKey]);
  if (!data) return <Spinner />;
  if (!data.items.length) return <p className="muted">Nothing to reorder right now.</p>;
  return (
    <>
      <p className="muted small">Also available in the Recura mobile app (Expo) under /mobile.</p>
      <ul className="shop">
        {data.items.map((s) => (
          <li key={s.id}>
            <div>
              <strong>
                {s.buy} {s.unit} · {s.name}
              </strong>
              <div className="muted small">
                {s.supplierUrl ? (
                  <a href={s.supplierUrl} target="_blank" rel="noreferrer">
                    {s.supplier}
                  </a>
                ) : (
                  s.supplier
                )}{" "}
                · {s.location} · have {s.have}
              </div>
            </div>
            <div className="right shop-right">
              <span className="num">${s.estCost.toFixed(2)}</span>
              <span className="badge warn small">{s.reason}</span>
              <button className="btn primary small" onClick={() => onOrder(s.id, s.buy)}>
                Order {s.buy}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="total">
        Estimated total <span className="num">${data.total.toFixed(2)}</span>
      </p>
    </>
  );
}

function HistoryLog({ refreshKey }: { refreshKey: number }) {
  const [history, setHistory] = useState<History[] | null>(null);
  useEffect(() => {
    api<{ history: History[] }>("/api/supplies/history").then((r) => setHistory(r.history));
  }, [refreshKey]);
  if (!history) return <Spinner />;
  if (!history.length) return <p className="muted">No changes recorded yet.</p>;
  return (
    <ol className="history">
      {history.map((h) => (
        <li key={h.id}>
          <div>
            <strong>{h.itemName}</strong> <span className="pill small">{h.action.replace(/_/g, " ")}</span>
            <div className="muted small">
              {h.changedBy} · {fmtDateTime(h.changedAt)}
            </div>
          </div>
          <ul className="changes">
            {Object.entries(h.changes).map(([k, c]) => (
              <li key={k}>
                <code>{k}</code>: {fmt(c.from)} → {fmt(c.to)}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

const fmt = (v: unknown) => (v === undefined || v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

function Innovations({ item, onClose }: { item: Supply; onClose: () => void }) {
  const [data, setData] = useState<{ source: string; results: Array<{ title: string; link: string; snippet: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<typeof data>(`/api/supplies/${item.id}/innovations?name=${encodeURIComponent(item.name)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [item]);
  return (
    <Modal title={`Recent innovations: ${item.name}`} onClose={onClose}>
      <ErrorNote error={error} />
      {!data && !error && <Spinner />}
      {data && (
        <>
          <ul className="innovations">
            {data.results.map((r) => (
              <li key={r.link}>
                <a href={r.link} target="_blank" rel="noreferrer">
                  {r.title}
                </a>
                <p className="muted small">{r.snippet}</p>
              </li>
            ))}
          </ul>
          {data.source === "links" && (
            <p className="hint">Set GOOGLE_API_KEY and GOOGLE_CSE_ID to show live search results here.</p>
          )}
        </>
      )}
    </Modal>
  );
}
