export interface Nutrients {
  calories: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  fiber: number; // g
  sugar: number; // g
  sodium: number; // mg
  potassium: number; // mg
  calcium: number; // mg
  iron: number; // mg
  vitaminC: number; // mg
}

export interface FoodItem {
  id: string;
  name: string;
  market: string;
  category: string;
  price: number; // per serving, USD
  servingSize: string;
  nutrients: Nutrients; // per serving
  tags: string[];
  nutrientsEstimated: boolean;
  sourceUrl?: string;
  /** Set for items a user scraped into their personal catalog; absent for the shared market. */
  ownerId?: string;
  updatedAt: string;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface PlannedMeal {
  slot: MealSlot;
  name: string;
  ingredients: Array<{ itemId: string; servings: number }>;
  eaten?: boolean; // logged by the user: true ate it, false skipped
}

export interface PlanDay {
  date: string; // YYYY-MM-DD, one calendar day
  meals: PlannedMeal[];
}

/** A user's meal calendar: planned days keyed by date, across any number of months. */
export interface MealCalendar {
  userId: string;
  days: Record<string, PlanDay>;
  settings: PlanSettings;
  notes?: string;
  generatedBy: "claude" | "heuristic";
  updatedAt: string;
}

export interface PlanSettings {
  dailyCalories: number;
  weeklyBudget: number;
  preferences: string;
  tags: string[];
}

export const EMPTY_NUTRIENTS: Nutrients = {
  calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0,
  sodium: 0, potassium: 0, calcium: 0, iron: 0, vitaminC: 0,
};

/** Adult daily reference values (FDA Daily Values) used for % of target. */
export const DAILY_VALUES: Nutrients = {
  calories: 2000, protein: 50, carbs: 275, fat: 78, fiber: 28, sugar: 50,
  sodium: 2300, potassium: 4700, calcium: 1300, iron: 18, vitaminC: 90,
};
