"use client";

// ORDERS PAGE
// Pick a machine -> pick a service kit -> its parts are pre-checked ->
// create the order. You get a printable manifest and a pre-written
// email to the supplier. Every order is saved for the paper trail.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, getMyFarm } from "@/lib/supabase";
import Nav from "@/components/Nav";

export default function OrdersPage() {
  const router = useRouter();
  const [farm, setFarm] = useState<any>(null);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [equipmentId, setEquipmentId] = useState("");
  const [parts, setParts] = useState<any[]>([]);
  const [kitFilter, setKitFilter] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [supplier, setSupplier] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Past orders + manifest view
  const [orders, setOrders] = useState<any[]>([]);
  const [manifest, setManifest] = useState<any>(null); // {order, items}
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const myFarm = await getMyFarm();
      if (!myFarm) {
        router.replace("/login");
        return;
      }
      setFarm(myFarm);
      const [{ data: eq }, { data: types }, { data: past }] = await Promise.all([
        supabase.from("equipment").select("*").eq("is_active", true).order("nickname"),
        supabase.from("service_types").select("*").order("name"),
        supabase
          .from("orders")
          .select("*, order_items(*)")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setEquipment(eq || []);
      setServiceTypes(types || []);
      setOrders(past || []);
      setLoading(false);
    }
    load();
  }, [router]);

  // When a machine is chosen, load its parts list
  useEffect(() => {
    async function loadParts() {
      if (!equipmentId) {
        setParts([]);
        return;
      }
      const { data } = await supabase
        .from("parts")
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("part_number");
      setParts(data || []);
      setChecked({});
      setQty({});
      setKitFilter("");
    }
    loadParts();
  }, [equipmentId]);

  // Choosing a service kit pre-checks that kit's parts
  function applyKit(serviceTypeId: string) {
    setKitFilter(serviceTypeId);
    if (!serviceTypeId) return;
    const next: Record<string, boolean> = {};
    const nextQty: Record<string, number> = { ...qty };
    for (const p of parts) {
      if (p.service_type_id === serviceTypeId) {
        next[p.id] = true;
        nextQty[p.id] = nextQty[p.id] || p.typical_quantity || 1;
      }
    }
    setChecked(next);
    setQty(nextQty);
  }

  function toggle(partId: string, typical: number) {
    setChecked({ ...checked, [partId]: !checked[partId] });
    if (!qty[partId]) setQty({ ...qty, [partId]: typical || 1 });
  }

  async function createOrder() {
    setMessage("");
    const chosen = parts.filter((p) => checked[p.id]);
    if (chosen.length === 0) {
      setMessage("Check at least one part.");
      return;
    }
    if (!supplier.trim()) {
      setMessage("Enter the supplier name.");
      return;
    }
    setBusy(true);

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        farm_id: farm.id,
        supplier: supplier.trim(),
        supplier_email: null,
      })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    const items = chosen.map((p) => ({
      order_id: order.id,
      part_number: p.part_number,
      description: p.description,
      quantity: qty[p.id] || 1,
    }));

    const { error: itemError } = await supabase.from("order_items").insert(items);
    if (itemError) {
      setMessage(itemError.message);
      setBusy(false);
      return;
    }

    const fullOrder = { ...order, order_items: items };
    setOrders([fullOrder, ...orders]);
    setManifest(fullOrder);
    setChecked({});
    setSupplier("");
    setBusy(false);
  }

  async function deleteOrder(order: any) {
    const ok = window.confirm(
      "Delete this order? This cannot be undone."
    );
    if (!ok) return;
    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setOrders(orders.filter((o) => o.id !== order.id));
    setManifest(null);
  }

  function orderText(order: any) {
    const lines = [
      `Parts order from ${farm?.name}`,
      `Supplier: ${order.supplier}`,
      `Date: ${new Date(order.created_at).toLocaleDateString()}`,
      "",
      ...order.order_items.map(
        (i: any) =>
          `- ${i.part_number}  x${i.quantity}${i.description ? `  (${i.description})` : ""}`
      ),
      "",
      "Please confirm availability and pricing. Thank you.",
    ];
    return lines.join("\n");
  }

  async function copyOrder(order: any) {
    try {
      await navigator.clipboard.writeText(orderText(order));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the order below:", orderText(order));
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-faded tracking-widest uppercase">Loading…</p>
      </main>
    );
  }

  const machine = equipment.find((e) => e.id === equipmentId);
  const kitsOnMachine = serviceTypes.filter((t) =>
    parts.some((p) => p.service_type_id === t.id)
  );

  // ------- Manifest view (after creating, or opening a past order) -------
  if (manifest) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <Nav farmName={farm?.name} />
        <div className="no-print mb-4 flex items-center justify-between">
          <button onClick={() => setManifest(null)} className="text-sm text-faded underline">
            ← Back to orders
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => copyOrder(manifest)}
              className="rounded bg-safety px-4 py-2 text-sm font-bold text-white hover:bg-safetyDark"
            >
              {copied ? "Copied ✓" : "Copy for email"}
            </button>
            <button
              onClick={() => window.print()}
              className="rounded border border-steel px-4 py-2 text-sm font-bold text-steel hover:bg-steel hover:text-white"
            >
              Print
            </button>
          </div>
        </div>

        <div className="print-sheet rounded-lg border border-seam bg-plate p-5 shadow-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-faded">
            {farm?.name} — Parts Order
          </div>
          <h1 className="text-xl font-bold">{manifest.supplier}</h1>
          <p className="mb-4 text-sm text-faded">
            {formatDate(manifest.created_at)}
            {manifest.supplier_email ? ` · ${manifest.supplier_email}` : ""}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faded">
                <th className="py-2 pr-2">Part number</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {manifest.order_items.map((i: any, idx: number) => (
                <tr key={idx} className="border-t border-seam">
                  <td className="py-2 pr-2 font-mono font-semibold">{i.part_number}</td>
                  <td className="py-2 pr-2">{i.description || "—"}</td>
                  <td className="py-2 text-right font-mono">{i.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="no-print mt-6 text-center">
          <button
            onClick={() => deleteOrder(manifest)}
            className="text-sm text-faded underline hover:text-safety"
          >
            Delete this order
          </button>
        </div>
      </main>
    );
  }

  // ------- Builder view -------
  return (
    <main className="mx-auto max-w-2xl p-4">
      <Nav farmName={farm?.name} />

      <div className="mb-4 rounded-lg border border-seam bg-plate p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Build a parts order</h2>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-faded">
          Machine
        </label>
        <select
          value={equipmentId}
          onChange={(e) => setEquipmentId(e.target.value)}
          className="mb-3 w-full rounded border border-seam bg-plate p-3"
        >
          <option value="">Choose machine…</option>
          {equipment.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.nickname} {[eq.make, eq.model].filter(Boolean).join(" ")}
            </option>
          ))}
        </select>

        {equipmentId && parts.length === 0 && (
          <p className="rounded bg-field p-3 text-sm text-faded">
            No parts entered for {machine?.nickname} yet. Open the machine on the
            Equipment tab and add its filters/parts first — then they show up here.
          </p>
        )}

        {parts.length > 0 && (
          <>
            {kitsOnMachine.length > 0 && (
              <>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-faded">
                  Fill from a service kit
                </label>
                <select
                  value={kitFilter}
                  onChange={(e) => applyKit(e.target.value)}
                  className="mb-3 w-full rounded border border-seam bg-plate p-3"
                >
                  <option value="">Pick parts manually…</option>
                  {kitsOnMachine.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} kit
                    </option>
                  ))}
                </select>
              </>
            )}

            <div className="mb-3 divide-y divide-seam rounded border border-seam">
              {parts.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-3 hover:bg-field"
                >
                  <input
                    type="checkbox"
                    checked={!!checked[p.id]}
                    onChange={() => toggle(p.id, p.typical_quantity)}
                    className="h-5 w-5 accent-[#D9480F]"
                  />
                  <span className="flex-1">
                    <span className="font-mono font-semibold">{p.part_number}</span>
                    <span className="block text-sm text-faded">
                      {p.description || "—"}
                      {p.service_type_id
                        ? ` · ${serviceTypes.find((t) => t.id === p.service_type_id)?.name || ""} kit`
                        : ""}
                    </span>
                  </span>
                  {checked[p.id] && (
                    <input
                      type="number"
                      min={1}
                      value={qty[p.id] || 1}
                      onChange={(e) =>
                        setQty({ ...qty, [p.id]: Number(e.target.value) })
                      }
                      className="w-16 rounded border border-seam p-2 text-right"
                    />
                  )}
                </label>
              ))}
            </div>

            <input
              className="mb-3 w-full rounded border border-seam p-3"
              placeholder="Supplier name"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />

            {message && (
              <p className="mb-3 rounded bg-orange-50 p-3 text-sm text-safety">
                {message}
              </p>
            )}

            <button
              onClick={createOrder}
              disabled={busy}
              className="w-full rounded bg-safety p-3 font-bold text-white hover:bg-safetyDark disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create order manifest"}
            </button>
          </>
        )}
      </div>

      {/* Past orders */}
      <div className="rounded-lg border border-seam bg-plate p-4 shadow-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-faded">
          Order history
        </h2>
        {orders.length === 0 ? (
          <p className="py-3 text-sm text-faded">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-seam">
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => setManifest(o)}
                  className="flex w-full items-center justify-between py-3 text-left hover:bg-field"
                >
                  <span>
                    <span className="font-semibold">{o.supplier}</span>
                    <span className="block text-sm text-faded">
                      {o.order_items?.length || 0} item
                      {(o.order_items?.length || 0) === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="font-mono text-sm text-faded">
                    {formatDate(o.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
