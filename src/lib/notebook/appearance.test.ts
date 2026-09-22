import assert from "node:assert/strict";
import { test } from "node:test";
import { PALETTES, FONT_PAIRS, normalizeAppearance } from "./appearance";

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map((s) => parseInt(s, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + .05) / (dark + .05);
}
test("all palette body text, secondary text, accents and desk controls have readable contrast", () => {
  for (const p of PALETTES) {
    const colors = p.colors;
    for (const [fg, bg] of [["ink", "paper"], ["ink-soft", "paper"], ["forest", "paper"], ["forest-fg", "forest"], ["desk-fg", "desk"], ["desk-fg", "desk-2"]]) {
      assert.ok(contrast(colors[`--color-${fg}`], colors[`--color-${bg}`]) >= 4.5, `${p.name}: ${fg} on ${bg}`);
    }
  }
});
test("appearance persistence accepts only named presets and recovers malformed input", () => {
  assert.deepEqual(normalizeAppearance({ palette: "midnight", font: "book" }), { palette: "midnight", font: "book" });
  for (const input of [null, "oops", { palette: "url(evil)", font: "unavailable" }]) {
    assert.deepEqual(normalizeAppearance(input), { palette: "original", font: "original" });
  }
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length);
  assert.equal(new Set(FONT_PAIRS.map((p) => p.id)).size, FONT_PAIRS.length);
  assert.equal(PALETTES[0].colors["--color-paper"], "#f3eee4");
});
