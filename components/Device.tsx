"use client";
// Simulated Alexa+ smart display. Voice (Web Speech API) or typed input goes to a Strands agent that uses the
// merchant's MCP add-on; MCP App cards render on screen and the right panel shows every tool call and guardrail.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppFrame, { type Card } from "./AppFrame";
import { forgetAccount, freshAccount, loadAccount, startLinking, type LinkedAccount } from "./auth-client";

type Activity =
  | { kind: "call"; id: string; name: string; input: Record<string, unknown>; ui: string | null; reason?: string }
  | { kind: "result"; id: string; name: string; status: string; ms: number; summary: string }
  | { kind: "hook"; id: string; rule: string; decision: "allowed" | "blocked"; reason: string; tool?: string }
  | { kind: "user"; id: string; text: string }
  | { kind: "say"; id: string; text: string };

type SpeechRec = { start: () => void; stop: () => void; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; lang: string; interimResults: boolean };

const short = (v: unknown) => {
  const s = JSON.stringify(v);
  return s.length > 90 ? s.slice(0, 88) + "…" : s;
};

export default function Device() {
  const params = useSearchParams();
  const slug = params.get("merchant") ?? "marigold";
  const [account, setAccount] = useState<LinkedAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [card, setCard] = useState<Card | null>(null);
  const [caption, setCaption] = useState<string>("");
  const [heard, setHeard] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [clock, setClock] = useState("");
  const [greeting, setGreeting] = useState("Hello");
  const [shop, setShop] = useState("Marigold Bakery");
  const logRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<unknown[]>([]);
  const busyRef = useRef(false);
  const queueRef = useRef<string[]>([]);

  useEffect(() => {
    setAccount(loadAccount(slug));
    try {
      const saved = JSON.parse(sessionStorage.getItem(`storefront:msgs:${slug}`) ?? "[]");
      messagesRef.current = saved;
      setMessages(saved);
    } catch {}
    fetch(`/api/orders/${slug}`)
      .then((r) => r.json())
      .then((d) => d.merchant?.name && setShop(d.merchant.name))
      .catch(() => {});
    setReady(true);
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      setGreeting(now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening");
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [slug]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [activity]);

  const speak = (text: string) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.03;
      window.speechSynthesis.speak(u);
    } catch {}
  };

  const run = useCallback(
    async (clean: string) => {
      setHeard(clean);
      setCaption("");
      setActivity((a) => [...a, { kind: "user", id: crypto.randomUUID(), text: clean }]);
      const acct = await freshAccount(slug);
      setAccount(acct);
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant: slug, text: clean, token: acct?.access, customerName: acct?.name, messages: messagesRef.current }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Something went wrong." }));
        setCaption(err.error ?? "Something went wrong.");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const inputs = new Map<string, Record<string, unknown>>();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "tool_call") {
            inputs.set(e.id, e.input ?? {});
            setActivity((a) => [...a, { kind: "call", id: e.id, name: e.name, input: e.input ?? {}, ui: e.ui, reason: e.reason }]);
          } else if (e.type === "hook") {
            setActivity((a) => [...a, { kind: "hook", id: `${e.id}-${e.rule}-${e.t}`, rule: e.rule, decision: e.decision, reason: e.reason, tool: e.tool }]);
          } else if (e.type === "tool_result") {
            setActivity((a) => [...a, { kind: "result", id: `${e.id}-r`, name: e.name, status: e.status, ms: e.ms, summary: e.summary }]);
            if (e.ui && e.structured && e.status === "success" && !e.structured.violations) {
              setCard({ id: e.id, tool: e.name, uri: e.ui, input: inputs.get(e.id) ?? {}, summary: e.summary, structured: e.structured });
            }
          } else if (e.type === "say") {
            setCaption(e.text);
            setActivity((a) => [...a, { kind: "say", id: `say-${e.t}`, text: e.text }]);
            speak(e.text);
          } else if (e.type === "done") {
            messagesRef.current = e.messages;
            setMessages(e.messages);
            sessionStorage.setItem(`storefront:msgs:${slug}`, JSON.stringify(e.messages));
          } else if (e.type === "error") {
            setCaption("Sorry, I lost my train of thought. Try that again?");
          }
        }
      }
    },
    [slug],
  );

  // Utterances (typed, spoken, or sent by an MCP App via ui/message) are processed one at a time, in order.
  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      queueRef.current.push(clean);
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        while (queueRef.current.length) {
          const next = queueRef.current.shift()!;
          try {
            await run(next);
          } catch {
            setCaption("Sorry, something went wrong. Try again?");
          }
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [run],
  );

  const newSession = () => {
    messagesRef.current = [];
    setMessages([]);
    sessionStorage.removeItem(`storefront:msgs:${slug}`);
    setCard(null);
    setCaption("");
    setHeard("");
    setActivity([]);
  };

  const listen = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Rec) {
      setCaption("Voice input isn't available in this browser. Type instead.");
      return;
    }
    const rec = new Rec();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (ev) => send(ev.results[0][0].transcript);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const linked = Boolean(account);

  return (
    <main data-busy={busy ? "1" : "0"} className="h-screen bg-[radial-gradient(1200px_700px_at_30%_20%,#3a2a20,#15100d)] text-cream flex gap-6 p-6 overflow-hidden">
      {/* Smart display */}
      <section className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-full bg-gradient-to-br from-honey to-ember grid place-items-center text-lg">🥐</span>
            <div>
              <p className="font-serif text-xl leading-none">Storefront in a Box</p>
              <p className="text-xs text-[#c9b8a6]">Simulated Alexa+ display · MCP add-on for {shop}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <a href={`/merchant/${slug}`} target="_blank" className="rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10" data-testid="open-kitchen">
              Kitchen screen ↗
            </a>
            <button onClick={newSession} data-testid="new-session" className="rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10">
              New session
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 rounded-[38px] bg-[#0d0a08] p-4 shadow-[0_40px_120px_-30px_rgba(0,0,0,.8)] border border-white/5">
          <div className="relative h-full rounded-[26px] bg-cream text-ink overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-7 pt-5">
              <span className="font-serif text-3xl tabular-nums" suppressHydrationWarning>
                {clock}
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#f3eadc] text-cocoa text-xs font-semibold px-3 py-1">{shop} add-on</span>
                {ready &&
                  (linked ? (
                    <span data-testid="linked" className="rounded-full bg-[#e3efe2] text-[#35603a] text-xs font-semibold px-3 py-1">
                      ● Linked as {account!.name}
                    </span>
                  ) : (
                    <button data-testid="link-account" onClick={() => startLinking(slug)} className="rounded-full bg-ember text-white text-xs font-semibold px-3 py-1.5">
                      Link account
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-7 py-3" data-testid="card-area">
              {card ? (
                <AppFrame key={card.id} slug={slug} token={account?.access ?? null} card={card} onMessage={send} />
              ) : (
                <div className="h-full grid place-items-center text-center">
                  <div>
                    <p className="font-serif text-4xl leading-tight" suppressHydrationWarning>
                      {greeting}
                      {account?.name ? `, ${account.name}` : ""}.
                    </p>
                    <p className="text-crumb mt-3">Try “What cakes do you have?” or “Order my usual.”</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-7 pb-5 pt-2 shrink-0 border-t border-line/60">
              <p className="text-sm text-crumb mb-1 truncate min-h-5" data-testid="heard">
                {heard ? `“${heard}”` : ""}
              </p>
              <p className="font-serif text-[21px] leading-snug line-clamp-2 min-h-[58px]" data-testid="caption">
                {busy && !caption ? <span className="text-crumb">Thinking…</span> : caption}
              </p>
            </div>
          </div>
        </div>

        <form
          className="mt-4 flex items-center gap-3 shrink-0"
          onSubmit={(e) => {
            e.preventDefault();
            const t = input;
            setInput("");
            send(t);
          }}
        >
          <button type="button" onClick={listen} aria-label="Push to talk" className={`relative h-14 w-14 shrink-0 rounded-full bg-ember grid place-items-center ${listening ? "listening" : ""}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="relative">
              <rect x="9" y="3" width="6" height="12" rx="3" fill="#fff" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <input
            data-testid="agent-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={linked ? "Hold the mic or type what you'd say…" : "Link your account to order, or ask about the menu…"}
            className="flex-1 h-14 rounded-2xl bg-white/10 border border-white/10 px-5 text-cream placeholder:text-[#a8988a] outline-none focus:border-honey"
          />
          <button className="h-14 rounded-2xl bg-cream text-ink font-semibold px-6">{busy ? "…" : "Send"}</button>
        </form>
      </section>

      {/* Activity panel */}
      <aside className="w-[400px] shrink-0 rounded-3xl bg-black/35 border border-white/10 flex flex-col min-h-0">
        <div className="px-5 pt-5 pb-3 border-b border-white/10">
          <p className="text-[11px] uppercase tracking-[.2em] text-honey font-bold">Strands agent · MCP activity</p>
          <p className="text-xs text-[#c9b8a6] mt-1">MCP 2025-11-25 · Streamable HTTP · /api/mcp/{slug}</p>
          <div className="flex gap-3 mt-2 text-[11px] text-[#a8988a]">
            <span>{messages.length} messages in this session</span>
            <span>·</span>
            <button
              onClick={() => {
                forgetAccount(slug);
                setAccount(null);
              }}
              className="underline decoration-dotted"
            >
              unlink
            </button>
          </div>
        </div>
        <div ref={logRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin p-4 space-y-2 text-[13px]" data-testid="activity">
          {activity.length === 0 && <p className="text-[#a8988a]">Tool calls, guardrail decisions and latencies show up here.</p>}
          {activity.map((a) => {
            if (a.kind === "user") return <div key={a.id} className="rise rounded-xl bg-white/5 px-3 py-2 text-[#e9dccd]">🗣 {a.text}</div>;
            if (a.kind === "say") return <div key={a.id} className="rise px-1 text-[#c9b8a6] italic">“{a.text}”</div>;
            if (a.kind === "call")
              return (
                <div key={a.id} data-testid="tool-call" className="rise rounded-xl border border-white/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-honey">{a.name}</span>
                    {a.ui && <span className="text-[10px] rounded bg-honey/20 text-honey px-1.5 py-0.5">MCP App</span>}
                    {a.reason && <span className="text-[10px] text-[#a8988a]">{a.reason}</span>}
                  </div>
                  <div className="font-mono text-[11px] text-[#a8988a] truncate">{short(a.input)}</div>
                </div>
              );
            if (a.kind === "hook")
              return (
                <div
                  key={a.id}
                  data-testid={`hook-${a.decision}`}
                  className={`rise rounded-xl px-3 py-2 ${a.decision === "blocked" ? "bg-[#7f1d1d]/60 border border-red-400/40" : "bg-[#1f3a24]/60 border border-green-400/20"}`}
                >
                  <div className="font-semibold">
                    {a.decision === "blocked" ? "⛔ Guardrail blocked" : "✓ Guardrail passed"} <span className="font-mono font-normal text-[11px] opacity-80">{a.rule}</span>
                  </div>
                  <div className="text-[12px] opacity-90">{a.reason}</div>
                </div>
              );
            return (
              <div key={a.id} className="rise flex items-center justify-between px-1 text-[11px] text-[#a8988a]">
                <span className="truncate">
                  ↳ {a.status === "success" ? "ok" : a.status} · {a.summary.slice(0, 60)}
                </span>
                <span className={`font-mono ml-2 shrink-0 ${a.ms < 500 ? "text-green-300" : "text-honey"}`}>{a.ms} ms</span>
              </div>
            );
          })}
        </div>
      </aside>
    </main>
  );
}
