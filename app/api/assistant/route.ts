// The simulated Alexa+ brain: a Strands Agents SDK agent that uses the merchant's add-on through Strands' MCP client
// (Streamable HTTP), with deterministic guardrail hooks. Streams NDJSON events to the display.
import { Agent, AfterToolCallEvent, BeforeModelCallEvent, BeforeToolCallEvent, McpClient, ModelMessageEvent } from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { originOf } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { priceCart, resolveDate, validateCheckout, type CartLineInput } from "@/lib/rules";
import { getMerchant, listOrders } from "@/lib/store";
import { DRAFT_CODE_RE, TOOL_UI } from "@/lib/tool-ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_MODEL_CALLS = 10;

const SYSTEM = (shop: string, name: string | null) => `You are a friendly voice assistant on a kitchen smart display, like Alexa+. The customer is ordering from ${shop} through its add-on tools.
${name ? `The linked customer is ${name}.` : "The customer has not linked an account yet; they can browse, but checkout needs account linking."}
Speak in one or two short, warm sentences. The on-screen cards show details, so never read out long lists or prices line by line.
Rules:
- At the start of a new conversation the customer's saved memory is provided in brackets; use their notes naturally (e.g. allergies) and don't call get_my_profile again unless asked.
- "Show the menu" / "what do you have" -> browse_menu. Custom or birthday cakes -> design_cake, pre-filling anything they said.
- When the customer mentions an allergy or lasting preference, call remember_note.
- When they add items, ask for pickup day if unknown, call check_pickup_slots, then prepare_checkout with an available window (choose the earliest available if they didn't specify).
- If an item contains tree nuts, ask whether anyone eating it has a nut allergy before prepare_checkout. Only set nutAllergyConfirmed=true if they clearly said nobody does.
- "The usual" means the usual order from get_my_profile.
- When the user says "Confirm order <CODE>", call place_order with that confirmationCode and the draftToken from the matching prepare_checkout result. Never call place_order otherwise.
- If a tool is blocked by a guardrail, explain it briefly and ask the customer what to do.`;

type Emit = (event: Record<string, unknown>) => void;

function parseResultJson(content: unknown[]): Record<string, unknown> | null {
  for (const block of content ?? []) {
    const text = (block as { text?: string })?.text;
    if (typeof text === "string" && text.trim().startsWith("{")) {
      try {
        return JSON.parse(text);
      } catch {
        /* not JSON */
      }
    }
  }
  return null;
}

function firstText(content: unknown[]): string {
  const t = (content ?? []).map((b) => (b as { text?: string })?.text).find((x) => typeof x === "string" && !x.trim().startsWith("{"));
  return t ?? "";
}

