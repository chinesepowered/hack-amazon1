// MCP App views (ui:// resources). Each is a self-contained HTML document: the ext-apps View SDK (App class) is
// inlined, so the sandboxed iframe needs no network access. View scripts avoid template literals on purpose.
import { EXT_APPS_BUNDLE } from "./vendor/ext-apps-bundle";
import { UI } from "./tool-ui";

const CSS = String.raw`
:root { --cream:#fbf5ec; --paper:#fffdf9; --ink:#2b1d14; --muted:#8a7565; --line:#eadfce; --accent:#c8553d; --accent-2:#e9a23b; --leaf:#4f7a52; }
* { box-sizing:border-box; }
html,body { margin:0; background:transparent; color:var(--ink); font:15px/1.4 "Avenir Next", "Segoe UI", system-ui, sans-serif; }
.card { background:var(--paper); border:1px solid var(--line); border-radius:22px; padding:18px 20px; box-shadow:0 1px 0 rgba(43,29,20,.04); }
h1,h2,h3 { font-family:"Iowan Old Style", "Palatino Linotype", Georgia, serif; margin:0; letter-spacing:-.01em; }
h1 { font-size:24px; } h2 { font-size:19px; } h3 { font-size:16px; }
.muted { color:var(--muted); } .small { font-size:12.5px; }
.row { display:flex; gap:12px; align-items:center; } .spread { justify-content:space-between; }
.chips { display:flex; gap:6px; flex-wrap:wrap; }
.chip { font-size:11.5px; padding:3px 9px; border-radius:99px; background:#f3eadc; color:#6e5846; white-space:nowrap; }
.chip.warn { background:#fde3d8; color:#9a3412; font-weight:600; }
.chip.ok { background:#e3efe2; color:#35603a; }
button { font:inherit; cursor:pointer; border:0; border-radius:14px; padding:10px 16px; background:#efe5d6; color:var(--ink); font-weight:600; }
button.primary { background:var(--accent); color:#fff; box-shadow:0 6px 16px -8px rgba(200,85,61,.8); }
button.primary:hover { filter:brightness(1.05); }
button:disabled { opacity:.55; cursor:default; }
.scroller { display:flex; gap:12px; overflow-x:auto; padding:4px 2px 10px; scroll-snap-type:x mandatory; }
.item { flex:0 0 188px; scroll-snap-align:start; background:#fff; border:1px solid var(--line); border-radius:18px; padding:12px; display:flex; flex-direction:column; gap:6px; }
.art { height:110px; border-radius:14px; display:grid; place-items:center; background:radial-gradient(circle at 50% 70%, #fff 0, #f6ecdd 70%); }
.price { font-weight:700; }
.opt { border:1.5px solid var(--line); background:#fff; border-radius:14px; padding:8px 10px; text-align:left; font-weight:500; }
.opt.on { border-color:var(--accent); background:#fff4ef; box-shadow:0 0 0 3px rgba(200,85,61,.12); }
.grid2 { display:grid; grid-template-columns: 210px 1fr; gap:18px; align-items:start; }
input[type=text] { font:inherit; width:100%; border:1.5px solid var(--line); border-radius:12px; padding:9px 12px; background:#fff; }
.label { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:700; margin:12px 0 6px; }
.line { display:grid; grid-template-columns: 48px 1fr auto; gap:12px; align-items:center; padding:9px 0; border-bottom:1px dashed var(--line); }
.total { font-size:22px; font-weight:800; }
.banner { border-radius:14px; padding:10px 12px; background:#fff4e0; border:1px solid #f2d59b; font-size:13px; }
.steps { display:grid; grid-template-columns: repeat(3,1fr); gap:8px; margin-top:12px; }
.step { border-radius:12px; padding:9px; background:#f3eadc; text-align:center; font-size:12.5px; color:var(--muted); font-weight:600; transition:all .4s; }
.step.on { background:var(--leaf); color:#fff; }
.check { width:52px; height:52px; border-radius:50%; background:var(--leaf); display:grid; place-items:center; animation:pop .5s cubic-bezier(.2,1.4,.4,1); }
@keyframes pop { from { transform:scale(.3); opacity:0 } to { transform:scale(1); opacity:1 } }
.loading { padding:26px; text-align:center; color:var(--muted); }
.err { border-color:#f1b8a7; background:#fff6f3; }
`;

