// Deterministic business rules. The MCP server enforces these authoritatively on every call,
// and the Strands agent pre-checks the same rules in a BeforeToolCallEvent hook.
import crypto from "node:crypto";
import { findProduct, type Allergen, type Merchant } from "./catalog";

export interface CartLineInput {
  productId: string;
  quantity?: number;
  sizeId?: string;
  frosting?: string;
  message?: string;
}

export interface PricedLine {
  productId: string;
  name: string;
  quantity: number;
  sizeId?: string;
  sizeLabel?: string;
  frosting?: string;
  message?: string;
  unitPrice: number;
  lineTotal: number;
  allergens: Allergen[];
  custom: boolean;
  palette: [string, string, string];
  shape: string;
}

export interface RuleViolation {
  code:
    | "UNKNOWN_ITEM"
    | "INVALID_SIZE"
    | "INVALID_FROSTING"
    | "MESSAGE_TOO_LONG"
    | "EMPTY_CART"
    | "CLOSED"
    | "UNKNOWN_WINDOW"
    | "LEAD_TIME"
    | "SLOT_FULL"
    | "NUT_CONFIRMATION_REQUIRED";
  message: string;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  tax: number;
  total: number;
  allergens: Allergen[];
  containsNuts: boolean;
  customCakes: number;
  violations: RuleViolation[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const NUTS: Allergen[] = ["tree nuts", "peanuts"];

export function priceCart(merchant: Merchant, input: CartLineInput[]): PricedCart {
  const violations: RuleViolation[] = [];
  const lines: PricedLine[] = [];
  if (!input.length) violations.push({ code: "EMPTY_CART", message: "The order has no items." });
  for (const raw of input) {
    const p = findProduct(merchant, raw.productId);
    if (!p) {
      violations.push({ code: "UNKNOWN_ITEM", message: `"${raw.productId}" is not on ${merchant.name}'s menu.` });
      continue;
    }
    const quantity = Math.max(1, Math.min(20, Math.floor(raw.quantity ?? 1)));
    let unitPrice = p.price;
    let sizeLabel: string | undefined;
    let sizeId: string | undefined;
    if (p.sizes?.length) {
      const size = p.sizes.find((s) => s.id === raw.sizeId || s.label.toLowerCase() === (raw.sizeId ?? "").toLowerCase()) ?? (raw.sizeId ? undefined : p.sizes[0]);
      if (!size) {
        violations.push({ code: "INVALID_SIZE", message: `${p.name} comes in ${p.sizes.map((s) => s.label).join(", ")}.` });
      } else {
        unitPrice = size.price;
        sizeLabel = size.label;
        sizeId = size.id;
      }
    }
    let frosting: string | undefined;
    if (raw.frosting) {
      frosting = merchant.frostings.find((f) => f.toLowerCase() === raw.frosting!.toLowerCase() || f.toLowerCase().includes(raw.frosting!.toLowerCase()));
      if (!frosting || !p.customizable) {
        violations.push({ code: "INVALID_FROSTING", message: `Frosting options for custom cakes: ${merchant.frostings.join(", ")}.` });
      }
    }
    const message = raw.message?.trim() || undefined;
    if (message && message.length > merchant.maxMessageChars) {
      violations.push({ code: "MESSAGE_TOO_LONG", message: `Cake messages can be up to ${merchant.maxMessageChars} characters (this one is ${message.length}).` });
    }
    const custom = Boolean(p.customizable && (message || frosting));
    lines.push({
      productId: p.id,
      name: p.name,
      quantity,
      sizeId,
      sizeLabel,
      frosting,
      message,
      unitPrice,
      lineTotal: round2(unitPrice * quantity),
      allergens: p.allergens,
      custom,
      palette: p.palette,
      shape: p.shape,
    });
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const tax = round2(subtotal * merchant.taxRate);
  const allergens = [...new Set(lines.flatMap((l) => l.allergens))];
  return {
    lines,
    subtotal,
    tax,
    total: round2(subtotal + tax),
    allergens,
    containsNuts: allergens.some((a) => NUTS.includes(a)),
    customCakes: lines.filter((l) => l.custom).reduce((s, l) => s + l.quantity, 0),
    violations,
  };
}

// ---------- Time helpers (merchant-local) ----------

function tzOffsetMinutes(epochMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(epochMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUtc - epochMs) / 60000;
}

export function localToEpoch(date: string, hhmm: string, timeZone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = tzOffsetMinutes(guess, timeZone);
  return guess - offset * 60000;
}

export function localDate(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(epochMs));
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function describeDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

export function describeWindow(window: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
  };
  const [a, b] = window.split("-");
  return `${fmt(a)}–${fmt(b)}`;
}

// ---------- Pickup slots ----------

export interface Slot {
  date: string;
  window: string;
  label: string;
  status: "available" | "full" | "too_soon" | "closed";
  customCakesLeft: number;
  reason?: string;
}

// Existing bookings from other customers are simulated deterministically so the demo shows real capacity limits.
function seededBookings(merchant: Merchant, date: string, window: string): number {
  const h = crypto.createHash("sha256").update(`${merchant.slug}|${date}|${window}`).digest();
  return h[0] % (merchant.customCakesPerWindow + 1);
}

export function slotsForDate(
  merchant: Merchant,
  date: string,
  opts: { hasCustom: boolean; bookedCustom: (date: string, window: string) => number; now?: number },
): Slot[] {
  const now = opts.now ?? Date.now();
  const leadHours = opts.hasCustom ? merchant.leadTimeHours.custom : merchant.leadTimeHours.standard;
  const closed = merchant.closedWeekdays.includes(weekdayOf(date));
  return merchant.pickupWindows.map((window) => {
    const label = `${describeDate(date)}, ${describeWindow(window)}`;
    if (closed) return { date, window, label, status: "closed", customCakesLeft: 0, reason: `${merchant.name} is closed that day.` };
    const start = localToEpoch(date, window.split("-")[0], merchant.timezone);
    const booked = seededBookings(merchant, date, window) + opts.bookedCustom(date, window);
    const left = Math.max(0, merchant.customCakesPerWindow - booked);
    if (start - now < leadHours * 3600_000) {
      return {
        date,
        window,
        label,
        status: "too_soon",
        customCakesLeft: left,
        reason: opts.hasCustom
          ? `Custom cakes need ${merchant.leadTimeHours.custom} hours' notice.`
          : `Orders need ${merchant.leadTimeHours.standard} hours' notice.`,
      };
    }
    if (opts.hasCustom && left <= 0) {
      return { date, window, label, status: "full", customCakesLeft: 0, reason: "The decorators are fully booked for this window." };
    }
    return { date, window, label, status: "available", customCakesLeft: left };
  });
}

export function upcomingDates(merchant: Merchant, days = 10, now = Date.now()): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(localDate(now + i * 86400_000, merchant.timezone));
  return [...new Set(out)];
}

export function resolveDate(merchant: Merchant, input: string, now = Date.now()): string | null {
  const q = input.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const dates = upcomingDates(merchant, 14, now);
  if (q === "today") return dates[0];
  if (q === "tomorrow") return dates[1];
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const idx = names.findIndex((n) => q.includes(n) || q.startsWith(n.slice(0, 3)));
  if (idx >= 0) return dates.slice(1).find((d) => weekdayOf(d) === idx) ?? null;
  return null;
}

export function validateCheckout(
  merchant: Merchant,
  cart: PricedCart,
  pickup: { date: string; window: string },
  nutAllergyConfirmed: boolean,
  bookedCustom: (date: string, window: string) => number,
  now = Date.now(),
): RuleViolation[] {
  const violations = [...cart.violations];
  if (!merchant.pickupWindows.includes(pickup.window)) {
    violations.push({ code: "UNKNOWN_WINDOW", message: `Pickup windows are ${merchant.pickupWindows.map(describeWindow).join(", ")}.` });
  } else {
    const slot = slotsForDate(merchant, pickup.date, { hasCustom: cart.customCakes > 0, bookedCustom, now }).find((s) => s.window === pickup.window)!;
    if (slot.status === "closed") violations.push({ code: "CLOSED", message: slot.reason! });
    if (slot.status === "too_soon") violations.push({ code: "LEAD_TIME", message: slot.reason! });
    if (slot.status === "full" || (cart.customCakes > 0 && slot.customCakesLeft < cart.customCakes)) {
      violations.push({ code: "SLOT_FULL", message: slot.reason ?? "Not enough decorator capacity in that window." });
    }
  }
  if (merchant.nutConfirmationRequired && cart.containsNuts && !nutAllergyConfirmed) {
    const nutty = cart.lines.filter((l) => l.allergens.some((a) => NUTS.includes(a))).map((l) => l.name);
    violations.push({
      code: "NUT_CONFIRMATION_REQUIRED",
      message: `${nutty.join(" and ")} ${nutty.length > 1 ? "contain" : "contains"} tree nuts. Ask the customer to confirm nobody eating it has a nut allergy before checkout.`,
    });
  }
  return violations;
}