export async function POST(req: Request) {
  const limit = rateLimit(`assistant:${clientIp(req)}`, 30, 5 * 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { merchant?: string; text?: string; token?: string; messages?: unknown[]; customerName?: string };
  const slug = body.merchant ?? "marigold";
  const text = (body.text ?? "").trim().slice(0, 500);
  if (!text) return Response.json({ error: "Say something first." }, { status: 400 });
  const merchant = await getMerchant(slug);
  if (!merchant) return Response.json({ error: "Unknown storefront." }, { status: 404 });

  const origin = originOf(req);
  const history = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
  const userTexts = [text, ...history.filter((m) => (m as { role?: string }).role === "user").flatMap((m) => ((m as { content?: { text?: string }[] }).content ?? []).map((c) => c.text ?? ""))];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit: Emit = (event) => controller.enqueue(encoder.encode(JSON.stringify({ ...event, t: Date.now() }) + "\n"));
      const mcp = new McpClient({
        url: `${origin}/api/mcp/${slug}`,
        headers: body.token ? { Authorization: `Bearer ${body.token}` } : undefined,
        applicationName: "Storefront Display (Strands Agents)",
        applicationVersion: "1.0.0",
      });
      try {
        const model = new OpenAIModel({
          api: "chat",
          apiKey: process.env.OPENAI_API_KEY,
          modelId: process.env.OPENAI_MODEL,
          clientConfig: { baseURL: process.env.OPENAI_BASE_URL, timeout: 60_000, maxRetries: 2 },
          params: { temperature: 0, chat_template_kwargs: { enable_thinking: false } },
        });
        const agent = new Agent({
          model,
          tools: [mcp],
          systemPrompt: SYSTEM(merchant.name, body.customerName ?? null),
          messages: history as never,
          printer: false,
        });

        const started = new Map<string, number>();
        let modelCalls = 0;

        agent.addHook(BeforeModelCallEvent, (e) => {
          modelCalls++;
          if (modelCalls > MAX_MODEL_CALLS) {
            e.cancel = "Step limit reached for this request.";
            emit({ type: "hook", rule: "step-cap", decision: "blocked", reason: `More than ${MAX_MODEL_CALLS} model calls` });
          }
        });

        // Deterministic guardrails, evaluated before the add-on is called.
        agent.addHook(BeforeToolCallEvent, async (e) => {
          const name = e.toolUse.name;
          const input = (e.toolUse.input ?? {}) as Record<string, unknown>;
          started.set(e.toolUse.toolUseId, Date.now());
          emit({ type: "tool_call", id: e.toolUse.toolUseId, name, input, ui: TOOL_UI[name] ?? null });

          const block = (rule: string, reason: string) => {
            e.cancel = `Blocked by ${rule} guardrail: ${reason}`;
            emit({ type: "hook", id: e.toolUse.toolUseId, tool: name, rule, decision: "blocked", reason });
          };
          const allow = (rule: string, reason: string) => emit({ type: "hook", id: e.toolUse.toolUseId, tool: name, rule, decision: "allowed", reason });

          if (name === "place_order") {
            const code = String(input.confirmationCode ?? "").toUpperCase();
            const said = DRAFT_CODE_RE.exec(text.toUpperCase())?.[0];
            if (!said || said !== code) return block("explicit-purchase-confirmation", "Money only moves after the customer taps Pay on the checkout card.");
            return allow("explicit-purchase-confirmation", `Customer confirmed ${code} on screen`);
          }
          if (name === "prepare_checkout") {
            const items = (input.items ?? []) as CartLineInput[];
            const cart = priceCart(merchant, items);
            if (merchant.nutConfirmationRequired && cart.containsNuts) {
              if (input.nutAllergyConfirmed !== true) return block("allergen-check", "An item contains tree nuts; ask about nut allergies first.");
              const addressed = userTexts.some((t) => /\bnut|allerg/i.test(t));
              if (!addressed) return block("allergen-check", "The customer hasn't answered the nut-allergy question in their own words.");
            }
            const date = resolveDate(merchant, String(input.pickupDay ?? ""));
            if (date) {
              const all = await listOrders(merchant.slug);
              const booked = (d: string, w: string) =>
                all.filter((o) => o.pickup.date === d && o.pickup.window === w).reduce((s, o) => s + o.lines.filter((l) => l.custom).reduce((a, l) => a + l.quantity, 0), 0);
              const v = validateCheckout(merchant, cart, { date, window: String(input.pickupWindow ?? "") }, true, booked).find((x) => x.code === "LEAD_TIME" || x.code === "SLOT_FULL" || x.code === "CLOSED");
              if (v) return block(v.code === "LEAD_TIME" ? "lead-time" : "slot-capacity", v.message);
            }
            return allow("allergen-check · lead-time · slot-capacity", cart.containsNuts ? "Nut allergy answered by customer" : "No nut allergens; slot has capacity");
          }
        });

        agent.addHook(AfterToolCallEvent, (e) => {
          const id = e.toolUse.toolUseId;
          const content = (e.result?.content ?? []) as unknown[];
          const structured = parseResultJson(content);
          emit({
            type: "tool_result",
            id,
            name: e.toolUse.name,
            status: e.result?.status ?? (e.error ? "error" : "success"),
            ms: Date.now() - (started.get(id) ?? Date.now()),
            summary: firstText(content).slice(0, 400),
            structured,
            ui: TOOL_UI[e.toolUse.name] ?? null,
          });
        });

        agent.addHook(ModelMessageEvent, (e) => {
          const said = (e.message.content ?? [])
            .map((b) => (b as { text?: string }).text)
            .filter((x): x is string => typeof x === "string")
            .join(" ")
            .trim();
          if (said) emit({ type: "say", text: said });
        });

        emit({ type: "start", merchant: merchant.name, model: process.env.OPENAI_MODEL, mcp: `${origin}/api/mcp/${slug}` });

        // New session with a linked account: recall the customer deterministically before the model speaks.
        let userPrompt = text;
        if (!history.length && body.token) {
          const profileTool = (await mcp.listTools()).find((t) => t.name === "get_my_profile");
          if (profileTool) {
            const id = "recall-" + Date.now();
            emit({ type: "tool_call", id, name: "get_my_profile", input: {}, ui: null, reason: "new session" });
            const t0 = Date.now();
            const raw = (await mcp.callTool(profileTool, {})) as { content?: { text?: string }[] };
            const summary = firstText((raw?.content ?? []) as unknown[]);
            emit({ type: "tool_result", id, name: "get_my_profile", status: "success", ms: Date.now() - t0, summary, structured: parseResultJson((raw?.content ?? []) as unknown[]), ui: null });
            userPrompt = `[Customer memory from get_my_profile: ${summary}]\n${text}`;
          }
        }

        for await (const _event of agent.stream(userPrompt)) {
          void _event;
        }
        emit({ type: "done", messages: JSON.parse(JSON.stringify(agent.messages)) });
      } catch (err) {
        emit({ type: "error", message: (err as Error).message ?? String(err) });
      } finally {
        await mcp.disconnect().catch(() => {});
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
