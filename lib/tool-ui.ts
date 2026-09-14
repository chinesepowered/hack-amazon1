// Which MCP tools render an MCP App (ui:// resource). Shared by the MCP server, the Strands agent route and the display host.
export const UI = {
  menu: "ui://storefront/menu.html",
  cakeStudio: "ui://storefront/cake-studio.html",
  checkout: "ui://storefront/checkout.html",
  order: "ui://storefront/order.html",
} as const;

export const TOOL_UI: Record<string, string> = {
  browse_menu: UI.menu,
  design_cake: UI.cakeStudio,
  prepare_checkout: UI.checkout,
  place_order: UI.order,
  order_status: UI.order,
};

// Tools that act on a customer's identity need a linked account (OAuth). The MCP route answers HTTP 401 for these.
export const AUTH_REQUIRED_TOOLS = new Set(["get_my_profile", "remember_note", "prepare_checkout", "place_order", "order_status"]);

// Checkout confirmation codes look like "MB-4821" (merchant initials + 4 digits).
export const DRAFT_CODE_RE = /\b[A-Z]{2}-\d{4}\b/;
