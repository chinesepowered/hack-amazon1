// Demo OAuth 2.1 authorization server (authorization code + PKCE S256) and HMAC-signed tokens.
// Stateless by design so it runs on serverless without a database. See README "Account linking".
import crypto from "node:crypto";

const SECRET = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
};

export type TokenKind = "code" | "access" | "refresh" | "draft";

export interface TokenPayload {
  kind: TokenKind;
  exp: number; // epoch seconds
  [k: string]: unknown;
}

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function signToken(kind: TokenKind, data: Record<string, unknown>, ttlSeconds: number): string {
  const payload: TokenPayload = { ...data, kind, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET()).update(`${kind}.${body}`).digest("base64url");
  return `${kind}.${body}.${sig}`;
}

export function verifyToken<T extends TokenPayload = TokenPayload>(token: string | null | undefined, kind: TokenKind): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== kind) return null;
  const expected = crypto.createHmac("sha256", SECRET()).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as T;
    if (payload.kind !== kind || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  return computed.length === challenge.length && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

export function customerIdFor(name: string): string {
  return "cust_" + crypto.createHash("sha256").update(name.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export interface AccessClaims extends TokenPayload {
  sub: string; // customer id
  name: string;
  merchant: string;
  scope: string;
  aud: string; // resource (MCP server canonical URI)
}

export function bearerFrom(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

export function originOf(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

// The origin a generated add-on advertises to Alexa+. A manifest has to carry the canonical public URL,
// not whichever internal host answered the request, so PUBLIC_BASE_URL wins when it is set.
// Never use this for the MCP Origin check or OAuth redirects — those must match the serving host.
export function publicOriginOf(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return configured || originOf(req);
}

export const SCOPES = ["orders:read", "orders:write", "profile"] as const;
