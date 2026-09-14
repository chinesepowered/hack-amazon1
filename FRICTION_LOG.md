# Friction log

Real friction hit while building Storefront in a Box (Alexa+ track, with the Strands Agents SDK) between Sep 14 and the submission. Each entry lists the task, steps, expected vs. actual result, severity, workaround and a suggestion.

Severity: **High** = blocked a requirement, **Medium** = cost significant time or forced a design change, **Low** = annoyance.

---

## 1. Alexa+ MCP Toolkit is partner-only, so there is no way to test against real Alexa+

- **Task:** Deploy the add-on to Alexa+ and test it in the web simulator.
- **Steps:** Read the Alexa+ for Builders page, the MCP Toolkit overview and the quickstart (`alexa-ai configure`, `alexa-ai new mcp`, `alexa-ai deploy`).
- **Expected:** A developer-stage deployment and simulator access for hackathon participants, like classic Alexa skills.
- **Actual:** The Builders page says "Alexa+ for Builders is currently available to select partners working directly with our team." The quickstart doesn't mention that limit. We couldn't verify how Alexa+ renders our MCP Apps or runs account linking.
- **Severity:** High
- **Workaround:** Built a simulated Alexa+ display: a Strands agent as the MCP client plus our own MCP Apps host. The hackathon rules explicitly allow this.
- **Suggestion:** Give hackathon participants time-boxed developer-stage access, or publish a local Alexa+ simulator or conformance tester that checks auth, latency and MCP Apps rendering.

## 2. Alexa+ docs contradict themselves (and the MCP spec) on the 401 response and metadata paths

- **Task:** Implement account-linking discovery exactly as Alexa+ expects.
- **Steps:** Compared the MCP Toolkit quickstart, the account-linking page and MCP spec 2025-11-25 (Authorization).
- **Expected:** One consistent description.
- **Actual:**
  - The quickstart says the server "returns `401 Unauthorized` (without a `WWW-Authenticate` header)". MCP 2025-11-25 requires `WWW-Authenticate` with `resource_metadata` on 401.
  - The quickstart puts Protected Resource Metadata at `/.well-known/oauth-authorization-server`. The account-linking page uses the RFC 9728 path `/.well-known/oauth-protected-resource`.
- **Severity:** Medium
- **Workaround:**
  - We return 401 with the JSON body Alexa documents plus a spec-compliant `WWW-Authenticate` header.
  - We serve both documents: RFC 8414 AS metadata with S256, and RFC 9728 PRM, including the path-suffixed form `/.well-known/oauth-protected-resource/api/mcp/<merchant>` (`app/.well-known/…`).
- **Suggestion:** Fix the quickstart wording, state whether Alexa+ tolerates `WWW-Authenticate`, and link the exact RFCs.

## 3. `@modelcontextprotocol/ext-apps` 2.x and the Strands TypeScript SDK need different MCP SDK major versions

- **Task:** Use MCP Apps server helpers and `AppBridge` in the same Next.js app as Strands' `McpClient`.
- **Steps:** `pnpm add @strands-agents/sdk @modelcontextprotocol/sdk @modelcontextprotocol/ext-apps` → peer dependency warnings.
- **Expected:** The latest ext-apps works with the MCP SDK that Strands uses.
- **Actual:**
  - ext-apps 2.0.0 declares peers `@modelcontextprotocol/client|core|server ^2.0.0`, the new split packages.
  - `@strands-agents/sdk` 1.17.0 peers on `@modelcontextprotocol/sdk ^1.25.2`, and its `McpClient` types import from `@modelcontextprotocol/sdk/client/index.js`.
  - Installing both means two MCP SDK majors in one app.
- **Severity:** Medium
- **Workaround:** Pinned `@modelcontextprotocol/ext-apps@1.7.5` (peer `@modelcontextprotocol/sdk ^1.29`). The README says the wire protocol didn't change between 1.x and 2.x.
- **Suggestion:** Ship Strands support for MCP SDK v2 (or a compatibility note), and have ext-apps list the last v1-compatible release in its migration guide.

