// PARTS HELPERS - shared lists and small rules for parts, fluids, and stock.

import type { CatalogPart, InventoryItem } from "@/lib/supabase";

// Choices on the Add Part form. Manufacturer also accepts anything typed.
export const MANUFACTURERS = [
  "CAT",
  "John Deere",
  "Case IH",
  "New Holland",
  "AGCO",
  "Kubota",
  "Donaldson",
  "Baldwin",
  "Fleetguard",
  "WIX",
  "Other",
];

export const CATEGORIES = [
  "Oil Filter",
  "Fuel System",
  "Air Filter",
  "Hydraulic",
  "Transmission",
  "DEF",
  "Coolant",
  "Engine Oil",
  "Grease",
  "Belts",
  "Lab/Testing",
  "Other",
];

// "each" is a part; anything measured (gal, qt...) is a fluid
export const UNITS = ["each", "gal", "qt", "L", "oz", "lb", "tube"];

export function isFluid(p: Pick<CatalogPart, "unit"> | null | undefined): boolean {
  return !!p && !!p.unit && p.unit !== "each";
}

// 7.5 gal  |  2  (no unit shown for "each")
export function qtyText(qty: number | null | undefined, unit?: string | null): string {
  if (qty === null || qty === undefined) return "—";
  const n = Number(qty);
  const shown = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  return unit && unit !== "each" ? `${shown} ${unit}` : shown;
}

export type StockStatus = "ok" | "low" | "out";

export function stockStatus(inv: Pick<InventoryItem, "on_hand" | "reorder_at">): StockStatus {
  const n = Number(inv.on_hand);
  if (n <= 0) return "out";
  if (inv.reorder_at !== null && inv.reorder_at !== undefined && n <= Number(inv.reorder_at)) return "low";
  return "ok";
}

export const STOCK_STYLE: Record<StockStatus, string> = {
  ok: "bg-[#E3F4E8] text-[#1F7A3E]",
  low: "bg-cautionSoft text-cautionInk",
  out: "bg-dangerSoft text-danger",
};

// How many to order to get back up to twice the reorder level
export function reorderQty(inv: Pick<InventoryItem, "on_hand" | "reorder_at">): number {
  const target = Math.max(Number(inv.reorder_at || 0) * 2, 1);
  return Math.max(Math.ceil(target - Math.max(Number(inv.on_hand), 0)), 1);
}
