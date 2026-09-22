import { useMediaDrop } from "./use-media-drop";
import { VideoCell } from "./video-cell";
import { CellBinding } from "./cell-binding";
import { ArtifactCell } from "./artifact-cell";
import { ImageCell } from "./image-cell";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Link2, FastForward, RotateCcw, Trash2, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFolioStore } from "@/lib/notebook/store";
import { useFolioUi } from "@/lib/notebook/ui";
import type { CellKind } from "@/lib/notebook/types";
import { CodeCell } from "./code-cell";
import { InsertRule } from "./insert-rule";
import { MarkdownCell } from "./markdown-cell";

type Props = {
  nodeId: string;
  fullView?: boolean;
};

export function NotebookDocument({ nodeId, fullView = false }: Props) {
  const mediaDrop = useMediaDrop(nodeId);
  const node = useFolioStore((s) => s.nodes.find((n) => n.id === nodeId));
  const focusId = useFolioStore((s) => s.focusedNodeId);
  const setArtifactNetwork = useFolioStore((s) => s.setArtifactNetwork);
  const setCellImage = useFolioStore((s) => s.setCellImage);
  const setCellSource = useFolioStore((s) => s.setCellSource);
  const insertCell = useFolioStore((s) => s.insertCell);
  const removeCell = useFolioStore((s) => s.removeCell);
  const runCell = useFolioStore((s) => s.runCell);
  const runAll = useFolioStore((s) => s.runAll);
  const restart = useFolioStore((s) => s.restart);
  const setTitle = useFolioStore((s) => s.setTitle);
  const setRef = useFolioStore((s) => s.setRef);
  const removeNotebook = useFolioStore((s) => s.removeNotebook);
  const focused = useFolioStore((s) => s.focusedNodeId === nodeId);
  const toggleFocused = useFolioStore((s) => s.toggleFocused);
  const addLinkedNotebook = useFolioStore((s) => s.addLinkedNotebook);
  const ask = useFolioUi((s) => s.ask);

  const [editingMd, setEditingMd] = useState<string | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const clickTimer = useRef<number | null>(null);
  const proximitySample = useRef(0);
  const updateControlProximity = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const now = performance.now();
    if (event.type === "pointermove" && now - proximitySample.current < 50) return;
    proximitySample.current = now;
    const rect = event.currentTarget.getBoundingClientRect();
    // Use screen coordinates so this also follows the canvas zoom.
    const fraction = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const opacity = Math.max(0, Math.min(1, (fraction - 0.5) / 0.4));
    const cells = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(".folio-cell"));
    const cellValues = cells.map(cell => {
      const bounds = cell.getBoundingClientRect();
      return event.clientY >= bounds.top && event.clientY <= bounds.bottom ? opacity.toFixed(3) : "0";
    });
    const inputs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(".folio-input-row"));
    const inputValues = inputs.map(row => {
      const bounds = row.getBoundingClientRect();
      if (event.clientY < bounds.top || event.clientY > bounds.bottom) return "0";
      const fraction = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
      return Math.max(0, Math.min(1, (fraction - 0.5) / 0.4)).toFixed(3);
    });
    cells.forEach((cell, index) => cell.style.setProperty("--cell-control-opacity", cellValues[index]));
    inputs.forEach((row, index) => row.style.setProperty("--input-control-opacity", inputValues[index]));
  }, []);
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        if (editingMd) {
          setEditingMd(null);
          return;
        }
        const active = document.activeElement;
        const cellId = findCellIdFromFocus(active, node?.data.cells.map((c) => c.id) ?? []);
        if (cellId) void runCell(nodeId, cellId);
      }
    },
    [editingMd, node, nodeId, runCell],
  );

  if (!node) return null;
  const { data } = node;

  return (
    <div className="folio-doc nowheel nopan" {...mediaDrop} onKeyDown={onKeyDown}
      onPointerEnter={updateControlProximity}
      onPointerMove={updateControlProximity}
      onPointerLeave={event => {
        proximitySample.current = 0;
        event.currentTarget.querySelectorAll<HTMLElement>(".folio-cell").forEach(cell => cell.style.setProperty("--cell-control-opacity", "0"));
        event.currentTarget.querySelectorAll<HTMLElement>(".folio-input-row").forEach(row => row.style.setProperty("--input-control-opacity", "0"));
      }}
    >
      <header className="notebook-drag-handle folio-doc-head">
        <div className="folio-doc-id">
          {titleEditing ? (
            <input
              className="folio-title-input nodrag nowheel nopan"
              value={data.title}
              onChange={(e) => setTitle(nodeId, e.target.value)}
              onBlur={() => setTitleEditing(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setTitleEditing(false);
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="folio-title"
              onClick={() => {
                if (clickTimer.current) window.clearTimeout(clickTimer.current);
                clickTimer.current = window.setTimeout(() => {
                  setTitleEditing(true);
                }, 220);
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                if (clickTimer.current) window.clearTimeout(clickTimer.current);
                e.currentTarget.focus();
                toggleFocused(nodeId);
              }}
              title="Click to rename · Double-click to focus"
            >
              {data.title || "Untitled notebook"}
            </button>
          )}
          <CardRef nodeId={nodeId} value={data.ref} onCommit={setRef} />
        </div>
        <div className="folio-doc-actions nodrag nopan">
          <Button type="button" size="iconSm" variant="ghost" onClick={(event) => { event.currentTarget.focus(); toggleFocused(nodeId); }} aria-label={focused ? "Exit full view" : "Open full view"} title={focused ? "Exit full view" : "Open full view"}>
            {focused ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button
            type="button"
            size="iconSm"
            variant="ghost"
            onClick={() => void runAll(nodeId)}
            aria-label="Run all"
            title="Run all"
          >
            <FastForward />
          </Button>
          <Button type="button" size="iconSm" variant="ghost" onClick={() => restart(nodeId)} title="Restart kernel">
            <RotateCcw />
          </Button>
          <Button
            type="button"
            size="iconSm"
            variant="ghost"
            onClick={() => addLinkedNotebook(nodeId)}
            title="Add a linked page beside this one"
          >
            <Link2 />
          </Button>
          <Button
            type="button"
            size="iconSm"
            variant="danger"
            title="Remove notebook"
            onClick={() =>
              ask({
                title: "Remove notebook",
                body: `Remove “${data.title || "Untitled notebook"}” from the desk?`,
                confirmLabel: "Remove",
                danger: true,
                onConfirm: () => removeNotebook(nodeId),
              })
            }
          >
            <Trash2 />
          </Button>
        </div>
      </header>

      <div className="folio-doc-body">
        <InsertRule onInsert={(kind) => insertCell(nodeId, null, kind)} />
        {data.cells.map((cell) => (
          <section key={cell.id} className="folio-cell" data-cell-id={cell.id}>
            {data.cells.length > 1 && <button
              type="button"
              className="folio-cell-delete nodrag nopan"
              aria-label={`Remove ${cell.name}`}
              title="Remove cell"
              onClick={() => removeCell(nodeId, cell.id)}
            ><Trash2 size={14} aria-hidden="true" /></button>}
            {(cell.kind === "code" || cell.kind === "artifact") && <div className="folio-panel-themes nodrag nopan">
              {(["codeTheme"] as const).map(panel => <div className="folio-panel-theme" role="group" aria-label={`${panel === "codeTheme" ? "Code" : "Preview"} theme`} key={panel}>
                {(["light", "dark"] as const).map(theme => <button type="button" key={theme} aria-label={`${panel === "codeTheme" ? "Code" : "Preview"}: ${theme}`} title={`${panel === "codeTheme" ? "Code" : "Preview"}: ${theme}`} aria-pressed={(cell[panel] ?? "light") === theme} onClick={() => useFolioStore.getState().setPanelTheme(nodeId, cell.id, panel, theme)}>{theme === "light" ? <Sun size={12} aria-hidden="true" /> : <Moon size={12} aria-hidden="true" />}</button>)}
              </div>)}
            </div>}
            <CellBinding nodeId={nodeId} cell={cell} />
            {cell.kind === "artifact" ? (
              <ArtifactCell nodeId={nodeId} cell={cell} active={fullView || !focusId} onChange={(source) => setCellSource(nodeId, cell.id, source)} onNetwork={(value) => setArtifactNetwork(nodeId, cell.id, value)} />
            ) : cell.kind === "video" ? (
              <VideoCell video={cell.video} />
            ) : cell.kind === "image" ? (
              <ImageCell image={cell.image} onChange={(image) => setCellImage(nodeId, cell.id, image)} />
            ) : cell.kind === "markdown" ? (
              <MarkdownCell
                cell={cell}
                editing={editingMd === cell.id}
                onChange={(source) => setCellSource(nodeId, cell.id, source)}
                onStartEdit={() => setEditingMd(cell.id)}
                onStopEdit={() => setEditingMd(null)}
              />
            ) : (
              <CodeCell
                nodeId={nodeId}
                cell={cell}
                onChange={(source) => setCellSource(nodeId, cell.id, source)}
                onRun={() => void runCell(nodeId, cell.id)}
              />
            )}
            <InsertRule onInsert={(kind: CellKind) => insertCell(nodeId, cell.id, kind)} />
          </section>
        ))}
      </div>
    </div>
  );
}

function CardRef({
  nodeId,
  value,
  onCommit,
}: {
  nodeId: string;
  value: string;
  onCommit: (id: string, ref: string) => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancel = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!editing) {
    return (
      <button
        type="button"
        className="folio-ref nodrag nowheel nopan"
        title="Reference for this card. Click to change."
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        @{value || "untitled"}
      </button>
    );
  }

  return (
    <input
      className="folio-ref-input nodrag nowheel nopan"
      value={draft}
      autoFocus
      spellCheck={false}
      aria-label="Card reference"
      onChange={(event) => setDraft(event.target.value.replace(/^@/, ""))}
      onBlur={() => {
        if (cancel.current) {
          cancel.current = false;
          setDraft(value);
          setEditing(false);
          return;
        }
        const ok = onCommit(nodeId, draft);
        if (!ok) {
          toast.message("Pick another reference", {
            description: "Use a unique name: letters, numbers, and underscores.",
          });
          setDraft(value);
        }
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancel.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function findCellIdFromFocus(el: Element | null, ids: string[]): string | null {
  let cur: Element | null = el;
  while (cur) {
    const id = cur.getAttribute?.("data-cell-id");
    if (id && ids.includes(id)) return id;
    cur = cur.parentElement;
  }
  return null;
}
