import { useMediaDrop } from "@/components/notebook/use-media-drop";
import { FolioChrome } from "@/components/canvas/folio-chrome";
import { EmptyDesk } from "@/components/folio/empty-desk";
import { NotebookDocument } from "@/components/notebook/notebook-document";
import { useFolioStore } from "@/lib/notebook/store";

export function DeskStack() {
  const mediaDrop = useMediaDrop();
  const nodes = useFolioStore((s) => s.nodes);

  return (
    <div className="folio-canvas-drop" {...mediaDrop}>
      <FolioChrome />
      {nodes.length === 0 ? (
        <EmptyDesk />
      ) : (
        <div className="folio-stack">
          {nodes.map((node) => (
            <article key={node.id} className={`folio-paper folio-stack-paper${node.selected ? " is-selected" : ""}`} data-notebook-id={node.id}>
              <NotebookDocument nodeId={node.id} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
