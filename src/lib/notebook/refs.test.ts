import assert from "node:assert/strict";
import { test } from "node:test";
import { downstreamOf, prepareSource, replaceRef, slugRef, splitAtRefs, uniqueRef } from "./refs.ts";

test("a line points from parent to child, once", () => {
  const edges = [
    { source: "a", target: "b" },
    { source: "a", target: "b" },
    { source: "a", target: "c" },
    { source: "b", target: "a" },
    { source: "c", target: "c" },
  ];
  assert.deepEqual(downstreamOf(edges, "a"), ["b", "c"]);
  assert.deepEqual(downstreamOf(edges, "b"), ["a"]);
  assert.deepEqual(downstreamOf(edges, "c"), []);
});

test("slug and unique handles", () => {
  assert.equal(slugRef("Getting started"), "gettingStarted");
  assert.equal(slugRef("Rich text"), "richText");
  const taken = new Set<string>();
  assert.equal(uniqueRef("untitled", taken), "untitled");
  assert.equal(uniqueRef("untitled", taken), "untitled2");
});

test("split keeps strings, comments, and emails as text", () => {
  const parts = splitAtRefs(`const s = "@visits"\n// @hidden\nemail@domain.com\n@visits.length`);
  const refs = parts.filter((part) => part.type === "ref").map((part) => part.name);
  assert.deepEqual(refs, ["visits"]);
});

test("template expressions still see a reference", () => {
  const parts = splitAtRefs("md`hello ${@name}`");
  assert.deepEqual(
    parts.filter((part) => part.type === "ref").map((part) => part.name),
    ["name"],
  );
});

test("prepareSource lifts card imports and erases sigils", () => {
  const prepared = prepareSource("import @sketchbook\n\n@sketchbook.seed");
  assert.equal(prepared.code.includes("@"), false);
  assert.equal(prepared.locals[0], "sketchbook");
  assert.equal(prepared.code.trim().endsWith("sketchbook.seed"), true);
});

test("replaceRef rewrites a handle and leaves other words", () => {
  const next = replaceRef('import @sketchbook\n@sketchbook.seed\nconst note = "@sketchbook"', "sketchbook", "art");
  assert.match(next, /import @art/);
  assert.match(next, /@art\.seed/);
  assert.match(next, /"@sketchbook"/);
});

