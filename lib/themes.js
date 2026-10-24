// Theme registry. The actual design tokens live in styles/themes.css ([data-theme="id"] blocks).
// Adding a theme = add an entry here + one CSS block. No component changes needed.
export const THEME_GROUPS = [
  { id: "standard", label: "Standard", themes: [
    { id: "light", name: "Light", blurb: "Clean and bright" },
    { id: "dark", name: "Dark", blurb: "Calm and elegant" },
    { id: "amoled", name: "AMOLED", blurb: "True black for OLED" },
    { id: "minimal", name: "Minimal", blurb: "Restrained monochrome" },
  ] },
  { id: "marvel", label: "Marvel", themes: [
    { id: "marvel", name: "Marvel", blurb: "Red and ink" },
    { id: "ironman", name: "Iron Man", blurb: "Red, gold, metal" },
    { id: "spiderman", name: "Spider-Man", blurb: "Red, blue, web" },
    { id: "moonknight", name: "Moon Knight", blurb: "Silver and lunar" },
    { id: "thor", name: "Thor", blurb: "Storm blue, silver" },
    { id: "captain", name: "Captain America", blurb: "Navy, red, white" },
    { id: "hawkeye", name: "Hawkeye", blurb: "Purple, precision" },
    { id: "hulk", name: "Hulk", blurb: "Green and violet" },
    { id: "venom", name: "Venom", blurb: "Black, liquid" },
  ] },
  { id: "dc", label: "DC", themes: [
    { id: "dc", name: "DC", blurb: "Deep blue, bright" },
    { id: "batman", name: "Batman", blurb: "Gotham gold" },
    { id: "superman", name: "Superman", blurb: "Blue, red, gold" },
    { id: "flash", name: "Flash", blurb: "Red and lightning" },
    { id: "doom", name: "Dr. Doom", blurb: "Green iron" },
  ] },
  { id: "atmosphere", label: "Atmosphere", themes: [
    { id: "hell", name: "Hell", blurb: "Ember, ash, molten red" },
  ] },
];
export const ALL_THEMES = THEME_GROUPS.flatMap((g) => g.themes);
export const THEME_IDS = ALL_THEMES.map((t) => t.id);
export const isThemeId = (id) => THEME_IDS.includes(id) || id === "custom";
export const MOTION = ["full", "reduced", "off"];
export const GLASS = ["off", "soft", "strong"];

// Custom-theme tokens → inline CSS variables (applied on <html data-theme="custom">)
function contrastFg(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#0b0c10" : "#ffffff";
}
export function customThemeStyle(t) {
  if (!t) return {};
  const x = t.tokens || t;
  return {
    "--c-primary-fg": contrastFg(x.primary),
    "--c-bg": x.background, "--c-surface": x.surface, "--c-border": x.border, "--c-text": x.text,
    "--c-primary": x.primary, "--c-secondary": x.secondary, "--c-accent": x.accent,
    "--radius": `${x.radius}px`, "--shadow-card": x.card === "elevated" ? "0 8px 24px rgb(0 0 0 / 0.25)" : "none",
    "--card-border-w": x.card === "flat" ? "0px" : "1px",
    "--animation-speed": x.intensity === "none" ? "0ms" : x.intensity === "medium" ? "260ms" : "160ms",
    "--bg-effect": ({ none: "none",
      grid: "linear-gradient(var(--c-border) 1px, transparent 1px), linear-gradient(90deg, var(--c-border) 1px, transparent 1px)",
      dots: "radial-gradient(var(--c-border) 1px, transparent 1px)",
      glow: "radial-gradient(60% 40% at 80% 0%, color-mix(in srgb, var(--c-primary) 22%, transparent), transparent)" })[x.effect],
    "--bg-effect-size": x.effect === "dots" ? "22px 22px" : x.effect === "grid" ? "44px 44px" : "auto",
  };
}
export const DEFAULT_CUSTOM = { primary: "#7c83ff", secondary: "#2dd4bf", accent: "#f59e0b", background: "#0e0f13", surface: "#16181d", border: "#262a33", text: "#eceef2", radius: 12, card: "outlined", intensity: "subtle", effect: "glow" };

export const DEFAULT_THEME = "dark";
// Resolve what a person typed/said ("hell", "Iron Man theme", "the default theme") against the REAL registry.
// → {id} | {ambiguous:[names]} | {notFound:true}. Custom (user-built) themes and model-invented names are never accepted here.
export function matchTheme(raw) {
  const clean = String(raw || "").toLowerCase().replace(/\b(the|my|theme|please)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  if (!clean) return { notFound: true };
  if (["default", "normal", "original", "standard"].includes(clean)) return { id: DEFAULT_THEME };
  const key = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ""); const k = key(clean);
  const exact = ALL_THEMES.filter((t) => key(t.id) === k || key(t.name) === k);
  if (exact.length === 1) return { id: exact[0].id };
  const part = ALL_THEMES.filter((t) => k.length >= 3 && (key(t.name).includes(k) || key(t.id).includes(k)));
  if (part.length === 1) return { id: part[0].id };
  if (part.length > 1) return { ambiguous: part.map((t) => t.name) };
  return { notFound: true };
}
