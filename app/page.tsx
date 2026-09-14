const STATS = [
  {
    big: "36.2M",
    text: "small businesses in the U.S., accounting for almost 46% of private-sector employment.",
    source: "SBA Office of Advocacy, 2025",
    href: "https://advocacy.sba.gov/2025/06/30/new-advocacy-report-shows-the-number-of-small-businesses-in-the-u-s-exceeds-36-million/",
  },
  {
    big: "15–30%",
    text: "commission a delivery marketplace takes on each delivery order (DoorDash Basic, Plus, Premier).",
    source: "DoorDash merchant pricing",
    href: "https://merchants.doordash.com/en-us/pricing",
  },
  {
    big: "Select partners",
    text: "is who can build Alexa+ integrations today. The launch names are OpenTable, Thumbtack and Atom Tickets, not the bakery on your corner.",
    source: "Amazon Alexa+ for Builders",
    href: "https://developer.amazon.com/en-US/alexa/alexa-ai",
  },
];

const PLANS = [
  { name: "Starter", price: "$0", per: "up to 30 voice orders / month", points: ["Menu cards & checkout", "Pickup scheduling", "Kitchen screen"] },
  { name: "Neighborhood", price: "$29", per: "per month, unlimited orders", points: ["Custom-order studio", "Customer memory & usual orders", "Allergen & lead-time rules"], featured: true },
  { name: "Multi-location", price: "$79", per: "per month, up to 5 shops", points: ["Shared catalog", "Per-location capacity", "Priority onboarding"] },
];

export default function Home() {
  return (
    <main className="bg-cream text-ink">
      <section className="max-w-6xl mx-auto px-8 pt-10 pb-16">
        <nav className="flex items-center justify-between">
          <span className="font-serif text-2xl">🥐 Storefront in a Box</span>
          <div className="flex gap-5 text-sm text-cocoa">
            <a href="/device">Display demo</a>
            <a href="/merchant/marigold">Kitchen screen</a>
            <a href="/onboard">Onboard a shop</a>
            <a href="/slides.html">Pitch</a>
          </div>
        </nav>
        <div className="grid grid-cols-[1.2fr_1fr] gap-12 items-center mt-16">
          <div>
            <p className="text-ember text-xs uppercase tracking-[.22em] font-bold">Alexa+ add-on generator · MCP · Strands Agents</p>
            <h1 className="font-serif text-6xl leading-[1.02] mt-4">The bakery on the corner deserves voice ordering too.</h1>
            <p className="text-lg text-cocoa mt-5 max-w-xl">
              Storefront in a Box turns a small shop&apos;s catalog into an Alexa+ add-on: an MCP server with interactive menu cards, a custom-order studio, pickup scheduling, account linking and checkout. Orders land on the shop&apos;s kitchen screen, with no marketplace commission.
            </p>
            <div className="flex gap-3 mt-8">
              <a href="/device" className="rounded-2xl bg-ember text-white font-semibold px-6 py-3.5">Try the display demo</a>
              <a href="/onboard" className="rounded-2xl bg-white border border-line font-semibold px-6 py-3.5">Onboard your shop</a>
            </div>
          </div>
          <div className="rounded-[34px] bg-[#15100d] p-3 shadow-2xl rotate-1">
            <div className="rounded-[24px] bg-paper p-6">
              <p className="text-sm text-crumb">“Alexa, order Leo&apos;s birthday cake from Marigold.”</p>
              <div className="mt-4 rounded-2xl border border-line bg-white p-4">
                <p className="font-serif text-2xl">Review &amp; pay</p>
                <p className="text-sm text-cocoa mt-1">8-inch Chocolate Fudge · ganache · “Happy 7th Birthday Leo!”</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-2xl font-bold">$71.94</span>
                  <span className="rounded-xl bg-ember text-white font-semibold px-4 py-2">Pay</span>
                </div>
              </div>
              <p className="text-xs text-crumb mt-3">Pickup Saturday 12–2pm · allergen check passed</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper border-y border-line">
        <div className="max-w-6xl mx-auto px-8 py-14 grid grid-cols-3 gap-8">
          {STATS.map((s) => (
            <div key={s.big}>
              <p className="font-serif text-5xl text-ember">{s.big}</p>
              <p className="text-cocoa mt-2">{s.text}</p>
              <a href={s.href} className="text-xs text-crumb underline decoration-dotted mt-2 inline-block">{s.source}</a>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-8 py-16" id="how">
        <h2 className="font-serif text-4xl">How it works</h2>
        <div className="grid grid-cols-3 gap-6 mt-8">
          {[
            ["1. Paste a catalog", "CSV or JSON. We infer cake sizes, allergens and categories."],
            ["2. Get an Alexa+ add-on", "A self-hosted MCP server (spec 2025-11-25, Streamable HTTP) with MCP Apps cards and OAuth 2.1 + PKCE account linking."],
            ["3. Take orders by voice", "Deterministic rules (lead time, decorator capacity, nut-allergy confirmation) guard every checkout. Orders appear on the kitchen screen."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-3xl bg-white border border-line p-6">
              <h3 className="font-serif text-2xl">{t}</h3>
              <p className="text-cocoa mt-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-8 pb-16" id="pricing">
        <h2 className="font-serif text-4xl">Flat pricing. Zero commission.</h2>
        <div className="grid grid-cols-3 gap-6 mt-8">
          {PLANS.map((p) => (
            <div key={p.name} className={`rounded-3xl p-6 border ${p.featured ? "bg-ink text-cream border-ink" : "bg-white border-line"}`}>
              <p className={`text-xs uppercase tracking-[.18em] font-bold ${p.featured ? "text-honey" : "text-crumb"}`}>{p.name}</p>
              <p className="font-serif text-5xl mt-2">{p.price}</p>
              <p className="text-sm opacity-80">{p.per}</p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {p.points.map((x) => (
                  <li key={x}>✓ {x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-sm text-crumb mt-6" id="account-linking">
          Hackathon build: all shops, customers and payments are fictional or simulated. Account linking uses a demo OAuth 2.1 authorization server (authorization code + PKCE S256).
        </p>
      </section>
    </main>
  );
}
