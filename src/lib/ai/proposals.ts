import { bindReferences, markDependents, normalizeCells } from "../notebook/cell-references";
import type { FolioNode } from "../notebook/types";
import type { Proposal } from "./protocol";

/** Validate every target before changing any cell; stale proposals never overwrite newer edits. */
export function applyProposal(nodes: FolioNode[], proposal: Proposal, baseline: FolioNode[], makeId: () => string = () => crypto.randomUUID()): FolioNode[] {
  for (const change of proposal.changes) {
    const node = nodes.find(n => n.id === change.nodeId);
    if (!node) throw Error("A notebook in this proposal was removed. Ask for a new proposal.");
    const originalNode = baseline.find(n => n.id === change.nodeId);
    if (!originalNode) throw Error("This proposal targets a notebook outside the request context.");
    if (change.action === "replace") {
      const cell = node.data.cells.find(c => c.id === change.cellId);
      const original = baseline.find(n => n.id === change.nodeId)?.data.cells.find(c => c.id === change.cellId);
      if (!cell || !original || cell.source !== original.source || cell.kind !== original.kind) throw Error("A proposed cell changed since this request. Ask for a new proposal.");
      if (!["code", "markdown", "artifact"].includes(cell.kind)) throw Error("This proposal targets a media cell.");
    } else {
      if (change.afterCellId !== null && !originalNode.data.cells.some(c => c.id === change.afterCellId)) throw Error("This insertion targets a cell outside the request context.");
      if (change.afterCellId !== null && !node.data.cells.some(c => c.id === change.afterCellId)) throw Error("The insertion target was removed.");
    }
  }
  let next = nodes;
  const changed: { nodeId: string; cellId: string }[] = [];
  for (const change of proposal.changes) {
    next = next.map(node => {
      if (node.id !== change.nodeId) return node;
      const cells = [...node.data.cells];
      if (change.action === "replace") {
        const index = cells.findIndex(c => c.id === change.cellId);
        cells[index] = { ...cells[index], source: change.source, references: bindReferences(change.source, next, cells[index].references), status: "idle", output: null };
        changed.push({ nodeId: node.id, cellId: change.cellId });
      } else {
        if (cells.length >= 500) throw Error("This notebook is full.");
        const id = makeId();
        cells.splice(change.afterCellId === null ? 0 : cells.findIndex(c => c.id === change.afterCellId) + 1, 0, { id, kind: change.kind, source: change.source, status: "idle", output: null });
        changed.push({ nodeId: node.id, cellId: id });
      }
      return { ...node, data: { ...node.data, cells } };
    });
  }
  return markDependents(normalizeCells(next), changed);
}
