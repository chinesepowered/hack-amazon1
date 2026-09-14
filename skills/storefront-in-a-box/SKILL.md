---
name: storefront-in-a-box
description: Order baked goods and custom cakes for pickup from a small local shop through its Storefront in a Box MCP add-on (Alexa+ compatible). Use when a customer wants to browse a neighborhood shop's menu, design a custom cake, reorder "the usual", pick a pickup time, or check an order's status.
compatibility: Requires an MCP client with Streamable HTTP (spec 2025-11-25). MCP Apps rendering is recommended; text-only clients still work.
metadata:
  author: chinesepowered
  version: "1.0.0"
  mcp-endpoint: "https://<deployment>/api/mcp/<merchant>"
---

# Storefront in a Box add-on

Each shop gets its own MCP server at `/api/mcp/<merchant>` (e.g. `marigold`). Browsing is public; anything tied to a
customer (profile, checkout, orders) returns HTTP 401 until the account is linked with OAuth 2.1 + PKCE
(`/.well-known/oauth-protected-resource/api/mcp/<merchant>`).

## Conversation flow

1. **Recall the customer.** If linked, call `get_my_profile` once at the start. Use saved notes naturally
   (for example an allergy) and offer the usual order when relevant.
2. **Browse.** `browse_menu` (optional `category`) shows a carousel card. Keep spoken replies to one or two sentences.
3. **Custom cakes.** `design_cake` opens the cake studio card, pre-filled with anything the customer said
   (`productId`, `sizeId` 6in/8in/10in, `frosting`, `message` ≤ 30 chars). Wait for the card's
   "Add a … to my order" message.
4. **Remember lasting facts.** Allergies or preferences → `remember_note`.
5. **Pickup time.** `check_pickup_slots` with a day ("saturday", "tomorrow", YYYY-MM-DD) and the items.
   Custom cakes need 48 hours' notice and decorator capacity per window.
6. **Allergens.** If any item contains tree nuts, ask whether anyone eating it has a nut allergy. Only pass
   `nutAllergyConfirmed: true` when the customer clearly said nobody does.
7. **Checkout.** `prepare_checkout` validates everything and shows the checkout card with a Pay button and a code
   like `MB-4821`. It does not charge.
8. **Purchase.** Only after the customer taps Pay (the card sends "Confirm order MB-4821") call `place_order` with
   that `confirmationCode` and the `draftToken` from `prepare_checkout`. Never place an order otherwise.
9. **Status.** `order_status` shows a live card that updates as the kitchen moves the order along.

## Errors

Tools return `isError: true` with `structuredContent.violations[]` (`LEAD_TIME`, `SLOT_FULL`, `CLOSED`,
`NUT_CONFIRMATION_REQUIRED`, `MESSAGE_TOO_LONG`, `UNKNOWN_ITEM`, …). Explain the first violation in plain words and
offer the nearest fix (another window, another day, removing an item).

## Examples

- "What cakes do you have?" → `browse_menu {"category":"cakes"}`
- "Chocolate cake for Leo's 7th, 8-inch" → `design_cake {"productId":"choc-fudge","sizeId":"8in","message":"Happy 7th Birthday Leo!"}`
- "My usual for Sunday" → `get_my_profile` → `check_pickup_slots` → `prepare_checkout`
