// Merchant kitchen screen API: live orders, status updates, and a demo reset.
import { customerIdFor } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getMerchant, listOrders, resetDemo, updateOrderStatus, STORAGE_BACKEND, type Order } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ merchant: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { merchant: slug } = await ctx.params;
  const merchant = await getMerchant(slug);
  if (!merchant) return Response.json({ error: "not_found" }, { status: 404 });
  const orders = await listOrders(slug);
  const revenue = orders.reduce((s, o) => s + o.subtotal, 0);
  return Response.json(
    {
      merchant: { name: merchant.name, slug, neighborhood: merchant.neighborhood, plan: merchant.plan },
      orders,
      stats: {
        count: orders.length,
        revenue: Math.round(revenue * 100) / 100,
        // What the same orders would have cost in delivery-marketplace commission (DoorDash Plus 25% / Premier 30%).
        commissionAt25: Math.round(revenue * 25) / 100,
        commissionAt30: Math.round(revenue * 30) / 100,
      },
      storage: STORAGE_BACKEND(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request, ctx: Ctx) {
  const { merchant: slug } = await ctx.params;
  const limit = rateLimit(`orders:${clientIp(req)}`, 60, 60_000);
  if (!limit.ok) return Response.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: Order["status"]; reset?: boolean; customers?: string[] };
  if (body.reset) {
    const names = body.customers?.length ? body.customers : ["Maya"];
    await resetDemo(slug, names.map(customerIdFor));
    return Response.json({ ok: true });
  }
  if (!body.id || !["confirmed", "baking", "ready", "picked_up"].includes(body.status ?? "")) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const order = await updateOrderStatus(slug, body.id, body.status!);
  return order ? Response.json({ order }) : Response.json({ error: "not_found" }, { status: 404 });
}
