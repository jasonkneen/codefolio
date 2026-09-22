import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { NotebookDocument } from "@/components/notebook/notebook-document";
import type { FolioNode } from "@/lib/notebook/types";

export function NotebookNode({ id, selected }: NodeProps<FolioNode>) {
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={360}
        minHeight={280}
        maxWidth={860}
        lineClassName="folio-resize-line"
        handleClassName="folio-resize-handle"
      />
      <Handle type="target" position={Position.Left} className="folio-handle" />
      <article data-notebook-id={id} className={`folio-paper${selected ? " is-selected" : ""}`}>
        <NotebookDocument nodeId={id} />
      </article>
      <Handle type="source" position={Position.Right} className="folio-handle" />
    </>
  );
}
