import { PreviewTheme } from "./preview-theme";
import { Play } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { NotebookEditor } from "./lazy-editor";
import { Button } from "@/components/ui/button";
import { inspect } from "@/lib/notebook/inspect";
import { describeValue, splitAtRefs } from "@/lib/notebook/refs";
import { kernelFor, useFolioStore } from "@/lib/notebook/store";
import { topLevelNames } from "@/lib/notebook/runtime";
import type { Cell } from "@/lib/notebook/types";
import { cn } from "@/lib/utils";
import { CellOutputView } from "./cell-output";

type Props = {
  nodeId: string;
  cell: Cell;
  onChange: (source: string) => void;
  onRun: () => void;
};

export function CodeCell({ nodeId, cell, onChange, onRun }: Props) {
  const [editing, setEditing] = useState(false);
  return (
    <div data-panel-theme={cell.codeTheme} className={cn("folio-code-cell", cell.status === "running" && "is-running")}>
      <div className="folio-code-gutter">
        <Button
          type="button"
          size="iconSm"
          variant="ghost"
          className="folio-run"
          onClick={onRun}
          title="Run cell (Shift+Enter)"
          aria-label="Run cell"
        >
          <Play className="ml-px" />
        </Button>
      </div>
      <div className="folio-code-body">
        {editing ? (
          <div className="nodrag nowheel nopan">
            <NotebookEditor value={cell.source} onChange={onChange} language="javascript" label="Code cell source" autoFocus onBlur={() => setEditing(false)} onRun={onRun} placeholder="Write JavaScript — last expression is shown" />
          </div>
        ) : (
          <CodeSource nodeId={nodeId} cellId={cell.id} source={cell.source} onEdit={() => setEditing(true)} />
        )}
        <CellOutputView themeControl={<PreviewTheme nodeId={nodeId} cell={cell} />} output={cell.output} running={cell.status === "running"} theme={cell.previewTheme ?? cell.codeTheme} />
      </div>
    </div>
  );
}

function CodeSource({
  nodeId,
  cellId,
  source,
  onEdit,
}: {
  nodeId: string;
  cellId: string;
  source: string;
  onEdit: () => void;
}) {
  const nodes = useFolioStore((s) => s.nodes);
  const cells = nodes.find((node) => node.id === nodeId)?.data.cells;
  const refs = nodes.map((node) => node.data.ref);
  const known = new Set<string>(refs);
  for (const item of cells ?? []) {
    if (item.id === cellId) break;
    if (item.kind !== "code") continue;
    for (const name of topLevelNames(item.source)) known.add(name);
  }
  for (const name of kernelFor(nodeId).names()) known.add(name);
  const parts = splitAtRefs(source);

  return (
    <button type="button" className="folio-code-pre nodrag nopan" onClick={onEdit} aria-label="Edit code">
      {source.trim() ? (
        <span className="folio-code-text">
          {parts.map((part, index) =>
            part.type === "text" ? (
              <span key={index}>{part.text}</span>
            ) : (
              <AtChip key={`${part.name}-${index}`} name={part.name} nodeId={nodeId} known={known.has(part.name)} />
            ),
          )}
        </span>
      ) : (
        <span className="folio-code-placeholder">Write JavaScript — last expression is shown</span>
      )}
    </button>
  );
}

function AtChip({ name, nodeId, known }: { name: string; nodeId: string; known: boolean }) {
  const card = useFolioStore((s) => s.nodes.find((node) => node.data.ref === name));
  const [tip, setTip] = useState<{ x: number; y: number; above: boolean } | null>(null);

  return (
    <span
      className={cn("folio-at", !known && "is-missing")}
      onMouseEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const above = rect.bottom + 188 > window.innerHeight;
        setTip({
          x: Math.max(8, Math.min(rect.left, window.innerWidth - 288)),
          y: above ? rect.top - 8 : rect.bottom + 8,
          above,
        });
      }}
      onMouseLeave={() => setTip(null)}
    >
      @{name}
      {tip
        ? createPortal(
            <AtTip
              name={name}
              nodeId={nodeId}
              cardId={card?.id}
              cardTitle={card?.data.title}
              x={tip.x}
              y={tip.y}
              above={tip.above}
            />,
            document.body,
          )
        : null}
    </span>
  );
}

function AtTip({
  name,
  nodeId,
  cardId,
  cardTitle,
  x,
  y,
  above,
}: {
  name: string;
  nodeId: string;
  cardId?: string;
  cardTitle?: string;
  x: number;
  y: number;
  above: boolean;
}) {
  const local = kernelFor(nodeId).peek(name);
  let title = `@${name}`;
  let body = "Run the cells above to give this a value.";
  let image: string | null = null;
  if (local.found) {
    const display = local.display ?? inspect(local.value);
    if (display.kind === "image") {
      image = display.src;
      body = display.alt || "canvas";
    } else {
      body = local.display ? (display.kind === "text" ? display.text : display.kind === "json" ? display.json : `${display.kind} value`) : describeValue(local.value);
    }
  } else if (cardId && cardId !== nodeId) {
    title = cardTitle || `@${name}`;
    const published = kernelFor(cardId).names();
    body = published.length ? published.slice(0, 12).join(", ") : "Not run yet";
  }

  return (
    <div className={cn("folio-at-tip", above && "is-above")} style={{ left: x, top: y }} role="tooltip">
      <p>{title}</p>
      {image ? <img src={image} alt="" /> : <pre>{body}</pre>}
    </div>
  );
}
