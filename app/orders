"use client";

// ORDERS - build a parts list to send the supplier.
//   - Add kits from machines (tap "500 Hour Service kit" and its parts drop in)
//   - Add any part from the catalog by hand
//   - The same part from several machines is combined into one line
//   - Save, then Print or Copy for email
//   - Order history: open, edit, or delete past orders

import { useEffect, useState } from "react";
import {
  supabase,
  CatalogPart,
  Equipment,
  KitPart,
  MachineService,
  Order,
  OrderLine,
  ServiceName,
} from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { formatDate, jobName } from "@/lib/i18n";
import {
  AppPage,
  ErrorText,
  Field,
  Loading,
  btnOutline,
  btnPrimary,
  btnQuiet,
  cardCls,
  inputCls,
  labelCls,
} from "@/components/ui";
import PartPicker from "@/components/PartPicker";

type Job = MachineService & { service_names: ServiceName | null };
type Kit = KitPart & { parts_catalog: CatalogPart | null };
type Line = { part_id: string | null; part_number: string; description: string | null; quantity: number };
type FullOrder = Order & { order_lines: OrderLine[] };

export default function OrdersPage() {
  return (
    <AppPage>
      <Orders />
    </AppPage>
  );
}

function Orders() {
  const { farm, t, lang } = useSession();

  const [machines, setMachines] = useState<Equipment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [catalog, setCatalog] = useState<CatalogPart[]>([]);
  const [history, setHistory] = useState<FullOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<FullOrder | null>(null);
  const [viewing, setViewing] = useState<FullOrder | null>(null);
  const [machineId, setMachineId] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [added, setAdded] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [eq, js, cat, ord] = await Promise.all([
        supabase.from("equipment").select("*").eq("is_active", true).order("nickname"),
        supabase.from("machine_services").select("*, service_names(*)").eq("is_retired", false),
        supabase.from("parts_catalog").select("*").order("part_key"),
        supabase.from("orders").select("*, order_lines(*)").order("created_at", { ascending: false }),
      ]);
      const allJobs = (js.data as Job[]) || [];
      let allKits: Kit[] = [];
      if (allJobs.length) {
        const { data } = await supabase
          .from("kit_parts")
          .select("*, parts_catalog(*)")
          .in("machine_service_id", allJobs.map((j) => j.id));
        allKits = (data as Kit[]) || [];
      }
      setMachines((eq.data as Equipment[]) || []);
      setJobs(allJobs);
      setKits(allKits);
      setCatalog((cat.data as CatalogPart[]) || []);
      setHistory((ord.data as FullOrder[]) || []);
      setLoading(false);
    })();
  }, []);

  // ---------- Building the list ----------
  function addLine(l: Line) {
    setLines((ls) => {
      const same = ls.find((x) => (l.part_id ? x.part_id === l.part_id : x.part_number === l.part_number));
      if (same) return ls.map((x) => (x === same ? { ...x, quantity: x.quantity + l.quantity } : x));
      return [...ls, l];
    });
  }

  function addKit(job: Job) {
    const parts = kits.filter((k) => k.machine_service_id === job.id && k.parts_catalog);
    for (const k of parts) {
      addLine({
        part_id: k.part_id,
        part_number: k.parts_catalog!.part_number,
        description: k.parts_catalog!.description,
        quantity: k.quantity,
      });
    }
    const m = machines.find((x) => x.id === job.equipment_id);
    setAdded(`✓ ${m?.nickname} — ${jobName(job.service_names, lang)}`);
  }

  function setQty(i: number, qty: number) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, quantity: qty } : l)));
  }

  function resetBuilder() {
    setLines([]);
    setNote("");
    setEditing(null);
    setAdded("");
    setMachineId("");
  }

  async function saveOrder() {
    setMessage("");
    const valid = lines.filter((l) => l.quantity > 0);
    if (!valid.length) return setMessage(t("order_empty"));
    setBusy(true);

    let orderId = editing?.id;
    let createdAt = editing?.created_at || new Date().toISOString();
    if (editing) {
      const { error } = await supabase.from("orders").update({ note: note.trim() || null }).eq("id", editing.id);
      if (error) return fail(error.message);
      await supabase.from("order_lines").delete().eq("order_id", editing.id);
    } else {
      const { data, error } = await supabase
        .from("orders")
        .insert({ farm_id: farm!.id, note: note.trim() || null })
        .select()
        .single();
      if (error) return fail(error.message);
      orderId = (data as Order).id;
      createdAt = (data as Order).created_at || createdAt;
    }

    const { data: saved, error } = await supabase
      .from("order_lines")
      .insert(valid.map((l) => ({ ...l, farm_id: farm!.id, order_id: orderId })))
      .select();
    if (error) return fail(error.message);

    const full: FullOrder = {
      id: orderId!,
      farm_id: farm!.id,
      note: note.trim() || null,
      created_at: createdAt,
      order_lines: (saved as OrderLine[]) || [],
    };
    setHistory((h) => [full, ...h.filter((o) => o.id !== full.id)]);
    setBusy(false);
    resetBuilder();
    setViewing(full);
  }

  function fail(msg: string) {
    setBusy(false);
    setMessage(msg || t("offline_error"));
  }

  // ---------- Past orders ----------
  function startEdit(o: FullOrder) {
    setViewing(null);
    setEditing(o);
    setNote(o.note || "");
    setLines(
      o.order_lines.map((l) => ({
        part_id: l.part_id,
        part_number: l.part_number,
        description: l.description,
        quantity: l.quantity,
      }))
    );
  }

  async function deleteOrder(o: FullOrder) {
    if (!window.confirm(t("delete_order_confirm"))) return;
    const { error } = await supabase.from("orders").delete().eq("id", o.id);
    if (error) return setMessage(error.message);
    setHistory((h) => h.filter((x) => x.id !== o.id));
    setViewing(null);
  }

  function orderText(o: FullOrder) {
    return [
      t("order_from", { farm: farm?.name || "" }),
      `${t("date")}: ${formatDate(o.created_at)}`,
      ...(o.note ? [o.note] : []),
      "",
      ...o.order_lines.map(
        (l) => `- ${l.part_number}  x${l.quantity}${l.description ? `  (${l.description})` : ""}`
      ),
      "",
      t("order_closing"),
    ].join("\n");
  }

  async function copyOrder(o: FullOrder) {
    try {
      await navigator.clipboard.writeText(orderText(o));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("copy"), orderText(o));
    }
  }

  if (loading) return <Loading />;

  // ---------- One order (printable) ----------
  if (viewing) {
    return (
      <>
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
          <button onClick={() => setViewing(null)} className={btnQuiet}>
            ← {t("orders")}
          </button>
          <div className="flex gap-2">
            <button onClick={() => copyOrder(viewing)} className={`${btnPrimary} py-2 text-sm`}>
              {copied ? t("copied") : t("copy_for_email")}
            </button>
            <button onClick={() => window.print()} className={`${btnOutline} py-2 text-sm`}>
              {t("print")}
            </button>
          </div>
        </div>

        <div className={`${cardCls} print-sheet`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-faded">{farm?.name}</p>
          <h1 className="text-xl font-bold">{t("order_from", { farm: farm?.name || "" })}</h1>
          <p className="mb-3 text-sm text-faded">{formatDate(viewing.created_at)}</p>
          {viewing.note && <p className="mb-3 whitespace-pre-line text-sm">{viewing.note}</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faded">
                <th className="py-2 pr-2">{t("part_number")}</th>
                <th className="py-2 pr-2">{t("description")}</th>
                <th className="py-2 text-right">{t("qty")}</th>
              </tr>
            </thead>
            <tbody>
              {viewing.order_lines.map((l) => (
                <tr key={l.id} className="border-t border-seam">
                  <td className="py-2 pr-2 font-mono font-semibold">{l.part_number}</td>
                  <td className="py-2 pr-2">{l.description || "—"}</td>
                  <td className="py-2 text-right font-mono">{l.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="no-print mt-6 flex justify-center gap-6 text-sm">
          <button onClick={() => startEdit(viewing)} className={btnQuiet}>
            {t("edit")}
          </button>
          <button onClick={() => deleteOrder(viewing)} className={`${btnQuiet} hover:text-safety`}>
            {t("delete")}
          </button>
        </div>
      </>
    );
  }

  // ---------- Builder ----------
  const machineJobs = jobs
    .filter((j) => j.equipment_id === machineId && kits.some((k) => k.machine_service_id === j.id))
    .sort((a, b) => jobName(a.service_names, lang).localeCompare(jobName(b.service_names, lang)));

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">{t("build_order")}</h1>

      <section className={`${cardCls} mb-4 space-y-4`}>
        {/* Add kits */}
        <div>
          <p className={labelCls}>{t("from_kits")}</p>
          <select
            className={inputCls}
            value={machineId}
            onChange={(e) => {
              setMachineId(e.target.value);
              setAdded("");
            }}
          >
            <option value="">{t("pick_machine")}</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.unit_number ? `#${m.unit_number} ` : ""}
                {m.nickname}
              </option>
            ))}
          </select>
          {machineId && (
            <div className="mt-2 flex flex-wrap gap-2">
              {machineJobs.length === 0 ? (
                <p className="text-sm text-faded">{t("no_kit")}</p>
              ) : (
                machineJobs.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => addKit(j)}
                    className="rounded border border-steel bg-plate px-3 py-2 text-sm font-bold text-steel hover:bg-steel hover:text-white"
                  >
                    + {jobName(j.service_names, lang)}
                  </button>
                ))
              )}
            </div>
          )}
          {added && <p className="mt-2 text-sm text-steel">{added}</p>}
        </div>

        {/* Add by hand */}
        <div>
          {showPicker ? (
            <>
              <p className={labelCls}>{t("add_by_hand")}</p>
              <PartPicker
                catalog={catalog}
                onCatalogChange={(p) => setCatalog((c) => [...c.filter((x) => x.id !== p.id), p])}
                onPick={(p) => {
                  addLine({ part_id: p.id, part_number: p.part_number, description: p.description, quantity: 1 });
                  setShowPicker(false);
                }}
              />
              <button onClick={() => setShowPicker(false)} className={`${btnQuiet} mt-2`}>
                {t("cancel")}
              </button>
            </>
          ) : (
            <button onClick={() => setShowPicker(true)} className="text-sm font-bold text-safety">
              + {t("add_by_hand")}
            </button>
          )}
        </div>
      </section>

      {/* The list */}
      <section className={`${cardCls} mb-4`}>
        <p className={labelCls}>
          {t("order_list")} ({lines.length})
        </p>
        {lines.length === 0 ? (
          <p className="py-2 text-sm text-faded">{t("order_empty")}</p>
        ) : (
          <ul className="divide-y divide-seam">
            {lines.map((l, i) => (
              <li key={(l.part_id || l.part_number) + i} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-mono font-semibold">{l.part_number}</span>
                  {l.description && <span className="ml-2 text-sm text-faded">{l.description}</span>}
                </span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  aria-label={t("qty")}
                  value={l.quantity}
                  onChange={(e) => setQty(i, Number(e.target.value))}
                  className="w-16 rounded border border-seam p-2 text-right"
                />
                <button
                  onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                  aria-label={t("remove")}
                  className="px-2 text-faded hover:text-safety"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3">
          <Field label={t("order_note")}>
            <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        <ErrorText>{message}</ErrorText>
        <div className="mt-3 flex gap-2">
          <button disabled={busy} onClick={saveOrder} className={`${btnPrimary} flex-1`}>
            {busy ? t("saving") : t("create_order")}
          </button>
          {(lines.length > 0 || editing) && (
            <button onClick={resetBuilder} className={btnOutline}>
              {t("cancel")}
            </button>
          )}
        </div>
      </section>

      {/* History */}
      <section className={cardCls}>
        <p className={labelCls}>{t("order_history")}</p>
        {history.length === 0 ? (
          <p className="py-2 text-sm text-faded">{t("no_orders")}</p>
        ) : (
          <ul className="divide-y divide-seam">
            {history.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => setViewing(o)}
                  className="flex w-full items-baseline justify-between gap-3 py-3 text-left hover:bg-field"
                >
                  <span className="min-w-0">
                    <span className="font-semibold">{t("n_items", { n: o.order_lines.length })}</span>
                    {o.note && <span className="block truncate text-sm text-faded">{o.note}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-sm text-faded">{formatDate(o.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
