// Streamable HTTP endpoint for a merchant's Alexa+ add-on (MCP spec 2025-11-25).
// Stateless JSON-response mode so it runs on serverless; one McpServer per request.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerFrom, originOf, verifyToken, type AccessClaims } from "@/lib/auth";
import { buildMcpServer } from "@/lib/mcp-server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getMerchant } from "@/lib/store";
import { AUTH_REQUIRED_TOOLS } from "@/lib/tool-ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ merchant: string }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const started = Date.now();
  const { merchant: slug } = await ctx.params;
  const self = originOf(req);

  // DNS-rebinding / cross-site protection: browsers always send Origin; server-to-server clients (Alexa+, Strands) don't.
  const origin = req.headers.get("origin");
  const allowed = (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && origin !== self && !allowed.includes(origin)) {
    return Response.json({ error: "forbidden_origin", message: `Origin ${origin} is not allowed.` }, { status: 403 });
  }
  if (req.method !== "POST") {
    return Response.json(
      { error: "method_not_allowed", message: "Stateless server: send JSON-RPC with POST (Streamable HTTP, JSON responses)." },
      { status: 405, headers: { Allow: "POST" } },
    );
  }
  const limit = rateLimit(`mcp:${clientIp(req)}`, 180, 60_000);
  if (!limit.ok) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const merchant = await getMerchant(slug);
  if (!merchant) return Response.json({ error: "not_found", message: `No storefront "${slug}".` }, { status: 404 });

  const wwwAuthenticate = `Bearer resource_metadata="${self}/.well-known/oauth-protected-resource/api/mcp/${slug}", scope="orders:read orders:write profile"`;
  const unauthorized = (message: string) =>
    Response.json({ error: "unauthorized", message }, { status: 401, headers: { "WWW-Authenticate": wwwAuthenticate } });

  const token = bearerFrom(req);
  const claims = token ? verifyToken<AccessClaims>(token, "access") : null;
  if (token && (!claims || claims.merchant !== slug)) return unauthorized("Access token is invalid or expired.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  // Browsing is public; anything tied to a customer triggers account linking with a plain HTTP 401.
  const messages = (Array.isArray(body) ? body : [body]) as { method?: string; params?: { name?: string } }[];
  if (!claims && messages.some((m) => m?.method === "tools/call" && AUTH_REQUIRED_TOOLS.has(m.params?.name ?? ""))) {
    return unauthorized("Access token required to use this tool.");
  }

  const server = buildMcpServer(merchant, claims);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req, { parsedBody: body });
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-MCP-Latency-Ms", String(Date.now() - started));
  return new Response(res.body, { status: res.status, headers });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
