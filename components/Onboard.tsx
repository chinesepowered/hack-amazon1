"use client";
import { useState } from "react";
import { SAMPLE_CSV } from "@/lib/catalog";

interface Result { slug: string; mcpUrl: string; manifest: Record<string, unknown>; products: number; displayUrl: string; kitchenUrl: string }

export default function Onboard() {
  const [name, setName] = useState("Juniper & Rye");
  const [neighborhood, setNeighborhood] = useState("Elm Avenue");
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, neighborhood, csv }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the add-on.");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-cream text-ink px-8 py-10">
      <div className="max-w-6xl mx-auto">
        <a href="/" className="text-sm text-cocoa">← Storefront in a Box</a>
        <h1 className="font-serif text-5xl mt-3">Put your shop on Alexa+ in two minutes</h1>
        <p className="text-cocoa mt-2 max-w-2xl">Paste your catalog. We generate an MCP server with menu cards, a custom-order studio, pickup scheduling, account linking and checkout, ready to register as an Alexa+ add-on.</p>

        <div className="grid grid-cols-2 gap-8 mt-8">
          <section className="rounded-3xl bg-paper border border-line p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold">
                Shop name
                <input data-testid="shop-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-semibold">
                Street / neighborhood
                <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 font-normal" />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Catalog CSV <span className="font-normal text-crumb">(name, category, price, allergens, description, customizable)</span>
              <textarea data-testid="catalog-csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={10} className="mt-1 w-full rounded-xl border border-line px-3 py-2 font-mono text-[12.5px] font-normal" />
            </label>
            <button data-testid="publish" onClick={submit} disabled={busy} className="w-full rounded-2xl bg-ember text-white font-semibold py-3.5 disabled:opacity-60">
              {busy ? "Generating add-on…" : "Generate my Alexa+ add-on"}
            </button>
            {error && <p className="text-red-700 text-sm">{error}</p>}
          </section>

          <section className="rounded-3xl bg-ink text-cream p-6">
            {result ? (
              <div className="rise space-y-4" data-testid="onboard-result">
                <p className="text-honey text-xs uppercase tracking-[.2em] font-bold">Add-on live · {result.products} products</p>
                <div>
                  <p className="text-xs text-[#c9b8a6]">MCP server (Streamable HTTP)</p>
                  <p className="font-mono text-sm break-all">{result.mcpUrl}</p>
                </div>
                <pre className="rounded-2xl bg-black/40 p-4 text-[11.5px] leading-relaxed overflow-auto max-h-72">{JSON.stringify(result.manifest, null, 2)}</pre>
                <div className="flex gap-3">
                  <a href={result.displayUrl} className="rounded-xl bg-cream text-ink font-semibold px-4 py-2">Try it on the display</a>
                  <a href={result.kitchenUrl} className="rounded-xl border border-white/20 font-semibold px-4 py-2">Kitchen screen</a>
                </div>
              </div>
            ) : (
              <div className="h-full grid place-items-center text-center text-[#c9b8a6]">
                <div>
                  <p className="font-serif text-3xl text-cream">Your add-on appears here</p>
                  <p className="mt-2">Endpoint, account-linking metadata and an add-on manifest.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
