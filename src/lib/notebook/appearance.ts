import { create } from "zustand";

const keys = ["desk", "desk-2", "desk-fg", "paper", "paper-2", "ink", "ink-soft", "muted", "line", "forest", "forest-fg", "danger"] as const;
function palette(colors: string[]) {
  return Object.fromEntries(keys.map((key, index) => [`--color-${key}`, colors[index]])) as Record<string, string>;
}
export const PALETTES = [
  { id: "original", name: "Original", mode: "light", note: "Warm paper, dark desk", colors: palette(["#141311", "#1c1a17", "#f3eee4", "#f3eee4", "#ebe4d6", "#1c1916", "#4a453e", "#7a7268", "#ddd4c4", "#3f5d51", "#f3eee4", "#8f3d32"]) },
  { id: "porcelain", name: "Porcelain", mode: "light", note: "Quiet whites, graphite", colors: palette(["#e9e9e5", "#f5f5f1", "#303831", "#fdfdf9", "#f0f1eb", "#202923", "#505a52", "#667066", "#d8ded5", "#365e4a", "#ffffff", "#a43836"]) },
  { id: "linen", name: "Linen", mode: "light", note: "Natural flax, tobacco", colors: palette(["#ded4c5", "#eee5d8", "#473a2c", "#fcf5e9", "#eee2d0", "#342b23", "#60513f", "#776653", "#d9c9b3", "#7c512c", "#fff8ee", "#a33f35"]) },
  { id: "sage", name: "Sage", mode: "light", note: "Botanical, soft green", colors: palette(["#d9e2d7", "#e6ece1", "#2c4636", "#f6f8ee", "#e6ecdc", "#263c2b", "#4e6452", "#657960", "#ccd8c4", "#396647", "#ffffff", "#a23f3e"]) },
  { id: "rose", name: "Rosewood", mode: "light", note: "Blush paper, burgundy", colors: palette(["#e6d8d8", "#f1e6e3", "#512e38", "#fcf4ef", "#efe1dd", "#40242c", "#6b4c53", "#846770", "#dfcaca", "#863f58", "#ffffff", "#a0352a"]) },
  { id: "graphite", name: "Graphite", mode: "dark", note: "Charcoal, silver, mint", colors: palette(["#111416", "#1b2023", "#e0e7e5", "#22282b", "#2b3336", "#e5edeb", "#bdcbc7", "#96a9a3", "#3f4c48", "#9dcbb9", "#172c23", "#f0a69c"]) },
  { id: "midnight", name: "Midnight", mode: "dark", note: "Deep ink, cool blue", colors: palette(["#0d1421", "#162134", "#e0e8f6", "#1c2a40", "#24344c", "#e5edfa", "#b9c9de", "#94abc6", "#3b506c", "#a3c8f0", "#14253c", "#f4a9a7"]) },
  { id: "evergreen", name: "Evergreen", mode: "dark", note: "Forest, moss, cream", colors: palette(["#0d1916", "#152720", "#e1ebd8", "#20352c", "#294337", "#e7edda", "#c3cfb8", "#a0b296", "#42614e", "#c1d79d", "#1e3521", "#efaa92"]) },
  { id: "aubergine", name: "Aubergine", mode: "dark", note: "Plum, mauve, parchment", colors: palette(["#1b141e", "#281d2b", "#eddfec", "#342739", "#413247", "#f2e5eb", "#d1bbce", "#b99fb6", "#5b465f", "#dfb5cc", "#3a2131", "#f3ad9d"]) },
] as const;
export const FONT_PAIRS = [
  { id: "original", name: "Codefolio", note: "Newsreader / Figtree", display: '"Newsreader", "Iowan Old Style", Georgia, serif', body: '"Figtree", "Segoe UI", system-ui, sans-serif' },
  { id: "book", name: "Bookish", note: "Georgia / Georgia", display: 'Georgia, "Times New Roman", serif', body: 'Georgia, "Times New Roman", serif' },
  { id: "modern", name: "Modern", note: "Figtree / Figtree", display: '"Figtree", "Segoe UI", system-ui, sans-serif', body: '"Figtree", "Segoe UI", system-ui, sans-serif' },
  { id: "humanist", name: "Humanist", note: "Palatino / Trebuchet", display: '"Palatino Linotype", Palatino, Georgia, serif', body: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: "technical", name: "Technical", note: "IBM Plex Mono", display: '"IBM Plex Mono", ui-monospace, monospace', body: '"IBM Plex Mono", ui-monospace, monospace' },
] as const;
export type Appearance = { palette: string; font: string };
export const APPEARANCE_KEY = "folio-appearance-v1";
export function normalizeAppearance(value: unknown): Appearance {
  const input = value && typeof value === "object" ? value as Partial<Appearance> : {};
  return {
    palette: PALETTES.some((p) => p.id === input.palette) ? input.palette! : "original",
    font: FONT_PAIRS.some((p) => p.id === input.font) ? input.font! : "original",
  };
}
export const useAppearance = create<Appearance & { setAppearance: (patch: Partial<Appearance>) => void }>((set, get) => ({
  palette: "original", font: "original",
  setAppearance: (patch) => set(normalizeAppearance({ ...get(), ...patch })),
}));
