import type { Range } from "@codemirror/state";
import * as Y from "yjs";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { cellText, updatePresence, type Peer } from "@/lib/collaboration/client";
class Caret extends WidgetType {
  constructor(readonly name: string, readonly color: string) { super(); }
  eq(other: Caret) { return other.name === this.name && other.color === this.color; }
  toDOM() { const el = document.createElement("span"); el.className = "folio-remote-caret"; el.style.borderColor = this.color; const label = document.createElement("span"); label.textContent = this.name; label.style.background = this.color; el.append(label); return el; }
}
export function editorPresence(nodeId: string, cellId: string, peers: Peer[]) {
  const ranges: Range<Decoration>[] = [];
  const text = cellText(nodeId, cellId);
  if (text?.doc) for (const peer of peers) {
    const selection = peer.selection;
    if (selection?.nodeId !== nodeId || selection.cellId !== cellId) continue;
    try {
      const anchor = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(selection.anchor as any), text.doc);
      const head = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(selection.head as any), text.doc);
      if (!anchor || !head || anchor.type !== text || head.type !== text) continue;
      if (anchor.index !== head.index) ranges.push(Decoration.mark({ attributes: { style: `background:${peer.color}33` } }).range(Math.min(anchor.index, head.index), Math.max(anchor.index, head.index)));
      ranges.push(Decoration.widget({ widget: new Caret(peer.name, peer.color), side: 1 }).range(head.index));
    } catch { /* Ignore malformed or obsolete remote selections. */ }
  }
  return [EditorView.decorations.compute(["doc"], state => Decoration.set(ranges.flatMap(range => { const from = Math.min(range.from, state.doc.length), to = Math.min(range.to, state.doc.length); return from === to && range.from !== range.to ? [] : [range.value.range(from, to)]; }), true)), EditorView.updateListener.of(update => {
    if (!update.view.hasFocus || !(update.selectionSet || update.docChanged || update.focusChanged)) return;
    const source = cellText(nodeId, cellId); if (!source) return;
    const selection = update.state.selection.main;
    updatePresence("nodeId", nodeId);
    updatePresence("selection", { nodeId, cellId,
      anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(source, Math.min(selection.anchor, source.length))),
      head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(source, Math.min(selection.head, source.length))),
    });
  })];
}
