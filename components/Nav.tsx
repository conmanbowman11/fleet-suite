"use client";

// THE SIDEBAR - main navigation on every screen.
//   Desktop / tablet: a navy sidebar fixed on the left.
//   Phone: a navy top bar with a menu button that slides the sidebar out.
// Shows the farm, the sections (with an open-issues count), and who's
// working. "Switch user" only appears on shared devices.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarCheck,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Settings,
  Tractor,
  TriangleAlert,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import type { Key } from "@/lib/i18n";

const SECTIONS: { key: Key; path: string; Icon: typeof Tractor }[] = [
  { key: "nav_dashboard", path: "/dashboard", Icon: LayoutDashboard },
  { key: "nav_equipment", path: "/equipment", Icon: Tractor },
  { key: "nav_pm", path: "/pm", Icon: CalendarCheck },
  { key: "nav_issues", path: "/issues", Icon: TriangleAlert },
  { key: "nav_orders", path: "/orders", Icon: ClipboardList },
  { key: "nav_settings", path: "/settings", Icon: Settings },
];

export default function Nav() {
  const { farm, person, device, t, clearPerson } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openIssues, setOpenIssues] = useState(0);
  const shared = device?.mode !== "personal";

  // Close the phone menu whenever the page changes
  useEffect(() => setOpen(false), [pathname]);

  // Open-issues count for the badge
  useEffect(() => {
    supabase
      .from("issues")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .then(({ count }) => setOpenIssues(count || 0));
  }, [pathname]);

  const current = SECTIONS.find((s) => pathname.startsWith(s.path));

  function switchUser() {
    clearPerson();
    router.push("/who");
  }

  const panel = (
    <div className="flex h-full flex-col bg-navy px-3 py-4 text-[#B7C6D8]">
      <div className="mb-1 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-safety text-white">
          <Tractor size={18} aria-hidden="true" />
        </span>
        <span className="text-base font-semibold text-white">Fleet Suite</span>
      </div>
      <p className="mb-5 truncate px-2 text-xs text-[#7F95AD]">{farm?.name}</p>

      <nav className="flex flex-col gap-0.5">
        {SECTIONS.map(({ key, path, Icon }) => {
          const active = pathname.startsWith(path);
          return (
            <Link
              key={path}
              href={path}
              aria-current={active ? "page" : undefined}
              className={
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium " +
                (active ? "bg-safety text-white" : "hover:bg-navyLight hover:text-white")
              }
            >
              <Icon size={18} aria-hidden="true" />
              <span className="flex-1">{t(key)}</span>
              {path === "/issues" && openIssues > 0 && (
                <span className="rounded-full bg-danger px-2 text-xs font-semibold text-white">{openIssues}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[#24456A] px-2 pt-3 text-sm">
        {person && (
          <>
            <p className="font-medium text-white">{person.name}</p>
            <p className="text-xs text-[#7F95AD]">{t(person.role === "owner" ? "role_owner" : "role_mechanic")}</p>
          </>
        )}
        {shared ? (
          <button onClick={switchUser} className="mt-2 text-xs text-[#B7C6D8] underline hover:text-white">
            {t("switch_user")}
          </button>
        ) : (
          <Link href="/device" className="mt-2 inline-block text-xs text-[#B7C6D8] underline hover:text-white">
            {t("this_device")}
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop / tablet sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 md:block">{panel}</aside>

      {/* Phone top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-navy px-3 py-2.5 text-white md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Menu" className="rounded p-1.5 hover:bg-navyLight">
          <Menu size={22} aria-hidden="true" />
        </button>
        <span className="text-base font-semibold">{current ? t(current.key) : "Fleet Suite"}</span>
        <span className="max-w-[30%] truncate text-sm text-[#B7C6D8]">{person?.name}</span>
      </header>

      {/* Phone slide-out menu */}
      {open && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-2 top-3 z-10 rounded p-1.5 text-[#B7C6D8] hover:text-white"
            >
              <X size={20} aria-hidden="true" />
            </button>
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
