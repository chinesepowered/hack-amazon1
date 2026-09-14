import { getMerchant } from "@/lib/store";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export default async function Authorize({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const v = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const slug = /\/api\/mcp\/([a-z0-9-]+)/.exec(v("resource"))?.[1] ?? "";
  const merchant = await getMerchant(slug);
  const valid = merchant && v("response_type") === "code" && v("code_challenge_method") === "S256" && v("code_challenge") && v("redirect_uri");

  return (
    <main className="min-h-screen bg-[#fbf5ec] text-[#2b1d14] grid place-items-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-white border border-[#eadfce] shadow-xl p-8">
        <p className="text-xs uppercase tracking-[.18em] text-[#8a7565] font-bold">Account linking · OAuth 2.1 + PKCE</p>
        {valid ? (
          <form method="post" action="/api/oauth/authorize" className="mt-3 space-y-5">
            <h1 className="font-serif text-3xl leading-tight">
              Link your <span className="text-[#c8553d]">{merchant!.name}</span> account
            </h1>
            <p className="text-[#6e5846]">Your voice assistant is asking to:</p>
            <ul className="space-y-2 text-sm">
              <li>✓ See your order history and saved notes</li>
              <li>✓ Place pickup orders you confirm on screen</li>
              <li>✓ Charge your card on file (simulated in this demo)</li>
            </ul>
            <label className="block text-sm font-semibold">
              Your name
              <input data-testid="link-name" name="name" defaultValue="Maya" className="mt-1 w-full rounded-xl border border-[#eadfce] px-3 py-2 font-normal" />
            </label>
            {["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "resource", "scope"].map((k) => (
              <input key={k} type="hidden" name={k} value={v(k)} />
            ))}
            <div className="flex gap-3">
              <button data-testid="link-allow" name="decision" value="allow" className="flex-1 rounded-xl bg-[#c8553d] text-white font-semibold py-3">
                Allow
              </button>
              <button name="decision" value="deny" className="rounded-xl bg-[#efe5d6] font-semibold px-5 py-3">
                Deny
              </button>
            </div>
            <p className="text-xs text-[#8a7565]">Demo authorization server. No real accounts or payments.</p>
          </form>
        ) : (
          <div className="mt-3">
            <h1 className="font-serif text-2xl">Invalid authorization request</h1>
            <p className="text-[#6e5846] mt-2">Expected response_type=code, a PKCE S256 code_challenge, redirect_uri and a resource pointing at /api/mcp/&lt;shop&gt;.</p>
          </div>
        )}
      </div>
    </main>
  );
}
