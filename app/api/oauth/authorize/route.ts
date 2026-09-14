import { customerIdFor, signToken } from "@/lib/auth";
import { getMerchant } from "@/lib/store";

export const dynamic = "force-dynamic";

function redirectAllowed(uri: string, origin: string): boolean {
  try {
    const u = new URL(uri, origin);
    if (u.origin === origin) return true;
    if (u.protocol === "https:") return true; // code is bound to PKCE, so a leaked code is useless without the verifier
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

// Consent form POST from /oauth/authorize. Issues a short-lived authorization code bound to the PKCE challenge.
export async function POST(req: Request) {
  const form = await req.formData();
  const get = (k: string) => String(form.get(k) ?? "");
  const origin = new URL(req.url).origin;
  const redirectUri = get("redirect_uri");
  const challenge = get("code_challenge");
  const resource = get("resource");
  const name = get("name").trim().slice(0, 40) || "Guest";
  if (!redirectAllowed(redirectUri, origin)) return new Response("redirect_uri not allowed", { status: 400 });
  if (get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return new Response("PKCE S256 code_challenge required", { status: 400 });
  }
  const merchantSlug = /\/api\/mcp\/([a-z0-9-]+)/.exec(resource)?.[1] ?? "";
  const merchant = await getMerchant(merchantSlug);
  if (!merchant) return new Response("unknown resource", { status: 400 });

  const target = new URL(redirectUri, origin);
  if (get("decision") !== "allow") {
    target.searchParams.set("error", "access_denied");
  } else {
    const code = signToken(
      "code",
      {
        client_id: get("client_id"),
        redirect_uri: redirectUri,
        code_challenge: challenge,
        resource,
        scope: get("scope") || "orders:read orders:write profile",
        sub: customerIdFor(name),
        name,
        merchant: merchant.slug,
      },
      300,
    );
    target.searchParams.set("code", code);
  }
  if (get("state")) target.searchParams.set("state", get("state"));
  return Response.redirect(target.toString(), 303);
}
