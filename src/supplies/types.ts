export type ExpenseLabel = "business_expense" | "capital_asset" | "personal" | "reimbursable";

export interface Supplier {
  name: string;
  contact?: string;
  url?: string;
  leadTimeDays: number;
}

export interface SupplyItem {
  id: string;
  name: string;
  category: string;
  location: string;
  supplier: Supplier;
  /** Consumables (gloves, gauze) are used up; reusable equipment is used, sterilized, and eventually replaced. */
  consumable: boolean;
  quantity: number;
  unit: string;
  reorderThreshold: number;
  unitCost: number;
  purchaseDate: string; // YYYY-MM-DD
  avgLifespanMonths: number;
  lastUsedDate?: string;
  reorderDate?: string;
  /** Everything is a business expense until someone labels it otherwise. */
  expenseLabel: ExpenseLabel;
  isEstimate: boolean;
  isUnorganized: boolean;
  requiresSterilization: boolean;
  sterilizeAfterEachUse: boolean;
  lastSterilizedDate?: string;
  updatedAt: string;
  version: number;
}

export interface UsageEntry {
  itemId: string;
  location: string;
  quantity: number;
  usedAt: string;
}

export interface HistoryEntry {
  id: string;
  itemId: string;
  itemName: string;
  action: "create" | "update" | "use" | "sterilize" | "auto_reorder_date";
  changedBy: string;
  changedAt: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

export interface SupplyRepo {
  list(): Promise<SupplyItem[]>;
  get(id: string): Promise<SupplyItem | undefined>;
  insert(item: SupplyItem): Promise<void>;
  /** Saves only if the stored version still equals `expectedVersion`. */
  update(item: SupplyItem, expectedVersion: number): Promise<boolean>;
  addUsage(entry: UsageEntry): Promise<void>;
  usageSince(sinceIso: string): Promise<UsageEntry[]>;
  addHistory(entry: HistoryEntry): Promise<void>;
  history(itemId?: string, limit?: number): Promise<HistoryEntry[]>;
}
