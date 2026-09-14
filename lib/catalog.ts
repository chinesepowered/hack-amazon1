// Merchant catalog model. A merchant uploads a catalog (JSON or CSV) and gets an Alexa+ MCP add-on.
// All merchants, products and customers in this repo are fictional.

export type Allergen = "gluten" | "dairy" | "egg" | "tree nuts" | "peanuts" | "soy" | "sesame";

export interface SizeOption {
  id: string; // e.g. "8in"
  label: string; // "8-inch"
  serves: number;
  price: number; // USD
}

export interface Product {
  id: string;
  name: string;
  category: string; // "cakes" | "pastries" | "bread" | ...
  description: string;
  price: number; // base price (smallest size for cakes)
  allergens: Allergen[];
  customizable?: boolean; // custom cakes: size, frosting, message
  sizes?: SizeOption[];
  palette: [string, string, string]; // illustration colors: base, frosting, accent
  shape: "cake" | "bun" | "croissant" | "loaf" | "galette" | "cookie";
}

export interface Merchant {
  slug: string;
  name: string;
  tagline: string;
  neighborhood: string;
  timezone: string;
  currency: "USD";
  taxRate: number;
  leadTimeHours: { custom: number; standard: number };
  pickupWindows: string[]; // "08:00-10:00"
  closedWeekdays: number[]; // 0 = Sunday
  customCakesPerWindow: number;
  nutConfirmationRequired: boolean;
  frostings: string[];
  maxMessageChars: number;
  products: Product[];
  plan: "Starter" | "Neighborhood" | "Multi-location";
  createdAt: string;
}

const CAKE_SIZES = (p6: number, p8: number, p10: number): SizeOption[] => [
  { id: "6in", label: "6-inch", serves: 8, price: p6 },
  { id: "8in", label: "8-inch", serves: 14, price: p8 },
  { id: "10in", label: "10-inch", serves: 24, price: p10 },
];

export const DEMO_MERCHANT: Merchant = {
  slug: "marigold",
  name: "Marigold Bakery",
  tagline: "Butter, patience, and a little too much frosting since 2011.",
  neighborhood: "Maple Street",
  timezone: "America/Los_Angeles",
  currency: "USD",
  taxRate: 0.09,
  leadTimeHours: { custom: 48, standard: 2 },
  pickupWindows: ["08:00-10:00", "10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-18:00"],
  closedWeekdays: [1],
  customCakesPerWindow: 2,
  nutConfirmationRequired: true,
  frostings: ["Vanilla buttercream", "Chocolate ganache", "Cream cheese", "Whipped mascarpone"],
  maxMessageChars: 30,
  plan: "Neighborhood",
  createdAt: "2026-09-01T16:00:00.000Z",
  products: [
    {
      id: "choc-fudge",
      name: "Chocolate Fudge Layer Cake",
      category: "cakes",
      description: "Three layers of dark chocolate sponge with fudge filling.",
      price: 38,
      allergens: ["gluten", "dairy", "egg"],
      customizable: true,
      sizes: CAKE_SIZES(38, 52, 68),
      palette: ["#5a3322", "#3b2016", "#e8b04b"],
      shape: "cake",
    },
    {
      id: "vanilla-celebration",
      name: "Vanilla Bean Celebration Cake",
      category: "cakes",
      description: "Madagascar vanilla sponge, raspberry jam, confetti sprinkles.",
      price: 36,
      allergens: ["gluten", "dairy", "egg"],
      customizable: true,
      sizes: CAKE_SIZES(36, 48, 64),
      palette: ["#f3dfb4", "#fff6e6", "#e2557a"],
      shape: "cake",
    },
    {
      id: "lemon-raspberry",
      name: "Lemon Raspberry Cake",
      category: "cakes",
      description: "Lemon chiffon with fresh raspberries and lemon curd.",
      price: 40,
      allergens: ["gluten", "dairy", "egg"],
      customizable: true,
      sizes: CAKE_SIZES(40, 54, 70),
      palette: ["#f6e27a", "#fffaf0", "#d6336c"],
      shape: "cake",
    },
    {
      id: "hazelnut-praline",
      name: "Hazelnut Praline Cake",
      category: "cakes",
      description: "Toasted hazelnut dacquoise, praline mousse, milk chocolate glaze.",
      price: 42,
      allergens: ["gluten", "dairy", "egg", "tree nuts"],
      customizable: true,
      sizes: CAKE_SIZES(42, 58, 74),
      palette: ["#b07a4f", "#d9b48f", "#6b3e26"],
      shape: "cake",
    },
    {
      id: "morning-buns",
      name: "Morning Buns (4)",
      category: "pastries",
      description: "Orange-zest cinnamon sugar, laminated dough.",
      price: 14,
      allergens: ["gluten", "dairy"],
      palette: ["#d99a4e", "#f2c27b", "#8a4b1f"],
      shape: "bun",
    },
    {
      id: "almond-croissant",
      name: "Almond Croissants (2)",
      category: "pastries",
      description: "Twice-baked with frangipane and toasted almonds.",
      price: 10.5,
      allergens: ["gluten", "dairy", "egg", "tree nuts"],
      palette: ["#d8a15d", "#f5deb3", "#9c6b30"],
      shape: "croissant",
    },
    {
      id: "sourdough",
      name: "Country Sourdough Loaf",
      category: "bread",
      description: "72-hour fermented, dark crust, open crumb.",
      price: 9,
      allergens: ["gluten"],
      palette: ["#a8672e", "#d4a26a", "#5c3414"],
      shape: "loaf",
    },
    {
      id: "fruit-galette",
      name: "Seasonal Fruit Galette",
      category: "pastries",
      description: "Rustic tart with whatever the farmers market had this week.",
      price: 28,
      allergens: ["gluten", "dairy"],
      palette: ["#e3a857", "#c2413b", "#f4d58d"],
      shape: "galette",
    },
  ],
};

