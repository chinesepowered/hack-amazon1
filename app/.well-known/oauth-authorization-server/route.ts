import { originOf, SCOPES } from "@/lib/auth";

export const dynamic = "force-dynamic";

// OAuth 2.0 Authorization Server Metadata (RFC 8414). Alexa+ validates code_challenge_methods_supported includes S256.
export async function GET(req: Request) {
  const origin = originOf(req);
  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: SCOPES,
    service_documentation: `${origin}/#account-linking`,
  });
}
