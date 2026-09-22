import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { FolioChrome } from "@/components/canvas/folio-chrome";
import { Button } from "@/components/ui/button";
import { useFolioStore } from "@/lib/notebook/store";
import { NotebookDocument } from "./notebook-document";

export function FullNotebook({ nodeId }: { nodeId: string }) {
  const nodes = useFolioStore((s) => s.nodes);
  const setFocused = useFolioStore((s) => s.setFocused);
  const back = useRef<HTMLButtonElement>(null);
  const initialNodeId = useRef(nodeId);
  useEffect(() => {
    back.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if ((event.target as HTMLElement)?.closest('input, textarea, [contenteditable="true"]')) return;
      setFocused(null);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.folio-desk-layer [data-notebook-id="${CSS.escape(initialNodeId.current)}"] [aria-label="Open full view"]`)?.focus()); };
  }, [setFocused]);
  return <div className="folio-full-view">
    <FolioChrome />
    <div className="folio-full-layout">
    <nav className="folio-full-nav" aria-label="Notebooks">
      <Button ref={back} variant="desk" onClick={() => setFocused(null)}><ArrowLeft />Back to desk</Button>
      <div className="folio-page-list">
        {nodes.map((node, index) => <button
          key={node.id}
          type="button"
          className="folio-page-choice"
          aria-current={node.id === nodeId ? "page" : undefined}
          aria-label={`Open ${node.data.title || "Untitled notebook"}`}
          onClick={() => setFocused(node.id)}
        >
          <span className="folio-page-preview" aria-hidden="true">
            <span className="folio-page-preview-title">{node.data.title || "Untitled notebook"}</span>
            {node.data.cells.slice(0, 5).map(cell => <span key={cell.id} className={`folio-page-preview-cell is-${cell.kind}`}>
              {cell.kind === "video" ? "Video" : cell.kind === "image" ? "Image" : cell.kind === "artifact" ? "Interactive artifact" : cell.source.slice(0, 220) || "Empty cell"}
            </span>)}
          </span>
          <span className="folio-page-caption"><span>{index + 1}</span><span>{node.data.title || "Untitled notebook"}</span></span>
        </button>)}
      </div>
    </nav>
    <div className="folio-full-scroll" key={nodeId}>
      <article className="folio-paper folio-full-paper" aria-label="Full notebook" data-notebook-id={nodeId}>
        <NotebookDocument nodeId={nodeId} fullView />
      </article>
    </div>
    </div>
  </div>;
}
