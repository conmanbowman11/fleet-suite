"use client";

// THE TAB BAR at the top of every main screen.
// Shows the farm, who's working, and the five tabs.
// "Switch user" only appears on shared devices - a personal device
// is changed in Settings → This device.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import type { Key } from "@/lib/i18n";

const tabs: { key: Key; path: string }[] = [
  { key: "nav_equipment", path: "/equipment" },
  { key: "nav_pm", path: "/pm" },
  { key: "nav_issues", path: "/issues" },
  { key: "nav_orders", path: "/orders" },
  { key: "nav_settings", path: "/settings" },
];

export default function Nav() {
  const { farm, person, device, t, clearPerson } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const shared = device?.mode !== "personal";

  function switchUser() {
    clearPerson();
    router.push("/who");
  }

  return (
    <div className="no-print mb-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold uppercase tracking-wider">
            {farm?.name || "Fleet Suite"}
          </p>
          {person && <p className="text-sm text-faded">{person.name}</p>}
        </div>
        {person && shared && (
          <button onClick={switchUser} className="shrink-0 pt-1 text-sm text-faded underline">
            {t("switch_user")}
          </button>
        )}
      </div>
      <nav className="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-seam">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              aria-current={active ? "page" : undefined}
              className={
                "shrink-0 px-3 py-2 text-sm font-bold uppercase tracking-wider " +
                (active ? "border-b-2 border-safety text-ink" : "text-faded hover:text-ink")
              }
            >
              {t(tab.key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
