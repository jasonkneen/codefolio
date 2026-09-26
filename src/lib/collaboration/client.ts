import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { create } from "zustand";
import { applySharedDesk, useFolioStore } from "../notebook/store";
import { useWorkspaceStore } from "../notebook/workspaces";
import { serviceUrl } from "../ai/client";
import { deskStorage } from "../notebook/persistence";
import { persistDocument } from "./local-document";
import { LOCAL_EDIT, readDesk, writeDesk } from "./document";

export type RoomLink = { room: string; token: string };
export type Peer = { id: number; name: string; nodeId?: string; color: string;
  agent?: { nodeId: string; cellId?: string; name: string; action: string };
  pointer?: { nodeId: string; x: number; y: number };
  selection?: { nodeId: string; cellId: string; anchor: unknown; head: unknown };
};
export const useCollaboration = create<{ link: RoomLink | null; status: "offline" | "connecting" | "connected" | "error"; ready: boolean; shared: boolean; peers: Peer[]; error: string | null }>(() => ({ link: null, status: "offline", ready: false, shared: false, peers: [], error: null }));
let presence: ((field: string, value: unknown) => void) | undefined;
let activeDocument: Y.Doc | undefined;
export function updatePresence(field: string, value: unknown) { presence?.(field, value); }
export function cellText(nodeId: string, cellId: string): Y.Text | undefined {
  const node = activeDocument?.getMap<Y.Map<unknown>>("nodes").get(nodeId);
  return (node?.get("cells") as Y.Map<Y.Map<unknown>> | undefined)?.get(cellId)?.get("source") as Y.Text | undefined;
}
let generation = 0;
let disconnect: (() => void) | undefined;
export function leaveRoom() {
  generation++; renamePresence = undefined; presence = undefined; activeDocument = undefined;
  const joined = useCollaboration.getState().link;
  disconnect?.(); disconnect = undefined;
  useCollaboration.setState({ link: null, status: "offline", ready: false, shared: false, peers: [], error: null });
  if (joined && typeof location !== "undefined") {
    const hash = new URLSearchParams(location.hash.slice(1)); hash.delete("share");
    history.replaceState(null, "", `${location.pathname}${location.search}${hash.size ? `#${hash}` : ""}`);
  }
}
export function shareUrl(link: RoomLink): string { const url = new URL(location.href); url.hash = `share=${encodeURIComponent(JSON.stringify(link))}`; return url.href; }
export function parseRoomLink(value: string): RoomLink | undefined {
  try {
    const url = new URL(value); const raw = new URLSearchParams(url.hash.slice(1)).get("share"); if (!raw) return;
    const link = JSON.parse(raw);
    if (/^[a-f0-9]{32}$/.test(link.room) && /^[a-f0-9]{64}$/.test(link.token)) return { room: link.room, token: link.token };
  } catch { return; }
}
export function publishRoom() {
  const link = useCollaboration.getState().link;
  if (link) { localStorage.setItem(`codefolio-published:${serviceUrl("/sync")}:${link.room}`, "true"); useCollaboration.setState({ shared: true }); }
}
let renamePresence: ((name: string) => void) | undefined;
export function setDisplayName(name: string) { localStorage.setItem("codefolio-peer-name", name); renamePresence?.(name); }
export async function connectRoom(link: RoomLink, name: string, shared = false) {
  leaveRoom();
  const ticket = generation;
  const doc = new Y.Doc();
  const workspaceId = useWorkspaceStore.getState().activeId;
  const urlKey = serviceUrl("/sync");
  const persistence = await persistDocument(doc, `${urlKey}:${link.room}`);
  if (ticket !== generation) { persistence.stop(); doc.destroy(); return; }

  const url = new URL(serviceUrl("/sync"), location.href); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const provider = new WebsocketProvider(url.href, link.room, doc, { params: { token: link.token }, disableBc: true });
  let applying = false; let ready = persistence.loaded;
  let previous = { nodes: useFolioStore.getState().nodes, edges: useFolioStore.getState().edges };
  useCollaboration.setState({ link, status: "connecting", ready: false, error: null });
  if (shared && typeof localStorage !== "undefined") localStorage.setItem(`codefolio-published:${urlKey}:${link.room}`, "true");
  useCollaboration.setState({ shared: shared || (typeof localStorage !== "undefined" && localStorage.getItem(`codefolio-published:${urlKey}:${link.room}`) === "true") });
  if (typeof localStorage !== "undefined") localStorage.setItem(`codefolio-remote:${urlKey}:${workspaceId}`, JSON.stringify(link));
  const receive = (_update?: Uint8Array, origin?: unknown) => {
    if (!ready || origin === LOCAL_EDIT) return;
    try {
      deskStorage.useRemoteMirror();
      applying = true; applySharedDesk(readDesk(doc));
      previous = { nodes: useFolioStore.getState().nodes, edges: useFolioStore.getState().edges };
      return true;
    } catch (error) { useCollaboration.setState({ status: "error", error: error instanceof Error ? error.message : "Invalid shared document." }); }
    finally { applying = false; }
  };
  if (ready && receive()) useCollaboration.setState({ ready: true });
  const sync = (synced: boolean) => { if (!synced) return; ready = true; if (receive()) useCollaboration.setState({ status: "connected", ready: true, error: null }); else ready = false; };
  const status = ({ status }: { status: string }) => useCollaboration.setState({ status: status === "connected" && ready ? "connected" : "connecting" });
  const peers = () => {
    const values: Peer[] = [];
    for (const [id, state] of provider.awareness.getStates()) {
      if (id === doc.clientID || typeof state.user?.name !== "string") continue;
      const pointer = state.pointer && typeof state.pointer.nodeId === "string" && Number.isFinite(state.pointer.x) && Number.isFinite(state.pointer.y) && state.pointer.x >= 0 && state.pointer.x <= 1 && state.pointer.y >= 0 && state.pointer.y <= 1 ? state.pointer : undefined;
      const selection = state.selection && typeof state.selection.nodeId === "string" && typeof state.selection.cellId === "string" ? state.selection : undefined;
      const agent = state.agent && typeof state.agent.nodeId === "string" && typeof state.agent.name === "string" && typeof state.agent.action === "string" ? { ...state.agent, name: state.agent.name.slice(0, 80), action: state.agent.action.slice(0, 80) } : undefined;
      values.push({ id, pointer, selection, agent, name: state.user.name.slice(0, 80), nodeId: typeof state.nodeId === "string" ? state.nodeId : undefined, color: /^#[a-f0-9]{6}$/i.test(state.user.color) ? state.user.color : "#3f5d51" });
    }
    useCollaboration.setState({ peers: values });
  };
  const error = () => useCollaboration.setState({ status: "error", error: "Connection failed. Check the room link and service availability." });
  let offlinePresence: Record<string, any> | null = null;
  activeDocument = doc; presence = (field, value) => {
    const next = { ...(provider.awareness.getLocalState() || offlinePresence || {}), [field]: value };
    offlinePresence = next;
    if (typeof navigator === "undefined" || navigator.onLine !== false) provider.awareness.setLocalState(next);
  };
  provider.awareness.setLocalState({ user: { name: name.trim().slice(0, 80) || "Guest", color: ["#3f5d51", "#8f3d32", "#675784", "#386e8b"][doc.clientID % 4] }, nodeId: useFolioStore.getState().focusedNodeId });
  renamePresence = next => presence?.("user", { ...(provider.awareness.getLocalState() || offlinePresence)?.user, name: next.trim().slice(0, 80) || "Guest" });
  const offline = () => { offlinePresence = provider.awareness.getLocalState() || offlinePresence; provider.disconnect(); status({ status: "disconnected" }); };
  const online = () => { if (offlinePresence) provider.awareness.setLocalState(offlinePresence); provider.connect(); };
  if (typeof window !== "undefined") { window.addEventListener("offline", offline); window.addEventListener("online", online); if (!navigator.onLine) offline(); }
  doc.on("update", receive); provider.on("sync", sync); provider.on("status", status); provider.on("connection-error", error); provider.awareness.on("change", peers);
  const unsubscribe = useFolioStore.subscribe((state, before) => {
    if (state.focusedNodeId !== before.focusedNodeId) presence?.("nodeId", state.focusedNodeId);
    if (applying || !ready) return;
    const next = { nodes: state.nodes, edges: state.edges };
    if (next.nodes === previous.nodes && next.edges === previous.edges) return;
    writeDesk(doc, next, previous); previous = next;
  });
  const unsubscribeWorkspace = useWorkspaceStore.subscribe(state => { if (state.activeId !== workspaceId) leaveRoom(); });
  disconnect = () => { if (typeof window !== "undefined") { window.removeEventListener("offline", offline); window.removeEventListener("online", online); } unsubscribe(); unsubscribeWorkspace(); doc.off("update", receive); provider.off("sync", sync); provider.off("status", status); provider.off("connection-error", error); provider.awareness.off("change", peers); provider.destroy(); persistence.stop(); doc.destroy(); };
}

if (import.meta.hot) import.meta.hot.dispose(() => leaveRoom());
