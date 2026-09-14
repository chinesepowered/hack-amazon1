// The Alexa+ add-on: an MCP server (spec 2025-11-25) generated from a merchant catalog.
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { AccessClaims } from "./auth";
import { signToken, verifyToken, type TokenPayload } from "./auth";
import type { Merchant } from "./catalog";
import { priceCart, resolveDate, slotsForDate, upcomingDates, validateCheckout, describeDate, describeWindow, type CartLineInput, type PricedLine } from "./rules";
import { addOrder, getProfile, listOrders, saveProfile, type Order, type Profile } from "./store";
import { UI } from "./tool-ui";
import { viewHtml } from "./views";

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};

// Text summary for the model, JSON for backwards compatibility, structuredContent for MCP Apps.
function result(summary: string, structured: Record<string, unknown>, isError = false): ToolResult {
  return {
    content: [
      { type: "text", text: summary },
      { type: "text", text: JSON.stringify(structured) },
    ],
    structuredContent: structured,
    isError,
  };
}

const lineSchema = z.object({
  productId: z.string().describe("Product id or exact name from browse_menu"),
  quantity: z.number().int().min(1).max(20).optional(),
  sizeId: z.string().optional().describe('Cake size id: "6in", "8in" or "10in"'),
  frosting: z.string().optional().describe("Frosting name (custom cakes only)"),
  message: z.string().optional().describe("Message piped on top of the cake"),
});

interface DraftClaims extends TokenPayload {
  draftId: string;
  code: string;
  sub: string;
  merchant: string;
  items: CartLineInput[];
  pickup: { date: string; window: string };
  nutAllergyConfirmed: boolean;
}

export function codePrefix(merchant: Merchant): string {
  const words = merchant.name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "S") + (words[1]?.[0] ?? words[0]?.[1] ?? "B")).toUpperCase();
}

function usualFrom(orders: Order[]): { lines: CartLineInput[]; summary: string } | undefined {
  const counts = new Map<string, { line: CartLineInput; n: number; name: string }>();
  for (const o of orders) {
    for (const l of o.lines) {
      if (l.custom) continue;
      const key = `${l.productId}|${l.sizeId ?? ""}`;
      const cur = counts.get(key) ?? { line: { productId: l.productId, quantity: l.quantity, sizeId: l.sizeId }, n: 0, name: l.name };
      cur.n++;
      counts.set(key, cur);
    }
  }
  const lines = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 3);
  if (!lines.length) return undefined;
  return { lines: lines.map((x) => x.line), summary: lines.map((x) => `${x.line.quantity && x.line.quantity > 1 ? `${x.line.quantity} × ` : ""}${x.name}`).join(", ") };
}

function publicOrder(o: Order, merchant: Merchant) {
  return { ...o, merchantName: merchant.name };
}

export const SERVER_INSTRUCTIONS = (m: Merchant) =>
  `You are the ${m.name} add-on (${m.neighborhood}). Customers order baked goods for pickup.
Flow: browse_menu shows the menu card. For custom cakes call design_cake (it opens an interactive cake studio card).
Before checkout, call check_pickup_slots for the requested day, then prepare_checkout with the items and an available window; it opens a checkout card.
The customer pays by tapping Pay on the checkout card, which sends "Confirm order <CODE>". Only then call place_order with that code.
Items with tree nuts need the customer to confirm nobody has a nut allergy (nutAllergyConfirmed). Custom cakes need ${m.leadTimeHours.custom} hours' notice.
Call get_my_profile at the start of a conversation to recall the customer's notes and usual order. Save lasting facts (allergies, preferences) with remember_note.`;