// Shared view helpers (plain JS, concatenation only).
const HELPERS = String.raw`
var extApps = globalThis.__extApps;
function el(tag, attrs) {
  var node = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === "class") node.className = attrs[k];
    else if (k === "text") node.textContent = attrs[k];
    else if (k === "html") node.innerHTML = attrs[k];
    else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) node.setAttribute(k, attrs[k]);
  }
  for (var i = 2; i < arguments.length; i++) {
    var c = arguments[i];
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
    else node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}
function money(n) { return "$" + Number(n).toFixed(2); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function art(shape, p, size, message) {
  var s = size || 96, a = p[0], b = p[1], c = p[2], svg = "";
  if (shape === "cake") {
    svg = '<ellipse cx="60" cy="98" rx="50" ry="9" fill="#e8dccb"/>' +
      '<rect x="18" y="52" width="84" height="44" rx="8" fill="' + a + '"/>' +
      '<rect x="18" y="66" width="84" height="6" fill="' + c + '" opacity=".55"/>' +
      '<path d="M16 54 q0 -12 12 -12 h64 q12 0 12 12 v6 q-5 7 -10 0 q-5 8 -11 0 q-5 9 -11 0 q-6 8 -11 0 q-5 9 -11 0 q-6 8 -11 0 q-5 9 -11 0 q-5 7 -10 0z" fill="' + b + '"/>' +
      '<rect x="57" y="24" width="6" height="18" rx="2" fill="' + c + '"/><path d="M60 13 q5 6 0 11 q-5 -5 0 -11z" fill="#f5a623"/>' +
      (message ? '<text x="60" y="87" font-size="' + (message.length > 18 ? 5.6 : 7) + '" textLength="' + Math.min(76, message.length * 3.9) + '" lengthAdjust="spacingAndGlyphs" text-anchor="middle" fill="' + b + '" font-family="Georgia" font-style="italic">' + esc(message.length > 30 ? message.slice(0, 29) + "…" : message) + '</text>' : "");
  } else if (shape === "croissant") {
    svg = '<ellipse cx="60" cy="92" rx="46" ry="8" fill="#e8dccb"/><path d="M14 70 q10 -44 46 -44 q36 0 46 44 q-12 -10 -22 -8 q-8 -22 -24 -22 q-16 0 -24 22 q-10 -2 -22 8z" fill="' + a + '"/><path d="M40 48 l8 22 M60 40 v28 M80 48 l-8 22" stroke="' + c + '" stroke-width="3" stroke-linecap="round" opacity=".6"/>';
  } else if (shape === "loaf") {
    svg = '<ellipse cx="60" cy="94" rx="50" ry="8" fill="#e8dccb"/><path d="M12 84 q0 -52 48 -52 q48 0 48 52z" fill="' + a + '"/><path d="M34 52 q10 8 18 2 M52 44 q10 8 18 2 M70 52 q10 8 18 2" stroke="' + b + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
  } else if (shape === "galette") {
    svg = '<ellipse cx="60" cy="90" rx="50" ry="10" fill="#e8dccb"/><ellipse cx="60" cy="68" rx="46" ry="24" fill="' + a + '"/><ellipse cx="60" cy="64" rx="30" ry="14" fill="' + b + '"/><circle cx="50" cy="62" r="4" fill="' + c + '"/><circle cx="64" cy="58" r="4" fill="' + c + '"/><circle cx="70" cy="68" r="4" fill="' + c + '"/>';
  } else {
    svg = '<ellipse cx="60" cy="92" rx="44" ry="8" fill="#e8dccb"/><circle cx="60" cy="58" r="34" fill="' + a + '"/><path d="M60 58 m-20 0 a20 20 0 1 0 20 -20 a14 14 0 1 1 -14 14 a8 8 0 1 0 8 -8" stroke="' + b + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
  }
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 120 110" aria-hidden="true">' + svg + "</svg>";
}
var root = document.getElementById("root");
function loading(text) { root.replaceChildren(el("div", { class: "card loading" }, text || "One moment…")); }
function showError(result) {
  var data = result.structuredContent || {};
  var list = (data.violations || []).map(function (v) { return el("li", {}, v.message); });
  root.replaceChildren(el("div", { class: "card err" }, el("h3", {}, data.title || "That didn't work"), list.length ? el("ul", {}, list) : el("p", {}, (result.content && result.content[0] && result.content[0].text) || "")));
}
function makeApp(name) {
  return new extApps.App({ name: name, version: "1.0.0" }, {}, { autoResize: true });
}
function say(app, text) {
  return app.sendMessage({ role: "user", content: [{ type: "text", text: text }] });
}
`;

