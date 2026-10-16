// The connection to the Supabase database, plus the shapes of each table.
// Every page imports "supabase" from here.

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- Table shapes ----------

export type Farm = {
  id: string;
  owner_user_id: string;
  name: string;
  contact_email: string | null;
  max_miles_per_day: number;
};

export type Person = {
  id: string;
  farm_id: string;
  name: string;
  role: "mechanic" | "owner";
  language: "en" | "es";
  is_active: boolean;
};

export type ServiceName = {
  id: string;
  farm_id: string | null; // null = built-in
  name: string;
  name_es: string | null;
  category: "service" | "repair";
  is_hidden: boolean;
};

export type CatalogPart = {
  id: string;
  farm_id: string;
  part_number: string;
  part_key: string;
  description: string | null;
  manufacturer: string | null;
  category: string | null;
  unit: string; // "each", "gal", "qt"...
  is_hidden: boolean;
};

export type InventoryItem = {
  id: string;
  farm_id: string;
  part_id: string;
  on_hand: number;
  reorder_at: number | null;
  created_at: string;
};

export type MeterType = "hours" | "miles" | "none";

export type Equipment = {
  id: string;
  farm_id: string;
  nickname: string;
  unit_number: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  meter_type: MeterType;
  current_reading: number | null;
  is_active: boolean;
  created_at: string;
};

export type MachineService = {
  id: string;
  farm_id: string;
  equipment_id: string;
  service_name_id: string;
  category: "service" | "repair";
  interval_meter: number | null;
  interval_months: number | null;
  tasks: string[]; // checklist shown on every service
  notes: string | null;
  is_retired: boolean;
};

export type KitPart = {
  id: string;
  machine_service_id: string;
  part_id: string;
  quantity: number;
};

export type LogEntry = {
  id: string;
  farm_id: string;
  equipment_id: string;
  machine_service_id: string;
  person_id: string | null;
  service_date: string; // YYYY-MM-DD
  meter_reading: number | null;
  notes: string | null;
  batch_id: string | null;
  kind: "service" | "repair";
  done_by: "crew" | "outside" | null; // repairs: who did the work
  vendor: string | null; // repairs: the outside shop
  checklist: ChecklistItem[];
  files: FileRef[]; // repairs: invoices and photos
  edited_at: string | null;
  edited_by: string | null;
  created_at: string;
};

export type ChecklistItem = { text: string; done: boolean };
export type FileRef = { path: string; name: string; type: string };

export type PartUsed = {
  id: string;
  log_entry_id: string;
  part_id: string | null;
  part_number: string;
  description: string | null;
  quantity: number;
  from_stock: boolean; // came out of inventory (goes back if deleted)
};

export type Issue = {
  id: string;
  farm_id: string;
  equipment_id: string;
  title: string;
  notes: string | null;
  priority: "urgent" | "normal" | "low";
  status: "open" | "fixed";
  reported_by: string | null;
  fixed_by_log: string | null;
  reported_at: string;
  fixed_at: string | null;
};

export type Order = {
  id: string;
  farm_id: string;
  note: string | null;
  created_at: string;
};

export type OrderLine = {
  id: string;
  order_id: string;
  part_id: string | null;
  part_number: string;
  description: string | null;
  quantity: number;
};

// ---------- Helpers ----------

// The farm that belongs to the logged-in account (null if none yet)
export async function getMyFarm(): Promise<Farm | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return null;
  const { data } = await supabase
    .from("farms")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  return (data as Farm) || null;
}

// Cleans a part number the same way the database does,
// so "1R-0762", "1r0762" and "1R 0762" all match.
export function partKey(partNumber: string): string {
  return partNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// Today's date as YYYY-MM-DD in the device's own time zone
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