export function buildMcpServer(merchant: Merchant, claims: AccessClaims | null): McpServer {
  const server = new McpServer(
    { name: `storefront-${merchant.slug}`, title: `${merchant.name} (Storefront in a Box)`, version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS(merchant), capabilities: { logging: {} } },
  );
  const requireCustomer = () => {
    if (!claims) throw new Error("Account not linked");
    return claims;
  };
  let ordersCache: Order[] | null = null;
  const orders = async () => (ordersCache ??= await listOrders(merchant.slug));
  const bookedCustomFrom = (all: Order[]) => (date: string, window: string) =>
    all.filter((o) => o.pickup.date === date && o.pickup.window === window && o.status !== "picked_up").reduce((s, o) => s + o.lines.filter((l) => l.custom).reduce((a, l) => a + l.quantity, 0), 0);

  // ---- UI resources (MCP Apps) ----
  const views: [string, string, string][] = [
    ["menu-card", UI.menu, "Menu carousel"],
    ["cake-studio", UI.cakeStudio, "Custom cake designer"],
    ["checkout-card", UI.checkout, "Checkout card with Pay button"],
    ["order-card", UI.order, "Live order status"],
  ];
  for (const [name, uri, description] of views) {
    registerAppResource(server, name, uri, { description, mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: viewHtml(uri)!, _meta: { ui: { prefersBorder: false } } }],
    }));
  }

  // ---- Tools ----
  registerAppTool(
    server,
    "browse_menu",
    {
      title: "Browse the menu",
      description: `Show ${merchant.name}'s menu as a visual carousel. Optionally filter by category (${[...new Set(merchant.products.map((p) => p.category))].join(", ")}).`,
      inputSchema: { category: z.string().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: UI.menu } },
    },
    async ({ category }) => {
      const cat = category?.toLowerCase().replace(/s$/, "");
      const items = merchant.products
        .filter((p) => !cat || p.category.replace(/s$/, "") === cat)
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          price: p.price,
          priceLabel: p.sizes ? `from $${p.sizes[0].price}` : `$${p.price.toFixed(2)}`,
          allergens: p.allergens,
          customizable: Boolean(p.customizable),
          sizes: p.sizes,
          palette: p.palette,
          shape: p.shape,
        }));
      const summary = items.map((i) => `${i.name} (${i.priceLabel}${i.allergens.includes("tree nuts") ? ", contains tree nuts" : ""}${i.customizable ? ", customizable" : ""}) [id: ${i.id}]`).join("; ");
      return result(`${merchant.name} menu${category ? ` (${category})` : ""}: ${summary}`, {
        merchant: { name: merchant.name, tagline: merchant.tagline, neighborhood: merchant.neighborhood },
        category: category ?? "all",
        items,
      });
    },
  );

  registerAppTool(
    server,
    "design_cake",
    {
      title: "Design a custom cake",
      description: "Open the interactive cake studio (flavor, size, frosting, message). Pre-fill anything the customer already said. The customer taps Add to order in the card.",
      inputSchema: {
        productId: z.string().optional(),
        sizeId: z.string().optional(),
        frosting: z.string().optional(),
        message: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: UI.cakeStudio } },
    },
    async ({ productId, sizeId, frosting, message }) => {
      const cakes = merchant.products.filter((p) => p.customizable);
      const chosen = cakes.find((c) => c.id === productId) ?? cakes.find((c) => productId && c.name.toLowerCase().includes(productId.toLowerCase())) ?? cakes[0];
      const selection = {
        productId: chosen.id,
        sizeId: chosen.sizes?.find((s) => s.id === sizeId)?.id ?? chosen.sizes?.[1]?.id,
        frosting: merchant.frostings.find((f) => frosting && f.toLowerCase().includes(frosting.toLowerCase())) ?? merchant.frostings[0],
        message: (message ?? "").slice(0, merchant.maxMessageChars),
      };
      return result(
        `Cake studio opened with ${chosen.name}. The customer will choose options on screen and tap "Add to order". Custom cakes need ${merchant.leadTimeHours.custom} hours' notice.`,
        {
          cakes: cakes.map((c) => ({ id: c.id, name: c.name, sizes: c.sizes, allergens: c.allergens, palette: c.palette })),
          frostings: merchant.frostings,
          maxMessageChars: merchant.maxMessageChars,
          leadTimeHours: merchant.leadTimeHours.custom,
          selection,
        },
      );
    },
  );

  server.registerTool(
    "check_pickup_slots",
    {
      title: "Check pickup times",
      description: 'List pickup windows for a day ("saturday", "tomorrow" or YYYY-MM-DD), applying lead time and decorator capacity for the given items.',
      inputSchema: { day: z.string(), items: z.array(lineSchema) },
      annotations: { readOnlyHint: true },
    },
    async ({ day, items }) => {
      const date = resolveDate(merchant, day);
      if (!date) return result(`I couldn't understand the day "${day}". Try a weekday name or YYYY-MM-DD.`, { violations: [{ code: "BAD_DATE", message: `Unknown day "${day}"` }] }, true);
      const cart = priceCart(merchant, items);
      const slots = slotsForDate(merchant, date, { hasCustom: cart.customCakes > 0, bookedCustom: bookedCustomFrom(await orders()) });
      const open = slots.filter((s) => s.status === "available");
      const summary = open.length
        ? `${describeDate(date)}: available ${open.map((s) => `${describeWindow(s.window)} (window "${s.window}")`).join(", ")}. Unavailable: ${slots.filter((s) => s.status !== "available").map((s) => `${describeWindow(s.window)} ${s.status}`).join(", ") || "none"}.`
        : `${describeDate(date)} has no available pickup windows: ${slots[0]?.reason ?? "fully booked"}. Suggest another day.`;
      return result(summary, { date, dateLabel: describeDate(date), slots, nextDays: upcomingDates(merchant, 7) });
    },
  );

  server.registerTool(
    "get_my_profile",
    {
      title: "Recall this customer",
      description: "Returns the linked customer's name, saved notes (allergies, preferences), usual order and recent orders. Call at the start of a conversation.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const c = requireCustomer();
      const profile = await getProfile(merchant.slug, c.sub, c.name);
      const mine = (await orders()).filter((o) => o.customerId === c.sub);
      const usual = usualFrom(mine);
      const recent = mine.slice(0, 3).map((o) => ({ code: o.code, placed: o.createdAt, pickup: o.pickup.label, items: o.lines.map((l) => l.name).join(", "), status: o.status }));
      const summary = `Customer ${profile.name}. Notes: ${profile.notes.length ? profile.notes.join("; ") : "none"}. Usual order: ${usual ? `${usual.summary} (lines: ${JSON.stringify(usual.lines)})` : "none yet"}. Recent orders: ${recent.length ? recent.map((r) => `${r.code} ${r.items}`).join(" | ") : "none"}.`;
      return result(summary, { name: profile.name, notes: profile.notes, usual: usual ?? null, recent });
    },
  );

  server.registerTool(
    "remember_note",
    {
      title: "Remember something about this customer",
      description: 'Save a lasting fact for future conversations, e.g. "Leo (son) has a tree-nut allergy".',
      inputSchema: { note: z.string().min(3).max(140) },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ note }) => {
      const c = requireCustomer();
      const profile: Profile = await getProfile(merchant.slug, c.sub, c.name);
      const clean = note.trim();
      if (!profile.notes.some((n) => n.toLowerCase() === clean.toLowerCase())) profile.notes = [...profile.notes, clean].slice(-10);
      await saveProfile(profile);
      return result(`Saved note for ${profile.name}: "${clean}". It will be recalled in future sessions.`, { notes: profile.notes });
    },
  );

  registerAppTool(
    server,
    "prepare_checkout",
    {
      title: "Prepare checkout",
      description: "Price the order, validate pickup window, lead time, decorator capacity and allergen confirmation, then show the checkout card with a Pay button. Does not charge anything.",
      inputSchema: {
        items: z.array(lineSchema).min(1),
        pickupDay: z.string().describe('"saturday", "tomorrow" or YYYY-MM-DD'),
        pickupWindow: z.string().describe('Window like "10:00-12:00" from check_pickup_slots'),
        nutAllergyConfirmed: z.boolean().optional().describe("True only if the customer confirmed nobody eating it has a nut allergy"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: UI.checkout } },
    },
    async ({ items, pickupDay, pickupWindow, nutAllergyConfirmed }) => {
      const c = requireCustomer();
      const date = resolveDate(merchant, pickupDay);
      const cart = priceCart(merchant, items);
      const violations = date
        ? validateCheckout(merchant, cart, { date, window: pickupWindow }, Boolean(nutAllergyConfirmed), bookedCustomFrom(await orders()))
        : [{ code: "UNKNOWN_WINDOW" as const, message: `Unknown pickup day "${pickupDay}".` }];
      if (violations.length) {
        return result(`Cannot prepare checkout: ${violations.map((v) => `[${v.code}] ${v.message}`).join(" ")}`, { title: "Let's fix a couple of things", violations }, true);
      }
      const draftId = crypto.randomUUID();
      const code = `${codePrefix(merchant)}-${String(crypto.randomInt(1000, 10000))}`;
      const pickup = { date: date!, window: pickupWindow, label: `${describeDate(date!)}, ${describeWindow(pickupWindow)}` };
      const draftToken = signToken("draft", { draftId, code, sub: c.sub, merchant: merchant.slug, items, pickup, nutAllergyConfirmed: Boolean(nutAllergyConfirmed) }, 15 * 60);
      const structured = {
        draftCode: code,
        draftToken,
        merchant: merchant.name,
        customer: c.name,
        lines: cart.lines,
        subtotal: cart.subtotal,
        tax: cart.tax,
        total: cart.total,
        pickup,
        allergyNote: cart.containsNuts ? "Nut allergy check confirmed" : cart.allergens.length ? `Contains ${cart.allergens.join(", ")}` : "",
        payment: { method: "Card on file", last4: "4242", simulated: true },
      };
      return result(
        `Checkout card shown: ${cart.lines.map((l) => l.name).join(", ")}; total $${cart.total.toFixed(2)}; pickup ${pickup.label}. Confirmation code ${code}. Wait for the customer to tap Pay (they will say "Confirm order ${code}"), then call place_order with confirmationCode "${code}" and draftToken "${draftToken}".`,
        structured,
      );
    },
  );

  registerAppTool(
    server,
    "place_order",
    {
      title: "Place the order",
      description: "Charge the card on file (simulated) and send the order to the bakery. Only call after the customer tapped Pay / said the confirmation code.",
      inputSchema: { draftToken: z.string(), confirmationCode: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      _meta: { ui: { resourceUri: UI.order } },
    },
    async ({ draftToken, confirmationCode }) => {
      const c = requireCustomer();
      const draft = verifyToken<DraftClaims>(draftToken, "draft");
      if (!draft || draft.sub !== c.sub || draft.merchant !== merchant.slug) {
        return result("This checkout expired or belongs to someone else. Prepare checkout again.", { title: "Checkout expired", violations: [{ code: "DRAFT_INVALID", message: "Please review the order again." }] }, true);
      }
      if (confirmationCode.trim().toUpperCase() !== draft.code) {
        return result(`Confirmation code mismatch. The customer must confirm ${draft.code}.`, { title: "Needs confirmation", violations: [{ code: "CONFIRMATION_MISMATCH", message: `Tap Pay to confirm ${draft.code}.` }] }, true);
      }
      const all = await orders();
      const existing = all.find((o) => o.id === draft.draftId);
      if (existing) return result(`Order ${existing.code} was already placed.`, { order: publicOrder(existing, merchant) });
      const cart = priceCart(merchant, draft.items);
      const violations = validateCheckout(merchant, cart, draft.pickup, draft.nutAllergyConfirmed, bookedCustomFrom(all));
      if (violations.length) return result(`Cannot place order: ${violations.map((v) => v.message).join(" ")}`, { title: "That slot just filled up", violations }, true);
      const order: Order = {
        id: draft.draftId,
        code: draft.code,
        merchant: merchant.slug,
        customerId: c.sub,
        customerName: c.name,
        lines: cart.lines as PricedLine[],
        subtotal: cart.subtotal,
        tax: cart.tax,
        total: cart.total,
        pickup: { ...draft.pickup, label: `${describeDate(draft.pickup.date)}, ${describeWindow(draft.pickup.window)}` },
        status: "confirmed",
        payment: { method: "Card on file", last4: "4242", simulated: true },
        channel: "Alexa+ add-on",
        createdAt: new Date().toISOString(),
      };
      await addOrder(order);
      const profile = await getProfile(merchant.slug, c.sub, c.name);
      profile.orderIds = [order.id, ...profile.orderIds].slice(0, 50);
      await saveProfile(profile);
      return result(`Order ${order.code} placed: $${order.total.toFixed(2)}, pickup ${order.pickup.label}. ${merchant.name} can see it now.`, { order: publicOrder(order, merchant) });
    },
  );

  registerAppTool(
    server,
    "order_status",
    {
      title: "Order status",
      description: "Show the live status of the customer's order (latest if no code given).",
      inputSchema: { code: z.string().optional() },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: UI.order, visibility: ["model", "app"] } },
    },
    async ({ code }) => {
      const c = requireCustomer();
      const mine = (await orders()).filter((o) => o.customerId === c.sub);
      const order = code ? mine.find((o) => o.code === code.toUpperCase()) : mine[0];
      if (!order) return result("No matching order for this customer.", { title: "No order found", violations: [] }, true);
      return result(`Order ${order.code} is ${order.status}; pickup ${order.pickup.label}.`, { order: publicOrder(order, merchant) });
    },
  );

  return server;
}
