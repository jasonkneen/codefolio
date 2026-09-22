import { FilePlus2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFolioStore } from "@/lib/notebook/store";
import { useFolioUi } from "@/lib/notebook/ui";

export function EmptyDesk() {
  const addNotebook = useFolioStore((s) => s.addNotebook);
  const resetToStarters = useFolioStore((s) => s.resetToStarters);
  const ask = useFolioUi((s) => s.ask);

  return (
    <div className="folio-empty">
      <div className="folio-empty-card">
        <h2>The desk is empty</h2>
        <p>Drop a notebook to start writing, or put the starter pages back.</p>
        <div className="folio-empty-actions">
          <Button type="button" onClick={() => addNotebook()}>
            <FilePlus2 />
            New notebook
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              ask({
                title: "Restore starter pages",
                body: "Put the original notebooks back on the desk?",
                confirmLabel: "Restore",
                onConfirm: () => resetToStarters(),
              })
            }
          >
            <RotateCcw />
            Restore starters
          </Button>
        </div>
      </div>
    </div>
  );
}
