// Onboarding: turn a catalog CSV into a live Alexa+ add-on (MCP endpoint + manifest + Agent Skill).
import { originOf } from "@/lib/auth";
import { DEMO_MERCHANT, parseCatalogCsv, slugify, type Merchant } from "@/lib/catalog";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getMerchant, saveMerchant } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limit = rateLimit(`onboard:${clientIp(req)}`, 6, 10 * 60_000);
  if (!limit.ok) return Response.json({ error: "Too many storefronts from this address. Try again later." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; neighborhood?: string; tagline?: string; csv?: string };
  const name = (body.name ?? "").trim().slice(0, 48);
  if (name.length < 3) return Response.json({ error: "Give your shop a name." }, { status: 400 });
  let products;
  try {
    products = parseCatalogCsv(body.csv ?? "");
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (products.length > 60) return Response.json({ error: "Up to 60 products on the Starter plan." }, { status: 400 });

  let slug = slugify(name) || "shop";
  if (slug === DEMO_MERCHANT.slug || (await getMerchant(slug))) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const merchant: Merchant = {
    ...DEMO_MERCHANT,
    slug,
    name,
    tagline: (body.tagline ?? "").trim().slice(0, 90) || "Now taking orders on Alexa+.",
    neighborhood: (body.neighborhood ?? "").trim().slice(0, 40) || "Main Street",
    nutConfirmationRequired: products.some((p) => p.allergens.some((a) => a === "tree nuts" || a === "peanuts")),
    products,
    plan: "Starter",
    createdAt: new Date().toISOString(),
  };
  await saveMerchant(merchant);

  const origin = originOf(req);
  const mcpUrl = `${origin}/api/mcp/${slug}`;
  // Mirrors the fields an Alexa+ MCP add-on manifest needs (see `alexa-ai new mcp`): endpoint, auth, descriptions.
  const manifest = {
    name: `${name}`,
    locale: "en-US",
    mcpServerUrl: mcpUrl,
    transport: "streamable-http",
    protocolVersion: "2025-11-25",
    accountLinking: {
      type: "OAUTH2_PKCE_S256",
      authorizationServerMetadata: `${origin}/.well-known/oauth-authorization-server`,
      protectedResourceMetadata: `${origin}/.well-known/oauth-protected-resource/api/mcp/${slug}`,
    },
    shortDescription: `Order from ${name} for pickup`,
    examplePhrases: [`What's on the menu at ${name}?`, `Order my usual from ${name}`, `Design a birthday cake`],
    ui: "MCP Apps (ui:// resources)",
  };
  return Response.json({ slug, mcpUrl, manifest, products: products.length, displayUrl: `${origin}/device?merchant=${slug}`, kitchenUrl: `${origin}/merchant/${slug}` });
}
