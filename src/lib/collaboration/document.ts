import * as Y from "yjs";
import type { Cell, FolioNode, FolioEdge } from "../notebook/types";
import { parseFolioExport, serializeDesk } from "../notebook/io";

export type SharedDesk = { nodes: FolioNode[]; edges: FolioEdge[] };
const LOCAL = Symbol("local edit");
export { LOCAL as LOCAL_EDIT };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function fields(map: Y.Map<unknown>, next: Record<string, unknown>, previous: Record<string, unknown> = {}) {
  for (const key of new Set([...Object.keys(next), ...Object.keys(previous)])) {
    if (equal(next[key], previous[key])) continue;
    if (next[key] === undefined) map.delete(key); else map.set(key, structuredClone(next[key]));
  }
}
export function editText(text: Y.Text, next: string) {
  const previous = text.toString(); if (previous === next) return;
  let start = 0; while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let end = 0; while (end < previous.length - start && end < next.length - start && previous[previous.length - end - 1] === next[next.length - end - 1]) end++;
  text.delete(start, previous.length - start - end);
  text.insert(start, next.slice(start, next.length - end));
}
function cellFields(cell: Cell): Record<string, unknown> {
  const { output: _output, status: _status, stale: _stale, source: _source, ...value } = cell;
  return value;
}
function order(list: Y.Array<string>, next: string[], previous: string[]) {
  if (equal(next, previous)) return;
  for (let i = list.length - 1; i >= 0; i--) if (!next.includes(list.get(i))) list.delete(i, 1);
  const retainedNext = next.filter(id => previous.includes(id));
  const retainedBefore = previous.filter(id => next.includes(id));
  const reordered = !equal(retainedNext, retainedBefore);
  for (let i = 0; i < next.length; i++) {
    const current = list.toArray(); const existing = current.indexOf(next[i]);
    if (existing < 0) {
      const predecessor = next[i - 1]; const index = predecessor ? current.indexOf(predecessor) + 1 : 0;
      list.insert(index, [next[i]]);
    } else if (reordered && previous.includes(next[i]) && current[i] !== next[i]) {
      list.delete(existing, 1); list.insert(Math.min(i, list.length), [next[i]]);
    }
  }
}
/** Write only fields changed by this client. Execution output and view state are never shared. */
export function writeDesk(doc: Y.Doc, next: SharedDesk, previous: SharedDesk = { nodes: [], edges: [] }) {
  const nodes = doc.getMap<Y.Map<unknown>>("nodes"); const edges = doc.getMap<FolioEdge>("edges");
  doc.transact(() => {
    for (const node of previous.nodes) if (!next.nodes.some(n => n.id === node.id)) nodes.delete(node.id);
    for (const node of next.nodes) {
      const before = previous.nodes.find(n => n.id === node.id);
      if (before && equal(sharedNode(node), sharedNode(before))) continue;
      let map = nodes.get(node.id);
      if (!map) {
        if (before) continue; // A concurrently removed notebook is not resurrected by an edit.
        map = new Y.Map(); nodes.set(node.id, map); map.set("cells", new Y.Map()); map.set("order", new Y.Array());
      }
      fields(map, { title: node.data.title, ref: node.data.ref, sourcePath: node.data.sourcePath, position: node.position, style: node.style }, before ? { title: before.data.title, ref: before.data.ref, sourcePath: before.data.sourcePath, position: before.position, style: before.style } : {});
      const cells = map.get("cells") as Y.Map<Y.Map<unknown>>; const ids = map.get("order") as Y.Array<string>;
      for (const cell of before?.data.cells ?? []) if (!node.data.cells.some(c => c.id === cell.id)) cells.delete(cell.id);
      for (const cell of node.data.cells) {
        const old = before?.data.cells.find(c => c.id === cell.id);
        if (old && equal({ ...cellFields(cell), source: cell.source }, { ...cellFields(old), source: old.source })) continue;
        let shared = cells.get(cell.id);
        if (!shared) { if (old) continue; shared = new Y.Map(); cells.set(cell.id, shared); shared.set("source", new Y.Text()); }
        fields(shared, cellFields(cell), old ? cellFields(old) : {});
        if (!old || old.source !== cell.source) editText(shared.get("source") as Y.Text, cell.source);
      }
      order(ids, node.data.cells.map(c => c.id), before?.data.cells.map(c => c.id) ?? []);
    }
    for (const edge of previous.edges) if (!next.edges.some(e => e.id === edge.id)) edges.delete(edge.id);
    for (const edge of next.edges) {
      const old = previous.edges.find(e => e.id === edge.id);
      const value = sharedEdge(edge);
      if (!old || !equal(value, sharedEdge(old))) edges.set(edge.id, value);
    }
  }, LOCAL);
}
function sharedNode(node: FolioNode) {
  return { id: node.id, position: node.position, style: node.style, data: { title: node.data.title, ref: node.data.ref, sourcePath: node.data.sourcePath, cells: node.data.cells.map(c => ({ ...cellFields(c), source: c.source })) } };
}
function sharedEdge(edge: FolioEdge): FolioEdge {
  return { id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle };
}
export function readDesk(doc: Y.Doc): SharedDesk {
  const nodes = [...doc.getMap<Y.Map<unknown>>("nodes")].sort(([a], [b]) => a.localeCompare(b)).map(([id, node]) => {
    const cells = node.get("cells") as Y.Map<Y.Map<unknown>>; const order = node.get("order") as Y.Array<string>;
    if (!(cells instanceof Y.Map) || !(order instanceof Y.Array)) throw Error("Invalid shared notebook.");
    const ids = [...new Set([...order.toArray(), ...[...cells.keys()].sort()])].filter(key => cells.has(key));
    return { id, position: node.get("position"), style: node.get("style"), data: { title: node.get("title"), ref: node.get("ref"), sourcePath: node.get("sourcePath"), cells: ids.map(key => {
      const cell = cells.get(key)!; const source = cell.get("source");
      if (!(source instanceof Y.Text)) throw Error("Invalid shared cell.");
      return { ...cell.toJSON(), id: key, source: source.toString(), output: null, status: "idle" };
    }) } };
  });
  const desk = parseFolioExport({ nodes, edges: [...doc.getMap<FolioEdge>("edges").values()] });
  if (!desk) throw Error("Shared document is invalid or exceeds notebook limits.");
  return desk;
}
export function deskDocument(desk: SharedDesk): Y.Doc {
  const clean = serializeDesk(desk.nodes, desk.edges);
  const doc = new Y.Doc(); writeDesk(doc, { nodes: clean.nodes, edges: clean.edges }); return doc;
}
