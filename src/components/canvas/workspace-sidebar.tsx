import { useEffect, useState } from "react";
import { Layers3, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFolioUi } from "@/lib/notebook/ui";
import { createWorkspace, openWorkspace, removeWorkspace, renameWorkspace, useWorkspaceStore } from "@/lib/notebook/workspaces";

const WIDTH_KEY = "codefolio-workspace-sidebar-width";
const HIDDEN_KEY = "codefolio-workspace-sidebar-hidden";
const clamp = (width: number) => Math.max(200, Math.min(380, width));

export function WorkspaceSidebar() {
  const { workspaces, activeId } = useWorkspaceStore();
  const ask = useFolioUi(state => state.ask);
  const [width, setWidth] = useState(248);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= 200 && saved <= 380) setWidth(saved);
    setHidden(localStorage.getItem(HIDDEN_KEY) === "true" || window.matchMedia("(max-width: 720px)").matches);
  }, []);
  useEffect(() => { localStorage.setItem(WIDTH_KEY, String(width)); }, [width]);
  useEffect(() => { localStorage.setItem(HIDDEN_KEY, String(hidden)); }, [hidden]);

  const perform = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await work(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not change workspaces."); }
    finally { setBusy(false); }
  };
  const startRename = (id: string, name: string) => { setEditing(id); setDraft(name); };
  const finishRename = () => { if (editing) renameWorkspace(editing, draft); setEditing(null); };

  return <aside className={`folio-workspace-sidebar${hidden ? " is-collapsed" : ""}`} style={{ width: hidden ? 48 : width }} aria-label="Workspaces">
    <div className="folio-workspace-sidebar-head">
      {!hidden && <div><span>Library</span><h2>Workspaces</h2></div>}
      <button type="button" className="folio-workspace-icon" onClick={() => setHidden(value => !value)} aria-label={hidden ? "Show workspaces" : "Hide workspaces"} title={hidden ? "Show workspaces" : "Hide workspaces"}>{hidden ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
    </div>
    {hidden && <div className="folio-workspace-rail">
      {workspaces.map(workspace => <button key={workspace.id} type="button" className={`folio-workspace-icon${workspace.id === activeId ? " is-active" : ""}`} aria-label={`Open ${workspace.name}`} aria-current={workspace.id === activeId ? "page" : undefined} title={workspace.name} disabled={busy} onClick={() => void perform(() => openWorkspace(workspace.id))}><Layers3 aria-hidden="true" /></button>)}
    </div>}
    {!hidden && <>
      <div className="folio-workspace-list">
        {workspaces.map(workspace => <div key={workspace.id} className={`folio-workspace-row${workspace.id === activeId ? " is-active" : ""}`}>
          {editing === workspace.id ? <input autoFocus aria-label="Workspace name" maxLength={80} value={draft} onChange={event => setDraft(event.target.value)} onBlur={finishRename} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setEditing(null); } }} /> : <button type="button" className="folio-workspace-choice" aria-current={workspace.id === activeId ? "page" : undefined} disabled={busy} onClick={() => void perform(async () => { await openWorkspace(workspace.id); if (window.matchMedia("(max-width: 720px)").matches) setHidden(true); })}><Layers3 aria-hidden="true" /><span>{workspace.name}</span></button>}
          <button type="button" className="folio-workspace-icon" aria-label={`Rename ${workspace.name}`} title="Rename" onClick={() => startRename(workspace.id, workspace.name)}><Pencil /></button>
          {workspaces.length > 1 && <button type="button" className="folio-workspace-icon" aria-label={`Delete ${workspace.name}`} title="Delete workspace" onClick={() => ask({ title: "Delete workspace", body: `Delete “${workspace.name}” and its canvas from this browser? This cannot be undone.`, confirmLabel: "Delete workspace", danger: true, onConfirm: () => void perform(() => removeWorkspace(workspace.id)) })}><Trash2 /></button>}
        </div>)}
      </div>
      <button type="button" className="folio-workspace-add" disabled={busy} onClick={() => void perform(createWorkspace)}><Plus aria-hidden="true" /> New workspace</button>
      <p className="folio-workspace-foot">Each workspace has its own canvas, saved in this browser.</p>
    </>}
    {!hidden && <div className="folio-workspace-resize" role="separator" aria-label="Resize workspace column" aria-orientation="vertical" aria-valuemin={200} aria-valuemax={380} aria-valuenow={width} tabIndex={0} onPointerDown={event => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const start = event.clientX;
      const initial = width;
      const move = (next: PointerEvent) => setWidth(clamp(initial + next.clientX - start));
      const end = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end, { once: true });
      handle.addEventListener("pointercancel", end, { once: true });
    }} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setWidth(value => clamp(value + (event.key === "ArrowRight" ? 16 : -16))); } }} />}
  </aside>;
}
