import { signToken, verifyPkce, verifyToken, type TokenPayload } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface CodeClaims extends TokenPayload {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string;
  scope: string;
  sub: string;
  name: string;
  merchant: string;
}

const err = (error: string, description: string, status = 400) =>
  Response.json({ error, error_description: description }, { status, headers: { "Cache-Control": "no-store" } });

// Token endpoint: authorization_code (with PKCE verifier) and refresh_token grants.
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const params: Record<string, string> = type.includes("application/json")
    ? await req.json()
    : Object.fromEntries(new URLSearchParams(await req.text()));

  let claims: CodeClaims | null = null;
  if (params.grant_type === "authorization_code") {
    claims = verifyToken<CodeClaims>(params.code, "code");
    if (!claims) return err("invalid_grant", "Authorization code is invalid or expired.");
    if (params.redirect_uri && params.redirect_uri !== claims.redirect_uri) return err("invalid_grant", "redirect_uri mismatch.");
    if (!params.code_verifier || !verifyPkce(params.code_verifier, claims.code_challenge)) return err("invalid_grant", "PKCE verification failed.");
    if (params.resource && params.resource !== claims.resource) return err("invalid_target", "resource mismatch.");
  } else if (params.grant_type === "refresh_token") {
    claims = verifyToken<CodeClaims>(params.refresh_token, "refresh");
    if (!claims) return err("invalid_grant", "Refresh token is invalid or expired.");
  } else {
    return err("unsupported_grant_type", "Use authorization_code or refresh_token.");
  }

  const base = { sub: claims.sub, name: claims.name, merchant: claims.merchant, scope: claims.scope, aud: claims.resource, resource: claims.resource };
  return Response.json(
    {
      access_token: signToken("access", base, 3600),
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: signToken("refresh", base, 30 * 86400),
      scope: claims.scope,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
