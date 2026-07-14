// This file creates the connection to your Supabase database.
// Every page in the app imports "supabase" from here.
// The two values come from Environment Variables you set in Vercel.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper: gets the farm row for the logged-in user (or null if none yet)
export async function getMyFarm() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return null;
  const { data: farm } = await supabase
    .from("farms")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  return farm;
}
