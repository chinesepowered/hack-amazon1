# Devpost submission drafts: Storefront in a Box

Replace `VIDEO_URL` before submitting.

## Name (≤60)

Storefront in a Box: your corner shop on Alexa+

## Tagline (≤200)

Turn a small shop's catalog into an Alexa+ add-on: an MCP server with interactive cards, account linking, allergen-safe checkout and a Strands Agents voice assistant.

## Track / mini challenge

- Primary track: **Alexa+**
- AWS Builder mini challenge: **Yes**
- Open Source mini challenge: No
- Project new or existing: **New**

## Description (markdown)

**The bakery on the corner deserves voice ordering too.**

The U.S. has 36.2 million small businesses (SBA Office of Advocacy, 2025). To reach customers through a big platform, a bakery typically pays a delivery marketplace 15–30% commission per delivery order (DoorDash Basic / Plus / Premier). Alexa+ integrations are open today only to "select partners" such as OpenTable, Thumbtack and Atom Tickets. An owner-operated bakery isn't going to write an MCP server with OAuth, interactive UI and capacity rules.

**Storefront in a Box** turns a catalog CSV into a complete Alexa+ add-on:

- **Self-hosted MCP server** (spec 2025-11-25, Streamable HTTP) per shop at `/api/mcp/<shop>` with 8 tools: browse menu, design cake, pickup slots, customer profile, remember note, prepare checkout, place order, order status.
- **MCP Apps cards**: menu carousel, a custom-cake studio (size, frosting, message piped on top), checkout with a Pay button, and a live order card that updates as the kitchen works. Cards talk back with `ui/message` and call tools through the host.
- **Account linking** with OAuth 2.1 + PKCE S256, RFC 8414 and RFC 9728 metadata, and HTTP 401 for customer tools.
- **Deterministic rules**: 48-hour notice for custom cakes, decorator capacity per pickup window, tax, and a mandatory tree-nut allergy confirmation.
- **Memory across sessions**: the customer's usual order and notes like "Leo has a tree-nut allergy".
- **Kitchen screen** where orders appear instantly with the message to pipe, plus a "marketplace fees avoided" counter.
- **Agent Skill** (`skills/storefront-in-a-box/SKILL.md`) describing how any agent should use the add-on.

Builder access to Alexa+ is partner-only, so we built a **simulated Alexa+ smart display**:

- push-to-talk voice, spoken replies and captions;
- a **Strands Agents SDK** assistant that uses the shop's add-on through Strands' MCP client;
- an MCP Apps host that renders the cards in a sandboxed iframe;
- an activity panel showing every tool call, guardrail decision and latency.

**Guardrails are code, not prompts.** Strands `BeforeToolCallEvent` hooks block `place_order` unless the customer tapped Pay. They also block checkout when tree nuts are in the cart and the customer hasn't answered the allergy question, or when lead time or capacity would be violated. The MCP server enforces the same rules again for any client.

All shops, customers and payments are fictional or simulated.

Live: https://storefront-in-a-box-sepia.vercel.app · Video: VIDEO_URL · Code: https://github.com/chinesepowered/storefront-in-a-box

## Built with

nextjs, typescript, react, model-context-protocol, mcp-apps, alexa-plus, strands-agents-sdk, aws, oauth2, pkce, zod, tailwindcss, vercel, vercel-blob, qwen, openai-compatible-api, web-speech-api, elevenlabs

## Testing instructions

No real account needed.

