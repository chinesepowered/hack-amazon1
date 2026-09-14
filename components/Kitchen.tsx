"use client";
// Merchant kitchen screen: orders placed through the Alexa+ add-on land here live.
import { useEffect, useRef, useState } from "react";

interface Line { name: string; quantity: number; sizeLabel?: string; frosting?: string; message?: string; allergens: string[] }
interface Order { id: string; code: string; customerName: string; lines: Line[]; total: number; subtotal: number; pickup: { label: string }; status: "confirmed" | "baking" | "ready" | "picked_up"; createdAt: string; channel: string }
interface Data { merchant: { name: string; neighborhood: string; plan: string }; orders: Order[]; stats: { count: number; revenue: number; commissionAt25: number; commissionAt30: number }; storage: string }

const COLUMNS: { key: Order["status"]; title: string; next?: Order["status"]; action?: string }[] = [
  { key: "confirmed", title: "New orders", next: "baking", action: "Start baking" },
  { key: "baking", title: "In the oven", next: "ready", action: "Mark ready" },
  { key: "ready", title: "Ready for pickup", next: "picked_up", action: "Picked up" },
];

const money = (n: number) => `$${n.toFixed(2)}`;

export default function Kitchen({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  const load = async () => {
    const res = await fetch(`/api/orders/${slug}`, { cache: "no-store" });
    if (!res.ok) return;
    const d: Data = await res.json();
    if (seen.current) {
      const added = d.orders.filter((o) => !seen.current!.has(o.id)).map((o) => o.id);
      if (added.length) {
        setFresh(new Set(added));
        setTimeout(() => setFresh(new Set()), 4000);
      }
    }
    seen.current = new Set(d.orders.map((o) => o.id));
    setData(d);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const advance = async (o: Order, status: Order["status"]) => {
    await fetch(`/api/orders/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, status }) });
    load();
  };

  return (
    <main className="min-h-screen bg-[#f4ece0] text-ink p-8">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[.2em] text-ember font-bold">Kitchen screen</p>
          <h1 className="font-serif text-5xl mt-1">{data?.merchant.name ?? "…"}</h1>
          <p className="text-cocoa mt-1">{data?.merchant.neighborhood} · {data?.merchant.plan} plan · orders from the Alexa+ add-on</p>
        </div>
        <div className="flex gap-3">
          <Stat label="Voice orders" value={String(data?.stats.count ?? 0)} />
          <Stat label="Sales" value={money(data?.stats.revenue ?? 0)} />
          <Stat label="Marketplace fees avoided" value={`${money(data?.stats.commissionAt25 ?? 0)}–${money(data?.stats.commissionAt30 ?? 0)}`} hint="vs. 25–30% delivery-app commission" accent />
        </div>
      </header>

      <div className="grid grid-cols-3 gap-5 mt-8">
        {COLUMNS.map((col) => {
          const orders = (data?.orders ?? []).filter((o) => o.status === col.key);
          return (
            <section key={col.key} className="rounded-3xl bg-white/60 border border-line p-4 min-h-[60vh]">
              <div className="flex items-center justify-between px-1 mb-3">
                <h2 className="font-serif text-2xl">{col.title}</h2>
                <span className="rounded-full bg-[#efe5d6] px-2.5 py-0.5 text-sm font-semibold">{orders.length}</span>
              </div>
              <div className="space-y-3">
                {orders.map((o) => (
                  <article key={o.id} data-testid="kitchen-order" className={`rise rounded-2xl bg-paper border border-line p-4 shadow-sm ${fresh.has(o.id) ? "flash" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold">{o.code}</span>
                      <span className="rounded-full bg-[#1f2a44] text-white text-[11px] font-semibold px-2.5 py-0.5">🗣 {o.channel}</span>
                    </div>
                    <p className="font-semibold mt-2">{o.customerName} · pickup {o.pickup.label}</p>
                    <ul className="mt-2 space-y-1.5 text-[15px]">
                      {o.lines.map((l, i) => (
                        <li key={i}>
                          <span className="font-semibold">{l.quantity > 1 ? `${l.quantity} × ` : ""}{l.name}</span>
                          {(l.sizeLabel || l.frosting) && <span className="text-cocoa"> · {[l.sizeLabel, l.frosting].filter(Boolean).join(" · ")}</span>}
                          {l.message && (
                            <div className="mt-1 rounded-lg bg-[#fff4e0] border border-[#f2d59b] px-2.5 py-1 font-serif italic">Pipe: “{l.message}”</div>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between mt-3">
                      <span className="font-bold">{money(o.total)}</span>
                      {col.next && (
                        <button data-testid={`advance-${col.key}`} onClick={() => advance(o, col.next!)} className="rounded-xl bg-ink text-cream text-sm font-semibold px-3 py-1.5">
                          {col.action}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {!orders.length && <p className="text-crumb text-sm px-1">Nothing here yet.</p>}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-crumb mt-6">Demo data is fictional · payments simulated · storage: {data?.storage}</p>
    </main>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl px-5 py-3 border ${accent ? "bg-ink text-cream border-ink" : "bg-paper border-line"}`}>
      <p className={`text-[11px] uppercase tracking-[.14em] font-bold ${accent ? "text-honey" : "text-crumb"}`}>{label}</p>
      <p className="font-serif text-3xl tabular-nums">{value}</p>
      {hint && <p className="text-[11px] opacity-70">{hint}</p>}
    </div>
  );
}