export function findProduct(merchant: Merchant, idOrName: string): Product | undefined {
  const q = idOrName.trim().toLowerCase();
  return (
    merchant.products.find((p) => p.id === q) ??
    merchant.products.find((p) => p.name.toLowerCase() === q) ??
    merchant.products.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.id))
  );
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const SHAPES: Product["shape"][] = ["cake", "bun", "croissant", "loaf", "galette", "cookie"];
const PALETTES: Product["palette"][] = [
  ["#c9824a", "#f1d3a8", "#7a3f1c"],
  ["#e7c16a", "#fff3d6", "#c2413b"],
  ["#8f5a3c", "#d8b08c", "#3b2016"],
  ["#f0b7a4", "#fff0ea", "#a8324a"],
];

// CSV columns: name,category,price,allergens,description[,customizable]
// allergens separated by ";" (e.g. "gluten;dairy"). Header row required.
export function parseCatalogCsv(csv: string): Product[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one product.");
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const required of ["name", "category", "price"]) {
    if (col(required) < 0) throw new Error(`CSV is missing the "${required}" column.`);
  }
  return lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line);
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");
    const name = get("name");
    const price = Number(get("price").replace(/[$,]/g, ""));
    if (!name || !Number.isFinite(price)) throw new Error(`Row ${i + 2}: name and numeric price are required.`);
    const category = (get("category") || "other").toLowerCase();
    const customizable = /^(y|yes|true|1)$/i.test(get("customizable"));
    const shape: Product["shape"] = category.includes("cake")
      ? "cake"
      : category.includes("bread")
        ? "loaf"
        : SHAPES[(i % (SHAPES.length - 1)) + 1];
    return {
      id: slugify(name),
      name,
      category,
      description: get("description"),
      price,
      allergens: get("allergens")
        .split(/[;|]/)
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean) as Allergen[],
      customizable: customizable || undefined,
      sizes: customizable ? CAKE_SIZES(price, Math.round(price * 1.4), Math.round(price * 1.85)) : undefined,
      palette: PALETTES[i % PALETTES.length],
      shape,
    };
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export const SAMPLE_CSV = `name,category,price,allergens,description,customizable
Brown Butter Birthday Cake,cakes,44,gluten;dairy;egg,Brown butter sponge with salted caramel,yes
Pistachio Rose Cake,cakes,48,gluten;dairy;egg;tree nuts,Pistachio sponge with rose buttercream,yes
Kouign-Amann,pastries,6.5,gluten;dairy,Caramelized laminated pastry,
Olive Fougasse,bread,8,gluten,Leaf-shaped bread with Castelvetrano olives,
Oatmeal Cream Pies (3),cookies,12,gluten;dairy;egg,Soft oat cookies with vanilla cream,`;
