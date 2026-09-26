import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { Copy, LogOut, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFolioStore } from "@/lib/notebook/store";
import { createWorkspace, renameWorkspace } from "@/lib/notebook/workspaces";
import { deskDocument } from "@/lib/collaboration/document";
import { connectRoom, publishRoom, setDisplayName, leaveRoom, parseRoomLink, shareUrl, useCollaboration, type RoomLink } from "@/lib/collaboration/client";
import { serviceUrl } from "@/lib/ai/client";
import { useProductPanels } from "@/lib/ai/ui";

function encode(bytes: Uint8Array): string { let text = ""; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(text); }
export function SharingPanel() {
  const open = useProductPanels(s => s.sharing); const hydrated = useFolioStore(s => s.hydrated);
  const { link, shared, status, peers, error: connectionError } = useCollaboration();
  const [name, setName] = useState("Guest"); const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const checked = useRef(false);
  useEffect(() => { setName(localStorage.getItem("codefolio-peer-name") || "Guest"); }, []);
  useEffect(() => {
    if (!hydrated || checked.current) return; checked.current = true;
    if (parseRoomLink(location.href)) { setUrl(location.href); useProductPanels.setState({ sharing: true }); }
  }, [hydrated]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) useProductPanels.setState({ sharing: false }); };
    window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape);
  }, [open, busy]);
  const enter = async (room: RoomLink, initial?: ReturnType<typeof useFolioStore.getState>["nodes"]) => {
    const edges = initial ? structuredClone(useFolioStore.getState().edges) : [];
    const id = await createWorkspace(); renameWorkspace(id, `Shared desk ${room.room.slice(0, 6)}`);
    useFolioStore.getState().replaceDesk(initial ?? [], edges);
    localStorage.setItem("codefolio-peer-name", name.trim() || "Guest"); await connectRoom(room, name, true);
    history.replaceState(null, "", shareUrl(room));
  };
  const create = async () => {
    if (link) { setDisplayName(name); publishRoom(); return; }
    setBusy(true); setError(""); const nodes = structuredClone(useFolioStore.getState().nodes); const edges = structuredClone(useFolioStore.getState().edges);
    const doc = deskDocument({ nodes, edges });
    try {
      const state = encode(Y.encodeStateAsUpdate(doc));
      const response = await fetch(serviceUrl("/api/rooms"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) });
      const body = await response.json(); if (!response.ok) throw Error(body.error || "Could not create a shared desk.");
      const room = parseRoomLink(`${location.origin}/#share=${encodeURIComponent(JSON.stringify(body))}`); if (!room) throw Error("The service returned an invalid room link.");
      await enter(room, nodes);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not create a shared desk."); }
    finally { doc.destroy(); setBusy(false); }
  };
  const join = async () => {
    const room = parseRoomLink(url); if (!room) { setError("Paste a complete Codefolio invitation link."); return; }
    setBusy(true); setError("");
    try { await enter(room); } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not join this desk."); }
    finally { setBusy(false); }
  };
  if (!open) return null;
  return <aside className="folio-sharing" aria-label="Share desk"><div className="folio-panel-heading"><div><p className="folio-help-kicker">Codefolio</p><h2>Share this desk</h2></div><Button variant="ghost" size="icon" disabled={busy} aria-label="Close sharing" onClick={() => useProductPanels.setState({ sharing: false })}><X /></Button></div>
    <div className="folio-sharing-content">
      <label>Your display name<input value={name} maxLength={80} onChange={e => { setName(e.target.value); setDisplayName(e.target.value); }} /></label>
      {link && shared ? <><p className="folio-share-status" role="status"><Users />{status === "connected" ? `${peers.length + 1} ${peers.length ? "people" : "person"} connected` : status === "error" ? "Sharing needs attention" : "Connecting to shared desk…"}</p><p>Everyone with this link can edit this shared desk. Notebook code runs separately on each person’s device.</p><label>Invitation link<input readOnly value={shareUrl(link)} onFocus={e => e.target.select()} /></label><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(shareUrl(link)).then(() => toast("Invitation copied"), () => toast.error("Select and copy the invitation link.")); }}><Copy />Copy invitation</Button><div className="folio-peer-list"><p>You · {name}</p>{peers.map(peer => <p key={peer.id}><span style={{ background: peer.color }} />{peer.name}{peer.nodeId ? ` · ${useFolioStore.getState().nodes.find(n => n.id === peer.nodeId)?.data.title || "Notebook"}` : " · Desk"}</p>)}</div><Button variant="ghost" onClick={() => { leaveRoom(); history.replaceState(null, "", `${location.pathname}${location.search}`); toast("Disconnected. A local copy remains in this workspace."); }}><LogOut />Leave shared desk</Button></> : <>
        <p>Share this remotely saved workspace, or join an invitation in a separate workspace. Without remote storage, sharing creates a remote copy.</p>
        
        <Button disabled={busy || !name.trim()} onClick={() => { void create(); }}><Users />{busy ? "Preparing shared desk…" : link ? "Create invitation" : "Create shared desk"}</Button>
        <div className="folio-sharing-join"><label>Invitation link<input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a Codefolio invitation" /></label><Button variant="outline" disabled={busy || !url.trim() || !name.trim()} onClick={() => { void join(); }}>Join shared desk</Button></div>
      </>}
      {(error || connectionError) && <p role="alert" className="folio-assistant-error">{error || connectionError}</p>}
    </div></aside>;
}
