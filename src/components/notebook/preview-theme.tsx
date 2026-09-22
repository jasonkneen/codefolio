import { Sun, Moon } from "lucide-react";
import { useFolioStore } from "@/lib/notebook/store";
import type { Cell } from "@/lib/notebook/types";

export function PreviewTheme({ nodeId, cell }: { nodeId: string; cell: Cell }) {
  return <div className="folio-panel-theme" role="group" aria-label="Preview theme">
    {(["light", "dark"] as const).map(theme => <button type="button" key={theme}
      aria-label={`Preview: ${theme}`} title={`Preview: ${theme}`}
      aria-pressed={(cell.previewTheme ?? cell.codeTheme ?? "light") === theme}
      onClick={() => useFolioStore.getState().setPanelTheme(nodeId, cell.id, "previewTheme", theme)}
    >{theme === "light" ? <Sun size={12} aria-hidden="true" /> : <Moon size={12} aria-hidden="true" />}</button>)}
  </div>;
}
