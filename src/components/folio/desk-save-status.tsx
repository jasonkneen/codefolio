import { useFolioUi } from "@/lib/notebook/ui";
import { downloadDesk, serializeDesk } from "@/lib/notebook/io";
import { useEffect } from "react";
import { deskStorage, useSaveStatus } from "@/lib/notebook/persistence";
import { useFolioStore } from "@/lib/notebook/store";

export function DeskSaveStatus() {
  const ask = useFolioUi((s) => s.ask);
  const { state, message, recoveryAvailable, conflict } = useSaveStatus();
  useEffect(() => {
    const flush = () => { void deskStorage.flush(); };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    const unload = (event: BeforeUnloadEvent) => {
      if (!deskStorage.hasUnsavedChanges()) return;
      flush(); event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  if (state === "saved") return null;
  if (state !== "error") return <span className="folio-save-state" role="status" aria-live="off">{message}</span>;
  return <div className="folio-save-error" role="alert">
    <span>{message}</span>
    {conflict ? <>
      <button type="button" onClick={() => { const { nodes, edges } = useFolioStore.getState(); downloadDesk(serializeDesk(nodes, edges)); }}>Export my edits</button>
      <button type="button" onClick={() => ask({ title: "Keep this tab’s version?", body: "This replaces the saved desk with the edits in this tab. The other tab will need to reload or resolve its own conflict.", confirmLabel: "Save my version", onConfirm: () => { deskStorage.allowReplacement(); void deskStorage.flush(); } })}>Save my version</button>
      <button type="button" onClick={() => ask({ title: "Load the saved version?", body: "This discards this tab’s unsaved edits. Export them first if you want to keep a copy.", confirmLabel: "Load saved version", danger: true, onConfirm: () => {
        deskStorage.discardChanges();
        const store = useFolioStore.getState();
        for (const node of store.nodes) store.restart(node.id);
        store.setFocused(null);
        void useFolioStore.persist.rehydrate();
      } })}>Load saved version</button>
    </> : <button type="button" onClick={() => {
      if (deskStorage.hasUnsavedChanges()) void deskStorage.flush();
      else void useFolioStore.persist.rehydrate();
    }}>Retry</button>}
    {recoveryAvailable && <button type="button" onClick={() => {
      const data = deskStorage.recoveryText();
      if (!data) return;
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "codefolio-storage-recovery.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Download stored copy</button>}
  </div>;
}
