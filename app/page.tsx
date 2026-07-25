"use client";

// The home page is a traffic director:
//   Not logged in  -> /login
//   Logged in, no farm yet -> /setup
//   Logged in with a farm  -> /equipment

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, getMyFarm } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function route() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      const farm = await getMyFarm();
      router.replace(farm ? "/equipment" : "/setup");
    }
    route();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-faded text-sm tracking-widest uppercase">
        Loading Fleet Suite…
      </p>
    </main>
  );
}
