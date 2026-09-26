import { create } from "zustand";
import { deskStorage, useSaveStatus } from "./persistence";
import { useFolioStore } from "./store";

export type Workspace = { id: string; name: string };
type WorkspaceIndex = { activeId: string; workspaces: Workspace[] };
const INDEX_KEY = "codefolio-workspaces-v1";
const DEFAULT: WorkspaceIndex = { activeId: "current", workspaces: [{ id: "current", name: "My workspace" }] };

export function parseWorkspaceIndex(value: unknown): WorkspaceIndex {
  if (!value || typeof value !== "object") return DEFAULT;
  const raw = value as Partial<WorkspaceIndex>;
  if (!Array.isArray(raw.workspaces) || raw.workspaces.length < 1 || raw.workspaces.length > 50) return DEFAULT;
  const workspaces = raw.workspaces.filter((item): item is Workspace =>
    Boolean(item && typeof item.id === "string" && /^(?:current|[0-9a-f-]{36})$/.test(item.id) && typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 80),
  );
  if (workspaces.length !== raw.workspaces.length || new Set(workspaces.map(item => item.id)).size !== workspaces.length) return DEFAULT;
  return { workspaces, activeId: workspaces.some(item => item.id === raw.activeId) ? raw.activeId! : workspaces[0].id };
}

function readIndex(): WorkspaceIndex {
  try { return parseWorkspaceIndex(JSON.parse(localStorage.getItem(INDEX_KEY) ?? "null")); }
  catch { return DEFAULT; }
}

export function mergeWorkspaceIndex(incoming: WorkspaceIndex, stored: WorkspaceIndex, removedId?: string): WorkspaceIndex {
  const workspaces = [...incoming.workspaces, ...stored.workspaces.filter(item => item.id !== removedId && !incoming.workspaces.some(next => next.id === item.id))];
  if (workspaces.length > 50) throw Error("This browser can hold at most 50 workspaces.");
  return { ...incoming, workspaces };
}
function saveIndex(index: WorkspaceIndex, removedId?: string) {
  const merged = mergeWorkspaceIndex(index, readIndex(), removedId);
  localStorage.setItem(INDEX_KEY, JSON.stringify(merged));
  useWorkspaceStore.setState(merged);
}
function currentIndex(): WorkspaceIndex {
  return { ...readIndex(), activeId: useWorkspaceStore.getState().activeId };
}

export const useWorkspaceStore = create<WorkspaceIndex>(() => DEFAULT);

export function loadWorkspaces() {
  const index = readIndex();
  deskStorage.setInitialKey(index.activeId);
  useWorkspaceStore.setState(index);
}

async function activate(index: WorkspaceIndex) {
  if (useSaveStatus.getState().state === "error") throw Error("Save or export your current workspace before switching.");
  // Disconnect before clearing the local store, so a workspace switch never deletes a shared room.
  const { leaveRoom } = await import("../collaboration/client");
  leaveRoom();
  await deskStorage.selectKey(index.activeId);
  useFolioStore.setState({ nodes: [], edges: [], focusedNodeId: null, hydrated: false });
  saveIndex(index);
  await useFolioStore.persist.rehydrate();
}

export async function openWorkspace(id: string) {
  const index = currentIndex();
  if (id === index.activeId) return;
  if (!index.workspaces.some(item => item.id === id)) throw Error("Workspace not found.");
  await activate({ ...index, activeId: id });
}

export async function createWorkspace() {
  const index = currentIndex();
  if (index.workspaces.length >= 50) throw Error("This browser can hold at most 50 workspaces.");
  const workspace = { id: crypto.randomUUID(), name: `Workspace ${index.workspaces.length + 1}` };
  await activate({ activeId: workspace.id, workspaces: [...index.workspaces, workspace] });
  return workspace.id;
}

export function renameWorkspace(id: string, name: string) {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return;
  const index = currentIndex();
  saveIndex({ ...index, workspaces: index.workspaces.map(item => item.id === id ? { ...item, name: trimmed } : item) });
}

export async function removeWorkspace(id: string) {
  const index = currentIndex();
  if (index.workspaces.length <= 1) throw Error("Keep at least one workspace.");
  if (!index.workspaces.some(item => item.id === id)) return;
  if (id === index.activeId) await openWorkspace(index.workspaces.find(item => item.id !== id)!.id);
  await deskStorage.deleteKey(id);
  const current = currentIndex();
  saveIndex({ ...current, workspaces: current.workspaces.filter(item => item.id !== id) }, id);
}
