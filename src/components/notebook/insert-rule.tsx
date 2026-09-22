import { CodeXml, ImagePlus, Type } from "lucide-react";
import type { CellKind } from "@/lib/notebook/types";

export function InsertRule({ onInsert }: { onInsert: (kind: CellKind) => void }) {
  return (
    <div className="folio-insert">
      <div className="folio-insert-line" />
      <div className="folio-insert-actions">
        <button type="button" onClick={() => onInsert("markdown")} title="Add note">
          <Type />
          <span>Note</span>
        </button>
        <button type="button" onClick={() => onInsert("image")} title="Add image">
          <ImagePlus /><span>Image</span>
        </button>
        <button type="button" onClick={() => onInsert("code")} title="Add code cell">
          <CodeXml />
          <span>Code</span>
        </button>
        <button type="button" onClick={() => onInsert("artifact")} title="Add interactive artifact"><CodeXml /><span>Artifact</span></button>
      </div>
      <div className="folio-insert-line" />
    </div>
  );
}
