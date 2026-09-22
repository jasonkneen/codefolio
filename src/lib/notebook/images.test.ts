import assert from "node:assert/strict";
import { test } from "node:test";
import { imageUrl, isPersistentImageSource, rasterFormat } from "./images";
import { parseFolioExport, serializeDesk } from "./io";

test("image URLs reject executable, local and credential-bearing addresses", () => {
  assert.equal(imageUrl(" https://example.com/a.png "), "https://example.com/a.png");
  for (const url of ["javascript:alert(1)", "file:///a.png", "data:text/html,hello", "https://user:pass@example.com/a.png"]) assert.throws(() => imageUrl(url));
  assert.equal(isPersistentImageSource("blob:https://example.com/123"), false);
});
test("upload signatures accept raster files and reject SVG or spoofed documents", () => {
  assert.equal(rasterFormat(Uint8Array.from([137,80,78,71,13,10,26,10])), "png");
  assert.equal(rasterFormat(Uint8Array.from([255,216,255,224])), "jpeg");
  assert.equal(rasterFormat(new TextEncoder().encode("GIF89a0123456789")), "gif");
  assert.equal(rasterFormat(new TextEncoder().encode("RIFF1234WEBP1234")), "webp");
  assert.equal(rasterFormat(new TextEncoder().encode("<svg onload=bad>")), null);
  assert.equal(rasterFormat(new TextEncoder().encode("<!DOCTYPE html>")), null);
});
test("image cells export and import their embedded image, description and caption", () => {
  const imported = parseFolioExport({ folio: 2, nodes: [{ id: "n", data: { title: "Image", cells: [{ id: "i", kind: "image", source: "", image: { src: "data:image/png;base64,aGVsbG8=", alt: "A landscape", caption: "Morning", width: 300, height: 200 } }] } }], edges: [] });
  assert.ok(imported);
  assert.deepEqual(parseFolioExport(serializeDesk(imported.nodes, imported.edges)), imported);
  assert.equal(imported.nodes[0].data.cells[0].image?.caption, "Morning");
  const unsafe = structuredClone(imported);
  unsafe.nodes[0].data.cells[0].image!.src = "javascript:alert(1)";
  assert.equal(parseFolioExport(unsafe), null);
});