1. Open https://storefront-in-a-box-sepia.vercel.app/device and click **Link account** → **Allow** (demo OAuth server; any name).
2. Type "Hi! My son Leo turns 7 on Saturday. What cakes do you have?" (Chrome also supports the mic button).
3. Tap **Customize** on a cake, choose size, frosting and message, then **Add to order**.
4. Type "Noon works. Also add two almond croissants." The assistant asks about nut allergies.
5. Type "Leo is allergic to tree nuts. Skip the croissants, add morning buns instead." The checkout card appears; tap **Pay**.
6. Open **Kitchen screen ↗** (https://storefront-in-a-box-sepia.vercel.app/merchant/marigold) and press **Start baking**; the order card on the display updates within a few seconds.
7. Click **New session** and type "Can I get my usual for Sunday morning?"
8. Optional: `npx @modelcontextprotocol/inspector --cli https://storefront-in-a-box-sepia.vercel.app/api/mcp/marigold --transport http --method tools/list`. Onboard your own shop at https://storefront-in-a-box-sepia.vercel.app/onboard.

Agent requests are rate-limited per IP. If an answer is slow, the free-tier model endpoint is busy; retry.

## AWS Builder: which AWS services did you incorporate and how?

**Strands Agents SDK (TypeScript)**, AWS's open-source agent framework, is the brain of the simulated Alexa+ display (`app/api/assistant/route.ts`):

- `Agent` with **Strands `McpClient`** over Streamable HTTP to the shop's MCP add-on, passing the linked account's Bearer token, so the agent consumes the add-on exactly as Alexa+ would.
- `OpenAIModel` (model-agnostic; an OpenAI-compatible Qwen3.8-27B endpoint at temperature 0). Swapping to Amazon Bedrock is a provider change only; we stayed on free services.
- **Hooks**:
  - `BeforeToolCallEvent` implements deterministic guardrails: purchase requires the Pay confirmation code in the customer's own turn; tree-nut items require a customer-answered allergy question; lead time and decorator capacity are checked against live orders. Blocked calls return the reason to the model via `event.cancel`.
  - `BeforeModelCallEvent` caps steps.
  - `AfterToolCallEvent` and `ModelMessageEvent` stream tool calls, results, latencies and replies to the UI as NDJSON.
- Conversation state is serialized from `agent.messages` and passed back to seed the next turn. Long-term memory lives in the MCP server (`get_my_profile` / `remember_note`), and a new session recalls it deterministically before the model speaks.

No Bedrock, AgentCore or other paid AWS services were used.

## Feedback Q1: Which developer tools, APIs, and SDKs did you use and for what?

- **Alexa+ MCP Toolkit docs** (quickstart, account linking): server requirements (spec 2025-11-25, Streamable HTTP, OAuth 2.1 + PKCE S256, 401 behavior, < 500 ms latency).
- **MCP TypeScript SDK 1.30** (`@modelcontextprotocol/sdk`): `McpServer`, `WebStandardStreamableHTTPServerTransport` in a Next.js route handler, plus `Client` + `StreamableHTTPClientTransport` in the browser host.
- **MCP Apps** (`@modelcontextprotocol/ext-apps` 1.7.5): `registerAppTool` / `registerAppResource` on the server, `App` inside the cards, `AppBridge` + `PostMessageTransport` in our display host.
- **Agent Skills spec**: the `SKILL.md` that documents the add-on.
- **Strands Agents SDK for TypeScript 1.17**: the assistant agent, MCP client and guardrail hooks.
- **MCP Inspector CLI**: validating `tools/list` and `tools/call` against the deployed server.
- **Vercel** (hosting, Blob storage), **Next.js 16**, **Web Speech API** (voice in/out), **ElevenLabs** (demo video narration only).

## Feedback Q2: For each tool, what worked well?

- **MCP TypeScript SDK:**
  - `WebStandardStreamableHTTPServerTransport` in stateless JSON mode dropped straight into a Next.js route handler. Serverless-friendly, no Express needed.
  - `initialize` negotiated `2025-11-25` out of the box.
  - Zod input schemas and tool annotations were concise. Tool round trips measured 30–70 ms locally, well under Alexa+'s 500 ms target.
- **MCP Apps:**
  - The mental model (tool declares `_meta.ui.resourceUri`, host renders a sandboxed iframe, the card talks back with `ui/message`) is simple and powerful.
  - `AppBridge` automatically proxies `tools/call` and `resources/read` to the MCP client, so our live order card could poll `order_status` with no extra host code.
  - `autoResize` worked well.
- **Strands Agents SDK (TS):**
  - Passing an `McpClient` directly in `tools: [mcp]` was the fastest MCP-client integration we've used.
  - Hooks are the standout feature. `BeforeToolCallEvent` with `event.cancel = "reason"` gave clean, deterministic guardrails, and the model reliably explained the block to the customer.
  - Model-agnostic `OpenAIModel` worked with a non-OpenAI endpoint.
- **Alexa+ docs:** the account-linking page has concrete JSON examples (PRM document, token response, 401 body) that were easy to implement against.

## Feedback Q3: For each tool, what needs work?

(Details and repro steps in `FRICTION_LOG.md`.)

- **Alexa+ access:** "select partners only" meant we couldn't test against real Alexa+ or its simulator. We had to build our own simulated client.
- **Alexa+ docs consistency:**
  - The quickstart says return 401 "without a `WWW-Authenticate` header", while MCP 2025-11-25 requires it with `resource_metadata`.
  - The quickstart lists Protected Resource Metadata at `/.well-known/oauth-authorization-server`, while the account-linking page uses RFC 9728's `/.well-known/oauth-protected-resource`.
- **Strands `McpClient`:** drops `structuredContent` and `_meta` from MCP tool results (only `content[]` is mapped), so a Strands-driven host can't feed MCP Apps directly. We duplicated structured data as JSON text.
- **Version skew:** ext-apps 2.0 requires the new split MCP SDK v2 packages, while Strands TS 1.17 peers on `@modelcontextprotocol/sdk` v1. We had to pin ext-apps 1.7.5.
- **MCP Apps packaging:** no IIFE/UMD build. Inlining the ESM bundle into a single-file `ui://` resource needed a rewrite script, and its minified top-level names collided with our view code.
- **Elicitation vs. serverless:** elicitation needs a held stream or session, which doesn't fit stateless serverless servers or a 500 ms latency budget. Guidance on "MCP Apps forms vs. elicitation" for Alexa+ would help.
- **Browser client:** logs a 405 on every connect to a stateless server (its GET SSE probe), which looks like an error.
- **Strands in Next.js:** needs `serverExternalPackages: ["@strands-agents/sdk"]` or the build fails on an optional AWS SDK import. It isn't documented.

## Feedback Q4: How was your onboarding experience (zero to hello world)?

- **MCP server:** about 20 minutes to a working `tools/list` over Streamable HTTP with the TypeScript SDK, including reading the transport options.
- **MCP Apps:** about 1.5 hours to the first rendered card. The server side (`registerAppTool` / `registerAppResource`) was quick. Writing a host took longer because the only reference host is the `basic-host` example, and single-file packaging of the View SDK wasn't covered.
- **Strands TS:** about 15 minutes from `pnpm add` to an agent calling our MCP tools and a hook blocking a call. The README examples were accurate. The only surprise was the Next.js bundling issue.
- **Alexa+:** reading the MCP Toolkit docs was quick, but onboarding stopped at "select partners". There was no path to a hello world on a real or simulated Alexa+.

## Feedback Q5: Would you build with these devices and services again?

**Yes.** MCP plus MCP Apps is the right foundation for Alexa+: one server gives voice, visual cards, account linking and checkout, and the same endpoint works in other MCP clients. Strands' hooks made the agent side trustworthy enough for real purchases. We'd register Storefront in a Box with the Alexa+ MCP Toolkit the day builder access opens to independent developers, since that's what small merchants need to reach Alexa+ customers. The main ask is that access, plus a local Alexa+ simulator for testing MCP Apps rendering and account linking.

## Optional: Feature requests

1. **Open Alexa+ MCP Toolkit developer-stage access (or a local simulator) to all builders.** It's the only way to validate MCP Apps rendering, account linking and latency before certification. Priority: **Critical**.
2. **Strands `McpClient`: keep `structuredContent` and `_meta` (including `ui.resourceUri`) on tool results.** That would let Strands agents drive MCP Apps hosts directly. Priority: **Important**.
3. **Alexa+ small-merchant onboarding template or catalog import** (e.g. Square / Shopify catalog → MCP add-on) with Amazon Pay checkout. Priority: **Important**.
4. **IIFE/UMD build of the ext-apps View SDK and an official minimal host** for single-file `ui://` resources. Priority: **Nice-to-have**.
5. **Strands TS docs page for Next.js / Vercel** (serverless streaming, `serverExternalPackages`). Priority: **Nice-to-have**.