const MENU = String.raw`
var app = makeApp("Storefront Menu");
app.ontoolinput = function () { loading("Opening the menu…"); };
app.ontoolresult = function (r) { if (r.isError) return showError(r); render(r.structuredContent); };
function render(d) {
  var cards = d.items.map(function (it) {
    var tags = it.allergens.map(function (a) { return el("span", { class: a === "tree nuts" || a === "peanuts" ? "chip warn" : "chip" }, a); });
    var btn = el("button", { class: it.customizable ? "primary" : "", onclick: function () {
      btn.disabled = true; btn.textContent = "Sent";
      say(app, it.customizable ? "I'd like to design a custom " + it.name + "." : "Add " + it.name + " to my order.");
    } }, it.customizable ? "Customize" : "Add");
    return el("div", { class: "item" },
      el("div", { class: "art", html: art(it.shape, it.palette, 100) }),
      el("h3", {}, it.name),
      el("div", { class: "muted small" }, it.description),
      el("div", { class: "chips" }, tags),
      el("div", { class: "row spread", style: "margin-top:auto" }, el("span", { class: "price" }, it.priceLabel), btn));
  });
  root.replaceChildren(el("div", { class: "card" },
    el("div", { class: "row spread" },
      el("div", {}, el("h1", {}, d.merchant.name), el("div", { class: "muted small" }, d.merchant.tagline)),
      el("span", { class: "chip ok" }, d.items.length + " items · pickup on " + d.merchant.neighborhood)),
    el("div", { class: "scroller", style: "margin-top:12px" }, cards)));
}
app.connect();
`;

const CAKE = String.raw`
var app = makeApp("Cake Studio");
var state = null, data = null;
app.ontoolinput = function () { loading("Warming up the cake studio…"); };
app.ontoolresult = function (r) { if (r.isError) return showError(r); data = r.structuredContent; state = Object.assign({}, data.selection); render(); };
function cake() { return data.cakes.find(function (c) { return c.id === state.productId; }) || data.cakes[0]; }
function size() { var c = cake(); return c.sizes.find(function (s) { return s.id === state.sizeId; }) || c.sizes[1] || c.sizes[0]; }
function render() {
  var c = cake(), s = size();
  state.productId = c.id; state.sizeId = s.id;
  var palette = [c.palette[0], frostingColor(state.frosting) || c.palette[1], c.palette[2]];
  var preview = el("div", { class: "art", style: "height:190px", html: art("cake", palette, 180, state.message) });
  var opts = function (items, key, label) {
    return el("div", { class: "chips" }, items.map(function (it) {
      return el("button", { class: "opt" + (state[key] === it.id ? " on" : ""), onclick: function () { state[key] = it.id; render(); } }, label(it));
    }));
  };
  var msg = el("input", { type: "text", value: state.message || "", maxlength: String(data.maxMessageChars), placeholder: "Message on top (optional)",
    oninput: function (e) { state.message = e.target.value; count.textContent = state.message.length + "/" + data.maxMessageChars; preview.innerHTML = art("cake", palette, 180, state.message); } });
  var count = el("div", { class: "muted small", style: "text-align:right;margin-top:4px" }, (state.message || "").length + "/" + data.maxMessageChars);
  var add = el("button", { class: "primary", style: "width:100%;margin-top:14px;padding:13px", onclick: function () {
    add.disabled = true; add.textContent = "Added — checking pickup times…";
    var text = "Add a " + s.label + " " + c.name + " with " + state.frosting + (state.message ? ' and the message "' + state.message + '"' : "") + " to my order.";
    say(app, text);
  } }, "Add to order · " + money(s.price));
  root.replaceChildren(el("div", { class: "card" },
    el("div", { class: "row spread" }, el("h1", {}, "Cake studio"), el("span", { class: "chip" }, data.leadTimeHours + "h notice for custom cakes")),
    el("div", { class: "grid2", style: "margin-top:10px" },
      el("div", {}, preview, el("div", { class: "chips", style: "justify-content:center;margin-top:6px" }, c.allergens.map(function (a) { return el("span", { class: a === "tree nuts" ? "chip warn" : "chip" }, a); }))),
      el("div", {},
        el("div", { class: "label" }, "Cake"), opts(data.cakes, "productId", function (x) { return x.name.replace(" Cake", ""); }),
        el("div", { class: "label" }, "Size"), opts(c.sizes, "sizeId", function (x) { return x.label + " · serves " + x.serves + " · " + money(x.price); }),
        el("div", { class: "label" }, "Frosting"), opts(data.frostings.map(function (f) { return { id: f }; }), "frosting", function (x) { return x.id; }),
        el("div", { class: "label" }, "Message"), msg, count, add))));
}
function frostingColor(f) {
  return { "Vanilla buttercream": "#fff3dc", "Chocolate ganache": "#3b2016", "Cream cheese": "#fbf3e4", "Whipped mascarpone": "#fffaf2" }[f];
}
app.connect();
`;

