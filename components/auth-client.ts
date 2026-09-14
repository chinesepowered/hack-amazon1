"use client";
// Browser side of account linking (OAuth 2.1 authorization code + PKCE S256), the same flow Alexa+ runs.

export interface LinkedAccount {
  access: string;
  refresh: string;
  exp: number; // epoch ms
  name: string;
}

const key = (slug: string) => `storefront:auth:${slug}`;

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  arr.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function nameFromToken(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.name ?? "";
  } catch {
    return "";
  }
}

export function loadAccount(slug: string): LinkedAccount | null {
  try {
    const raw = localStorage.getItem(key(slug));
    return raw ? (JSON.parse(raw) as LinkedAccount) : null;
  } catch {
    return null;
  }
}

export function forgetAccount(slug: string) {
  try {
    localStorage.removeItem(key(slug));
  } catch {}
}

export async function startLinking(slug: string) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem("storefront:pkce", JSON.stringify({ verifier, state, slug }));
  const origin = window.location.origin;
  const url = new URL("/oauth/authorize", origin);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: "storefront-display",
    redirect_uri: `${origin}/device/callback`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    resource: `${origin}/api/mcp/${slug}`,
    scope: "orders:read orders:write profile",
  }).toString();
  window.location.assign(url.toString());
}

export async function finishLinking(params: URLSearchParams): Promise<string> {
  const saved = JSON.parse(sessionStorage.getItem("storefront:pkce") ?? "null") as { verifier: string; state: string; slug: string } | null;
  if (!saved) throw new Error("Linking session expired. Try again.");
  if (params.get("error")) throw new Error(`Linking was ${params.get("error")}.`);
  if (params.get("state") !== saved.state) throw new Error("State mismatch.");
  const origin = window.location.origin;
  const res = await fetch("/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.get("code") ?? "",
      code_verifier: saved.verifier,
      redirect_uri: `${origin}/device/callback`,
      resource: `${origin}/api/mcp/${saved.slug}`,
      client_id: "storefront-display",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? "Token exchange failed.");
  const account: LinkedAccount = { access: data.access_token, refresh: data.refresh_token, exp: Date.now() + data.expires_in * 1000, name: nameFromToken(data.access_token) };
  localStorage.setItem(key(saved.slug), JSON.stringify(account));
  sessionStorage.removeItem("storefront:pkce");
  return saved.slug;
}

export async function freshAccount(slug: string): Promise<LinkedAccount | null> {
  const acct = loadAccount(slug);
  if (!acct) return null;
  if (acct.exp - Date.now() > 60_000) return acct;
  const res = await fetch("/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: acct.refresh }),
  });
  if (!res.ok) {
    forgetAccount(slug);
    return null;
  }
  const data = await res.json();
  const next = { ...acct, access: data.access_token, refresh: data.refresh_token, exp: Date.now() + data.expires_in * 1000 };
  localStorage.setItem(key(slug), JSON.stringify(next));
  return next;
}