## 4. Strands `McpClient` drops `structuredContent` and `_meta` from tool results

- **Task:** Render MCP Apps cards from tool results the Strands agent received.
- **Steps:** Returned `structuredContent` from MCP tools and read results in an `AfterToolCallEvent` hook.
- **Expected:** Access to `structuredContent` (and the result `_meta`) as the MCP spec defines them.
- **Actual:** `McpTool` maps only `content[]` into Strands content blocks (`tools/mcp-tool.js`). `structuredContent` and `_meta` are lost, so a host driven by a Strands agent can't hand MCP Apps their data.
- **Severity:** Medium
- **Workaround:** Every tool also returns the structured object as a second JSON text block, which the spec recommends for backwards compatibility. The agent route parses it and forwards it to the display.
- **Suggestion:** Keep `structuredContent` and `_meta` on the Strands tool result (for example `ToolResultBlock.structuredContent`) and expose the tool's `_meta.ui.resourceUri`, so Strands can drive MCP Apps hosts directly.

## 5. Inlining the ext-apps View bundle collides with page-level identifiers

- **Task:** Make each `ui://` resource a single self-contained HTML file (no network access in the sandboxed iframe).
- **Steps:** Inlined `dist/src/app-with-deps.js` into the same `<script type="module">` as the view code.
- **Expected:** A working `App` class.
- **Actual:** `SyntaxError: Identifier 'el' has already been declared`. The minified bundle declares short top-level names like `el` that clash with any view code in the same module. The bundle also ends in `export{…}`, so it can't be pasted as-is.
- **Severity:** Low
- **Workaround:** `scripts/vendor-ext-apps.mjs` rewrites the trailing `export{}` into `globalThis.__extApps={…}`, and the bundle runs in its own `<script type="module">` ahead of the view script.
- **Suggestion:** Publish an IIFE or UMD build (`window.McpApps`) for single-file views.

## 6. Elicitation isn't practical with a stateless, serverless Streamable HTTP server

- **Task:** Use MCP elicitation to ask for cake options (size, message) mid-tool-call.
- **Steps:** Next.js route handler on Vercel with `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`.
- **Expected:** An elicitation request inside a tool call.
- **Actual:** Elicitation is a server-to-client request that needs an open SSE stream or session for the duration of the tool call. That doesn't fit stateless JSON responses on serverless, and Alexa's 500 ms round-trip target argues against long-held requests anyway.
- **Severity:** Medium (design change)
- **Workaround:** Built an MCP Apps card form (the cake studio) that sends the choice back with `ui/message`. The checkout confirmation uses the same pattern.
- **Suggestion:** Say in the Alexa+ docs whether add-ons should prefer MCP Apps forms over elicitation, and whether Alexa+ supports URL-mode elicitation for payments.

## 7. Browser MCP client logs a 405 for stateless servers

- **Task:** Connect a browser `Client` + `StreamableHTTPClientTransport` (MCP Apps host) to the stateless server.
- **Actual:** After `initialize` the transport opens a GET SSE stream. Our server correctly answers 405, but the browser console shows "Failed to load resource: 405" on every page load, which looks like an error to a judge or developer.
- **Severity:** Low
- **Workaround:** None needed; it's harmless.
- **Suggestion:** Have servers advertise "no standalone SSE stream" (or have the client skip the GET) so hosts don't log a failed request.

## 8. Strands TypeScript SDK in Next.js 16 needs `serverExternalPackages`

- **Task:** Run a Strands `Agent` inside a Next.js route handler.
- **Actual:** Known from a previous build: without `serverExternalPackages: ["@strands-agents/sdk"]` the Turbopack build fails on the SDK's optional dynamic import of `@aws-sdk/client-s3`.
- **Severity:** Low
- **Workaround:** `next.config.ts` marks the SDK as a server external.
- **Suggestion:** A "Next.js / Vercel" page in the Strands TS docs.