const CHECKOUT = String.raw`
var app = makeApp("Checkout");
app.ontoolinput = function () { loading("Preparing your order…"); };
app.ontoolresult = function (r) { if (r.isError) return showError(r); render(r.structuredContent); };
function render(d) {
  var lines = d.lines.map(function (l) {
    var detail = [l.sizeLabel, l.frosting, l.message ? "“" + l.message + "”" : null].filter(Boolean).join(" · ");
    return el("div", { class: "line" },
      el("div", { html: art(l.shape, l.palette, 48, null) }),
      el("div", {}, el("div", { style: "font-weight:600" }, (l.quantity > 1 ? l.quantity + " × " : "") + l.name), detail ? el("div", { class: "muted small" }, detail) : null),
      el("div", { class: "price" }, money(l.lineTotal)));
  });
  var pay = el("button", { class: "primary", style: "padding:14px 22px;font-size:16px", onclick: function () {
    pay.disabled = true; pay.textContent = "Confirming…";
    say(app, "Confirm order " + d.draftCode + ".");
  } }, "Pay " + money(d.total));
  root.replaceChildren(el("div", { class: "card" },
    el("div", { class: "row spread" }, el("h1", {}, "Review & pay"), el("span", { class: "chip" }, d.merchant)),
    el("div", { class: "banner", style: "margin-top:10px" }, "Pickup " + d.pickup.label + " · " + d.customer),
    el("div", { style: "margin-top:6px" }, lines),
    el("div", { class: "row spread small muted", style: "margin-top:8px" }, el("span", {}, "Subtotal " + money(d.subtotal) + " · Tax " + money(d.tax)), el("span", {}, d.allergyNote || "")),
    el("div", { class: "row spread", style: "margin-top:12px" },
      el("div", {}, el("div", { class: "total" }, money(d.total)), el("div", { class: "muted small" }, d.payment.method + " •••• " + d.payment.last4 + " (simulated)")),
      pay),
    el("div", { class: "muted small", style: "margin-top:8px" }, "Code " + d.draftCode + " · holds your pickup slot for 15 minutes")));
}
app.connect();
`;

const ORDER = String.raw`
var app = makeApp("Order Status");
var current = null, timer = null;
app.ontoolinput = function () { loading("Placing your order…"); };
app.ontoolresult = function (r) { if (r.isError) return showError(r); current = r.structuredContent.order; render(); poll(); };
var STEPS = ["confirmed", "baking", "ready"];
function render() {
  var o = current, idx = Math.max(0, STEPS.indexOf(o.status));
  var check = el("div", { class: "check", html: '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
  root.replaceChildren(el("div", { class: "card" },
    el("div", { class: "row" }, check, el("div", {}, el("h1", {}, o.status === "ready" ? "Ready for pickup!" : "Order placed"), el("div", { class: "muted" }, o.code + " · " + o.pickup.label))),
    el("div", { class: "steps" }, STEPS.map(function (s, i) { return el("div", { class: "step" + (i <= idx ? " on" : "") }, s === "confirmed" ? "Confirmed" : s === "baking" ? "In the oven" : "Ready"); })),
    el("div", { style: "margin-top:10px" }, o.lines.map(function (l) {
      return el("div", { class: "row small", style: "padding:4px 0" }, el("span", { html: art(l.shape, l.palette, 30, null) }), el("span", {}, (l.quantity > 1 ? l.quantity + " × " : "") + l.name + (l.message ? " · “" + l.message + "”" : "")));
    })),
    el("div", { class: "row spread", style: "margin-top:10px" }, el("span", { class: "muted small" }, "Sent straight to " + o.merchantName + "'s kitchen screen"), el("span", { class: "total" }, money(o.total)))));
}
function poll() {
  if (timer) clearInterval(timer);
  timer = setInterval(function () {
    app.callServerTool({ name: "order_status", arguments: { code: current.code } }).then(function (r) {
      var next = r && r.structuredContent && r.structuredContent.order;
      if (next && next.status !== current.status) { current = next; render(); }
      if (current.status === "ready" || current.status === "picked_up") clearInterval(timer);
    }).catch(function () {});
  }, 3000);
}
app.connect();
`;

function page(title: string, script: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}</style></head><body><div id="root"><div class="card loading">Loading…</div></div><script type="module">${EXT_APPS_BUNDLE}</script><script type="module">
${HELPERS}
${script}</script></body></html>`;
}

const cache = new Map<string, string>();

export function viewHtml(uri: string): string | null {
  if (cache.has(uri)) return cache.get(uri)!;
  const script = { [UI.menu]: MENU, [UI.cakeStudio]: CAKE, [UI.checkout]: CHECKOUT, [UI.order]: ORDER }[uri];
  if (!script) return null;
  const html = page(uri.split("/").pop()!, script);
  cache.set(uri, html);
  return html;
}
