// Persistence for merchants, orders and customer profiles (the add-on's memory across sessions).
// Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production), otherwise JSON files on disk.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEMO_MERCHANT, type Merchant } from "./catalog";
import type { PricedLine, CartLineInput } from "./rules";

export interface Order {
  id: string;
  code: string; // short human code shown on cards, e.g. "MB-4821"
  merchant: string;
  customerId: string;
  customerName: string;
  lines: PricedLine[];
  subtotal: number;
  tax: number;
  total: number;
  pickup: { date: string; window: string; label: string };
  status: "confirmed" | "baking" | "ready" | "picked_up";
  payment: { method: string; last4: string; simulated: true };
  channel: "Alexa+ add-on";
  createdAt: string;
}

export interface Profile {
  customerId: string;
  name: string;
  merchant: string;
  orderIds: string[];
  usual?: { lines: CartLineInput[]; summary: string; savedAt: string };
  notes: string[]; // e.g. "Leo has a tree-nut allergy"
  lastSeenAt: string;
}

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const blobAccess = () => (process.env.BLOB_ACCESS === "public" ? "public" : "private") as "public" | "private";
const dataDir = () => (process.env.VERCEL ? path.join(os.tmpdir(), "storefront-data") : path.join(process.cwd(), ".data"));

async function readJson<T>(key: string): Promise<T | null> {
  if (useBlob()) {
    const { get } = await import("@vercel/blob");
    try {
      const res = await get(key, { access: blobAccess(), useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return JSON.parse(await new Response(res.stream).text()) as T;
    } catch (e) {
      if (String((e as Error)?.name).includes("NotFound") || /not found/i.test(String(e))) return null;
      throw e;
    }
  }
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir(), key), "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value, null, 2);
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(key, body, { access: blobAccess(), allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 });
    return;
  }
  const file = path.join(dataDir(), key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

const merchantKey = (slug: string) => `merchants/${slug}.json`;
const ordersKey = (slug: string) => `orders/${slug}.json`;
const profileKey = (slug: string, customerId: string) => `profiles/${slug}/${customerId}.json`;

export async function getMerchant(slug: string): Promise<Merchant | null> {
  if (slug === DEMO_MERCHANT.slug) return DEMO_MERCHANT;
  return readJson<Merchant>(merchantKey(slug));
}

export async function saveMerchant(m: Merchant): Promise<void> {
  if (m.slug === DEMO_MERCHANT.slug) throw new Error("That storefront name is taken.");
  await writeJson(merchantKey(m.slug), m);
}

export async function listOrders(slug: string): Promise<Order[]> {
  return (await readJson<Order[]>(ordersKey(slug))) ?? [];
}

export async function addOrder(order: Order): Promise<void> {
  const orders = await listOrders(order.merchant);
  orders.unshift(order);
  await writeJson(ordersKey(order.merchant), orders.slice(0, 200));
}

export async function updateOrderStatus(slug: string, id: string, status: Order["status"]): Promise<Order | null> {
  const orders = await listOrders(slug);
  const o = orders.find((x) => x.id === id);
  if (!o) return null;
  o.status = status;
  await writeJson(ordersKey(slug), orders);
  return o;
}

export async function getProfile(slug: string, customerId: string, name: string): Promise<Profile> {
  return (
    (await readJson<Profile>(profileKey(slug, customerId))) ?? {
      customerId,
      name,
      merchant: slug,
      orderIds: [],
      notes: [],
      lastSeenAt: new Date().toISOString(),
    }
  );
}

export async function saveProfile(p: Profile): Promise<void> {
  await writeJson(profileKey(p.merchant, p.customerId), { ...p, lastSeenAt: new Date().toISOString() });
}

// Demo helper: clears orders and the demo customer's profile so a recording starts clean.
export async function resetDemo(slug: string, customerIds: string[]): Promise<void> {
  await writeJson(ordersKey(slug), []);
  for (const id of customerIds) await writeJson(profileKey(slug, id), null);
}

export const STORAGE_BACKEND = () => (useBlob() ? "Vercel Blob" : process.env.VERCEL ? "ephemeral /tmp (set BLOB_READ_WRITE_TOKEN to persist)" : "local .data/ files");
