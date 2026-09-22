import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Cell } from "@/lib/notebook/types";
import { cn } from "@/lib/utils";
import { NotebookEditor } from "./lazy-editor";

type Props = {
  cell: Cell;
  editing: boolean;
  onChange: (source: string) => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
};


export function MarkdownCell({ cell, editing, onChange, onStartEdit, onStopEdit }: Props) {
  if (editing) {
    return (
      <div className="folio-md-edit nodrag nowheel nopan">
        <NotebookEditor value={cell.source} onChange={onChange} language="markdown" label="Markdown source" autoFocus onBlur={onStopEdit} onRun={onStopEdit} placeholder="Write a note in Markdown" />
      </div>
    );
  }

  const empty = cell.source.trim().length === 0;

  return (
    <div
      className={cn("folio-md-view", empty && "is-empty")}
      onClick={onStartEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) onStartEdit();
      }}
      role="textbox"
      tabIndex={0}
      aria-label="Markdown note"
    >
      {empty ? (
        <p className="folio-placeholder">Write a note</p>
      ) : (
        <div className="folio-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{cell.source}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
