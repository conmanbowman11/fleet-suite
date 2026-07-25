"use client";

// The navigation bar shown on Equipment / Orders / Services pages.

import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const tabs = [
  { label: "Equipment", path: "/equipment" },
  { label: "Orders", path: "/orders" },
  { label: "Services", path: "/services" },
];

export default function Nav({ farmName }: { farmName?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="no-print mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold uppercase tracking-wider">
          {farmName || "Fleet Suite"}
        </h1>
        <button onClick={signOut} className="text-sm text-faded underline">
          Sign out
        </button>
      </div>
      <div className="flex gap-1 border-b border-seam">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.path);
          return (
            <button
              key={t.path}
              onClick={() => router.push(t.path)}
              className={
                "px-4 py-2 text-sm font-bold uppercase tracking-wider " +
                (active
                  ? "border-b-2 border-safety text-ink"
                  : "text-faded hover:text-ink")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
