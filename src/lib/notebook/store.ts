import { bindReferences, normalizeCells, passiveValues, prepareCellSource, referenceTarget, refreshReferenceLabels, markDependents, validCellName } from "./cell-references";
import { SandboxKernel, disposeSandboxRuntime } from "./sandbox-kernel";
import { ARTIFACT_TEMPLATES } from "@/lib/artifacts/templates";
import { deskStorage } from "./persistence";
import type { NotebookImage } from "./images";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { uid } from "@/lib/utils";
import { downstreamOf, isRef, replaceRef, slugRef, uniqueRef } from "./refs";
import { isReservedRef, NotebookKernel, topLevelNames } from "./runtime";
import { blankNotebook, starterNodes } from "./starters";
import type { ArtifactInput, CellReference, Cell, CellKind, FolioEdge, FolioNode, NotebookData } from "./types";

type Kernel = NotebookKernel | SandboxKernel;
const kernels = new Map<string, Kernel>();
const inflight = new Map<string, Promise<void>>();
const waiting = new Map<string, Set<string>>();

export function kernelFor(nodeId: string): Kernel {
  let k = kernels.get(nodeId);
  if (!k) {
    k = typeof window === "undefined" ? new NotebookKernel() : new SandboxKernel();
    kernels.set(nodeId, k);
  }
  return k;
}

function invalidateKernel(nodeId: string) {
  kernels.get(nodeId)?.reset();
  kernels.delete(nodeId);
  inflight.delete(nodeId);
  waiting.delete(nodeId);
}

function clearKernels() {
  disposeSandboxRuntime();
  for (const kernel of kernels.values()) kernel.reset();
  waiting.clear();
  kernels.clear();
  inflight.clear();
}

function withFreshRef(node: FolioNode, existing: FolioNode[]): FolioNode {
  const taken = new Set(existing.map((item) => item.data.ref).filter(Boolean));
  const ref = uniqueRef(node.data.ref || "untitled", taken);
  return { ...node, data: { ...node.data, ref } };
}

function ownsKernel(nodeId: string, kernel: Kernel) {
  return kernels.get(nodeId) === kernel && useFolioStore.getState().nodes.some(node => node.id === nodeId);
}

async function enqueue(nodeId: string, work: (kernel: Kernel, current: () => boolean) => Promise<void>) {
  if (!useFolioStore.getState().nodes.some(node => node.id === nodeId)) return;
  const kernel = kernelFor(nodeId);
  const previous = inflight.get(nodeId);
  const current = () => ownsKernel(nodeId, kernel);
  const task = (async () => {
    // Yield even for the first run so the queue is registered before imports start.
    await previous?.catch(() => {});
    if (current()) await work(kernel, current);
  })();
  inflight.set(nodeId, task);
  try { await task; }
  finally { if (inflight.get(nodeId) === task) inflight.delete(nodeId); }
}

function reaches(from: string, target: string, visited = new Set<string>()): boolean {
  if (from === target) return true;
  if (visited.has(from)) return false;
  visited.add(from);
  return [...(waiting.get(from) ?? [])].some(next => reaches(next, target, visited));
}

async function ensureCard(ref: string, ancestors: string[], names?: string[]): Promise<Record<string, unknown>> {
  const node = useFolioStore.getState().nodes.find(item => item.data.ref === ref);
  if (!node) throw new Error(`No card @${ref}`);
  const selected = names?.map(name => node.data.cells.find(c => c.name === name));
  // Named cells never trigger implicit execution of another notebook.
  if (selected?.length && selected.every(Boolean)) {
    for (const cell of selected) {
      if (cell!.kind === 'artifact') throw Error('Artifacts accept inputs; artifact outputs are not available yet.');
      if (cell!.kind === 'video' && !cell!.video) throw Error('Add a video first.');
      if (cell!.kind === 'image' && !cell!.image) throw Error(`Add an image to @${ref}.${cell!.name} first.`);
      if (cell!.kind === 'code' && (cell!.status !== 'ok' || cell!.stale || !kernelFor(node.id).peek(cell!.name!).found)) throw Error(`Run @${ref}.${cell!.name} first. Its result is missing or its inputs changed.`);
    }
    const values: Record<string, unknown> = structuredClone(passiveValues(selected as Cell[]));
    const kernel = kernelFor(node.id);
    if (kernel instanceof SandboxKernel) return { ...kernel.snapshot(), __folioValues: values, __folioNames: names };
    const snapshot = kernel.snapshot();
    for (const cell of selected) if (cell!.kind === 'code') {
      try { values[cell!.name!] = structuredClone(snapshot[cell!.name!]); }
      catch { throw Error('Named cell references need data values. Use a notebook import for functions.'); }
    }
    return values;
  }
  const caller = ancestors.at(-1)!;
  if (ancestors.includes(node.id) || reaches(node.id, caller)) throw new Error(`@${ref} is part of an import loop`);
  const dependencies = waiting.get(caller) ?? new Set<string>();
  waiting.set(caller, dependencies);
  dependencies.add(node.id);
  const kernel = kernelFor(node.id);
  try {
    const pending = inflight.get(node.id);
    if (pending) await pending;
    else if (!kernel.hasRun()) await runNotebook(node.id, ancestors);
    if (!ownsKernel(node.id, kernel)) throw new Error(`@${ref} was restarted or removed`);
    if (!kernel.hasRun()) throw new Error(`@${ref} did not finish successfully`);
    return kernel instanceof SandboxKernel ? { ...kernel.snapshot(), __folioValues: passiveValues(node.data.cells) } : { ...kernel.snapshot(), ...passiveValues(node.data.cells) };
  } finally {
    dependencies.delete(node.id);
    if (!dependencies.size && waiting.get(caller) === dependencies) waiting.delete(caller);
  }
}

async function executeCell(nodeId: string, cell: Cell, kernel: Kernel, current: () => boolean, ancestors: string[]) {
  if (!current()) return false;
  cell = { ...cell, references: bindReferences(cell.source, useFolioStore.getState().nodes, cell.references) };
  useFolioStore.setState({ nodes: patchCell(useFolioStore.getState().nodes, nodeId, cell.id, { status: "running", references: cell.references }) });
  const dependencies = Object.values(cell.references ?? {}).map(ref => ({ ref, cell: referenceTarget(useFolioStore.getState().nodes, ref)?.cell }));
  let source: string;
  try { source = prepareCellSource(cell, useFolioStore.getState().nodes); }
  catch (error) {
    useFolioStore.setState({ nodes: patchCell(useFolioStore.getState().nodes, nodeId, cell.id, { status: 'error', output: { logs: [], displays: [{ kind: 'error', message: error instanceof Error ? error.message : String(error) }] } }) });
    return false;
  }
  const output = await kernel.run(source, async (ref, names) => {
    if (!current()) throw new Error("Execution cancelled");
    const value = await ensureCard(ref, [...ancestors, nodeId], names);
    if (!current()) throw new Error("Execution cancelled");
    return value;
  }, { resultName: cell.name, values: passiveValues(useFolioStore.getState().nodes.find(n => n.id === nodeId)?.data.cells ?? []) });
  if (!current()) return false;
  const latest = useFolioStore.getState().nodes.find(n => n.id === nodeId)?.data.cells.find(c => c.id === cell.id);
  if (!latest || latest.source !== cell.source) return false;
  if (dependencies.some(d => referenceTarget(useFolioStore.getState().nodes, d.ref)?.cell !== d.cell)) {
    useFolioStore.setState({ nodes: patchCell(useFolioStore.getState().nodes, nodeId, cell.id, { status: 'idle', stale: true }) });
    return false;
  }
  const status = output.displays.some(item => item.kind === "error") ? "error" : "ok";
  useFolioStore.setState({ nodes: patchCell(markDependents(useFolioStore.getState().nodes, [{ nodeId, cellId: cell.id }]), nodeId, cell.id, { output, status, stale: false }) });
  return status === "ok";
}

async function runNotebook(nodeId: string, ancestors: string[], cascade = false, chain: string[] = [], valid = () => true): Promise<void> {
  if (ancestors.includes(nodeId)) throw new Error("These cards import each other.");
  if (chain.includes(nodeId) || !valid()) return;
  let completed = false;
  let owner: Kernel | undefined;
  await enqueue(nodeId, async (kernel, current) => {
    owner = kernel;
    if (!valid()) return;
    kernel.reset();
    const cells = useFolioStore.getState().nodes.find(n => n.id === nodeId)?.data.cells ?? [];
    for (const cell of cells) {
      if (!current() || !valid()) return;
      if (cell.kind === "code" && !await executeCell(nodeId, cell, kernel, current, ancestors)) { kernel.unpublish(); return; }
    }
    if (current() && valid()) { kernel.markRun(); completed = true; }
  });
  const current = () => valid() && !!owner && ownsKernel(nodeId, owner);
  if (completed && cascade && current()) {
    for (const child of downstreamOf(useFolioStore.getState().edges, nodeId)) {
      if (!current()) break;
      await runNotebook(child, [], true, [...chain, nodeId], current);
    }
  }
}

function patchNode(nodes: FolioNode[], id: string, data: Partial<NotebookData>): FolioNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
}

function patchCell(nodes: FolioNode[], nodeId: string, cellId: string, patch: Partial<Cell>): FolioNode[] {
  return nodes.map((n) => {
    if (n.id !== nodeId) return n;
    return {
      ...n,
      data: {
        ...n.data,
        cells: n.data.cells.map((c) => (c.id === cellId ? { ...c, ...patch } : c)),
      },
    };
  });
}

type FolioState = {
  nodes: FolioNode[];
  edges: FolioEdge[];
  focusedNodeId: string | null;
  hydrated: boolean;
  onNodesChange: (changes: NodeChange<FolioNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FolioEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addMediaCells: (cells: Cell[], nodeId?: string, position?: { x: number; y: number }) => void;
  addNotebook: (position?: { x: number; y: number }) => string;
  addSourceFiles: (files: { path: string; source: string }[]) => number;
  addLinkedNotebook: (sourceId: string) => string;
  removeNotebook: (id: string) => void;
  removeSelected: () => void;
  selectAll: () => void;
  replaceDesk: (nodes: FolioNode[], edges: FolioEdge[]) => void;
  resetToStarters: () => void;
  setTitle: (id: string, title: string) => void;
  setRef: (id: string, ref: string) => boolean;
  setCellName: (nodeId: string, cellId: string, name: string) => boolean;
  setArtifactInputs: (nodeId: string, cellId: string, inputs: ArtifactInput[]) => void;
  setPanelTheme: (nodeId: string, cellId: string, panel: "codeTheme" | "previewTheme", theme: "light" | "dark") => void;
  setArtifactNetwork: (nodeId: string, cellId: string, value: boolean) => void;
  setCellImage: (nodeId: string, cellId: string, image: NotebookImage) => void;
  setCellSource: (nodeId: string, cellId: string, source: string) => void;
  insertCell: (nodeId: string, afterId: string | null, kind: CellKind) => void;
  removeCell: (nodeId: string, cellId: string) => void;
  runCell: (nodeId: string, cellId: string) => Promise<void>;
  runAll: (nodeId: string) => Promise<void>;
  restart: (nodeId: string) => void;
  setFocused: (id: string | null) => void;
  toggleFocused: (id: string) => void;
};

// React Flow emits selection and measurement updates on mount. These are view
// state, not desk edits, and must not create a new saved revision in every tab.
let persistedDesk: Pick<FolioState, "nodes" | "edges"> | undefined;
function deskToPersist(state: FolioState) {
  const nodes = state.nodes.map(node => {
    const previous = persistedDesk?.nodes.find(item => item.id === node.id);
    if (previous && previous.data === node.data && previous.position.x === node.position.x && previous.position.y === node.position.y && previous.style?.width === node.style?.width && previous.style?.height === node.style?.height) return previous;
    return { id: node.id, type: node.type, position: node.position, style: node.style, data: node.data };
  });
  const edges = state.edges.map(edge => {
    const previous = persistedDesk?.edges.find(item => item.id === edge.id);
    if (previous && previous.source === edge.source && previous.target === edge.target && previous.type === edge.type && previous.style === edge.style) return previous;
    return { id: edge.id, source: edge.source, target: edge.target, type: edge.type, style: edge.style };
  });
  const same = <T,>(before: T[] | undefined, after: T[]) => before?.length === after.length && after.every((item, index) => item === before[index]);
  persistedDesk = { nodes: same(persistedDesk?.nodes, nodes) ? persistedDesk!.nodes : nodes, edges: same(persistedDesk?.edges, edges) ? persistedDesk!.edges : edges };
  return persistedDesk;
}

export const useFolioStore = create<FolioState>()(
  persist(
    (set, get) => ({
      nodes: normalizeCells(starterNodes()),
      edges: [],
      focusedNodeId: null,
      hydrated: false,
      onNodesChange: (changes) => {
        for (const change of changes) if (change.type === "remove") invalidateKernel(change.id);
        const removed = changes.filter(change => change.type === 'remove').flatMap(change => get().nodes.find(n => n.id === change.id)?.data.cells.map(cell => ({ nodeId: change.id, cellId: cell.id })) ?? []);
        const nodes = applyNodeChanges(changes, get().nodes);
        set({ nodes: removed.length ? markDependents(nodes, removed) : nodes });
      },
      onEdgesChange: (changes) => {
        set({ edges: applyEdgeChanges(changes, get().edges) });
      },
      onConnect: (connection) => {
        set({ edges: addEdge({ ...connection, type: "smoothstep" }, get().edges) });
      },
      addMediaCells: (cells, nodeId, position) => {
        if (nodeId) {
          const target = get().nodes.find(n => n.id === nodeId);
          if (!target) throw Error("That notebook was removed before the files finished loading.");
          if (target.data.cells.length + cells.length > 500) throw Error("This notebook is full. Drop the files onto the canvas to create another.");
          set({ nodes: normalizeCells(get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, cells: [...n.data.cells, ...cells] } } : n)) });
        } else {
          if (get().nodes.length >= 200) throw Error("This desk is full. Remove a notebook before adding another.");
          const node = withFreshRef(blankNotebook(), get().nodes);
          if (position) node.position = position;
          node.data = { ...node.data, title: "Media", cells };
          set({ nodes: normalizeCells([...get().nodes, node]) });
        }
      },
      addNotebook: (position) => {
        const node = withFreshRef(normalizeCells([blankNotebook()])[0], get().nodes);
        if (position) node.position = position;
        set({ nodes: [...get().nodes, node] });
        return node.id;
      },
      addSourceFiles: (files) => {
        if (get().nodes.length + files.filter(file => !get().nodes.some(node => node.data.sourcePath === file.path)).length > 200) throw Error("This desk is full. Remove a notebook before importing more files.");
        const paths = new Set<string>();
        const taken = new Set(get().nodes.map(node => node.data.ref));
        let added = 0;
        const next = [...get().nodes];
        for (const file of files) {
          if (paths.has(file.path)) throw Error(`Duplicate file: ${file.path}`);
          paths.add(file.path);
          if (!/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./ -]+\.(?:[cm]?[jt]sx?)$/.test(file.path) || file.path.length > 500 || file.source.length > 200_000) throw Error(`Unsupported file: ${file.path}`);
          const existing = next.find(node => node.data.sourcePath === file.path);
          if (existing) {
            const sourceCell = existing.data.cells.find(cell => cell.kind === "artifact");
            if (!sourceCell) throw Error(`${file.path} has no source cell.`);
            invalidateKernel(existing.id);
            const changed = existing.data.cells.map(cell => cell.id === sourceCell.id ? { ...cell, source: file.source, output: null, status: "idle" as const } : cell);
            const index = next.indexOf(existing);
            next[index] = { ...existing, data: { ...existing.data, cells: changed } };
            continue;
          }
          const title = file.path.split("/").at(-1)!;
          const base = blankNotebook();
          base.position = { x: 80 + (added % 3) * 580, y: 100 + Math.floor(added / 3) * 660 };
          base.data = {
            title,
            ref: uniqueRef(slugRef(title.replace(/\.[^.]+$/, "")), taken),
            sourcePath: file.path,
            cells: [
              { id: uid("cell"), kind: "markdown", source: `# ${title}\n\nSource: \`${file.path}\`\n\nDescribe what this module does and add examples here.`, output: null, status: "idle" },
              { id: uid("cell"), kind: "artifact", source: file.source, output: null, status: "idle" },
            ],
          };
          next.push(base);
          added++;
        }
        set({ nodes: normalizeCells(next) });
        return added;
      },
      addLinkedNotebook: (sourceId) => {
        const source = get().nodes.find((n) => n.id === sourceId);
        if (!source) return "";
        const node = withFreshRef(normalizeCells([blankNotebook()])[0], get().nodes);
        const sourceW = (source.style as { width?: number } | undefined)?.width ?? 480;
        const sourceH = (source.style as { height?: number } | undefined)?.height ?? 480;
        node.position = {
          x: source.position.x + sourceW + 80,
          y: source.position.y + Math.min(40, sourceH * 0.1),
        };
        const newId = node.id;
        const edge: FolioEdge = {
          id: `e-${sourceId}-${newId}`,
          source: sourceId,
          target: newId,
          type: "smoothstep",
          style: { stroke: "var(--color-muted)", strokeWidth: 1.5 },
        };
        set({
          nodes: [...get().nodes, node],
          edges: [...get().edges, edge],
        });
        return newId;
      },
      removeNotebook: (id) => {
        invalidateKernel(id);
        if (get().focusedNodeId === id) set({ focusedNodeId: null });
        set({
          nodes: markDependents(get().nodes.filter((n) => n.id !== id), get().nodes.find(n => n.id === id)?.data.cells.map(c => ({ nodeId: id, cellId: c.id })) ?? []),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        });
      },
      removeSelected: () => {
        const state = get();
        const selected = state.nodes.filter(node => node.selected);
        const ids = new Set(selected.map(node => node.id));
        const removed = selected.flatMap(node => node.data.cells.map(cell => ({ nodeId: node.id, cellId: cell.id })));
        for (const id of ids) invalidateKernel(id);
        set({
          nodes: markDependents(state.nodes.filter(node => !ids.has(node.id)), removed),
          edges: state.edges.filter(edge => !edge.selected && !ids.has(edge.source) && !ids.has(edge.target)),
          focusedNodeId: state.focusedNodeId && ids.has(state.focusedNodeId) ? null : state.focusedNodeId,
        });
      },
      selectAll: () => {
        const state = get();
        set({
          nodes: applyNodeChanges(state.nodes.map(node => ({ type: "select" as const, id: node.id, selected: true })), state.nodes),
          edges: applyEdgeChanges(state.edges.map(edge => ({ type: "select" as const, id: edge.id, selected: true })), state.edges),
        });
      },
      replaceDesk: (nodes, edges) => {
        deskStorage.allowReplacement();
        clearKernels();
        set({ nodes: normalizeCells(nodes), edges, focusedNodeId: null });
      },
      resetToStarters: () => {
        deskStorage.allowReplacement();
        clearKernels();
        set({ nodes: normalizeCells(starterNodes()), edges: [], focusedNodeId: null });
      },
      setTitle: (id, title) => set({ nodes: patchNode(get().nodes, id, { title }) }),
      setRef: (id, ref) => {
        const next = ref.trim();
        if (!isRef(next) || isReservedRef(next)) return false;
        const nodes = get().nodes;
        const current = nodes.find((node) => node.id === id);
        if (!current) return false;
        if (current.data.ref === next) return true;
        if (nodes.some((node) => node.id !== id && node.data.ref === next)) return false;
        for (const active of [...inflight.keys()]) get().restart(active);
        const prev = current.data.ref;
        set({
          nodes: refreshReferenceLabels(get().nodes.map((node) => {
            const cells = node.data.cells.map((cell) =>
              cell.kind === "code" ? { ...cell, source: replaceRef(cell.source, prev, next), references: Object.fromEntries(Object.entries(cell.references ?? {}).map(([key, value]) => [key.startsWith(prev + ".") ? next + key.slice(prev.length) : key, value])) } : cell,
            );
            if (node.id === id) return { ...node, data: { ...node.data, ref: next, cells } };
            return { ...node, data: { ...node.data, cells } };
          })),
        });
        return true;
      },
      setCellName: (nodeId, cellId, name) => {
        name = name.trim();
        const node = get().nodes.find(n => n.id === nodeId);
        const cell = node?.data.cells.find(c => c.id === cellId);
        if (!node || !cell || !validCellName(name)) return false;
        if (cell.name === name) return true;
        if (node.data.cells.some(c => c.id !== cellId && c.name === name) || node.data.cells.some(c => c.kind === 'code' && topLevelNames(c.source).includes(name))) return false;
        if (inflight.has(nodeId)) get().restart(nodeId);
        if (cell.name) kernels.get(nodeId)?.renameCell(cell.name, name);
        set({ nodes: refreshReferenceLabels(patchCell(get().nodes, nodeId, cellId, { name })) });
        return true;
      },
      setArtifactInputs: (nodeId, cellId, inputs) => set({ nodes: markDependents(patchCell(get().nodes, nodeId, cellId, { inputs }), [{ nodeId, cellId }]) }),
      setPanelTheme: (nodeId, cellId, panel, theme) => set({ nodes: patchCell(get().nodes, nodeId, cellId, { [panel]: theme }) }),
      setArtifactNetwork: (nodeId, cellId, artifactNetwork) => set({ nodes: patchCell(get().nodes, nodeId, cellId, { artifactNetwork }) }),
      setCellImage: (nodeId, cellId, image) => set({ nodes: markDependents(patchCell(get().nodes, nodeId, cellId, { image }), [{ nodeId, cellId }]) }),
      setCellSource: (nodeId, cellId, source) => {
        if (inflight.has(nodeId)) get().restart(nodeId);
        set({ nodes: markDependents(patchCell(get().nodes, nodeId, cellId, { source, references: bindReferences(source, get().nodes, get().nodes.find(n => n.id === nodeId)?.data.cells.find(c => c.id === cellId)?.references), output: null, status: "idle" }), [{ nodeId, cellId }]) });
      },
      insertCell: (nodeId, afterId, kind) => {
        const nodes = get().nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const cell: Cell = {
            id: uid("cell"),
            kind,
            source: kind === "artifact" ? ARTIFACT_TEMPLATES.react.source : "",
            output: null,
            status: "idle",
          };
          const cells = [...n.data.cells];
          const idx = afterId ? cells.findIndex((c) => c.id === afterId) : -1;
          cells.splice(idx + 1, 0, cell);
          return { ...n, data: { ...n.data, cells } };
        });
        set({ nodes: normalizeCells(nodes) });
      },
      removeCell: (nodeId, cellId) => {
        if (inflight.has(nodeId)) get().restart(nodeId);
        const nodes = get().nodes.map((n) => {
          if (n.id !== nodeId) return n;
          if (n.data.cells.length <= 1) return n;
          return { ...n, data: { ...n.data, cells: n.data.cells.filter((c) => c.id !== cellId) } };
        });
        set({ nodes: markDependents(nodes, [{ nodeId, cellId }]) });
        get().restart(nodeId);
      },
      runCell: (nodeId, cellId) => enqueue(nodeId, async (kernel, current) => {
        const cell = get().nodes.find(n => n.id === nodeId)?.data.cells.find(c => c.id === cellId);
        if (cell?.kind === "code") await executeCell(nodeId, cell, kernel, current, []);
      }),
      runAll: (nodeId) => runNotebook(nodeId, [], true),
      restart: (nodeId) => {
        invalidateKernel(nodeId);
        const node = get().nodes.find((n) => n.id === nodeId);
        if (!node) return;
        set({
          nodes: markDependents(patchNode(get().nodes, nodeId, {
            cells: node.data.cells.map((c) => ({ ...c, output: null, status: "idle" })),
          }), node.data.cells.filter(c => c.kind === "code").map(c => ({ nodeId, cellId: c.id }))),
        });
      },
      setFocused: (id) => set({ focusedNodeId: id }),
      toggleFocused: (id) => set({ focusedNodeId: get().focusedNodeId === id ? null : id }),
    }),
    {
      name: "folio-canvas-v2",
      storage: deskStorage.storage,
      skipHydration: true,
      partialize: deskToPersist,
      // The storage adapter has already validated and normalized this value.
      // Preserve its references so hydration does not schedule a redundant save.
      merge: (persisted, current) => {
        clearKernels();
        if (!persisted) return current;
        persistedDesk = persisted as Pick<FolioState, "nodes" | "edges">;
        return { ...current, ...persistedDesk };
      },
      onRehydrateStorage: () => () => {
        useFolioStore.setState({ hydrated: true });
      },
    },
  ),
);

export async function resolveArtifactInputs(inputs: ArtifactInput[], nodes = useFolioStore.getState().nodes) {
  const result: Record<string, unknown> = Object.create(null);
  for (const input of inputs) {
    if (!validCellName(input.name) || Object.hasOwn(result, input.name) || ['key', 'ref', 'children'].includes(input.name)) throw Error('Use unique input names, without React reserved props (key, ref, children).');
    const target = referenceTarget(nodes, input.reference);
    if (!target) throw Error(`The source for ${input.name} was removed. Choose another source.`);
    const { node, cell } = target;
    let value: unknown;
    if (cell.kind === 'markdown') value = cell.source;
    else if (cell.kind === 'video') { if (!cell.video) throw Error('Add a video first.'); value = cell.video; }
    else if (cell.kind === 'image') { if (!cell.image) throw Error(`Add an image to @${node.data.ref}.${cell.name} first.`); value = cell.image; }
    else if (cell.kind === 'code') {
      if (cell.status !== 'ok' || cell.stale) throw Error(`Run @${node.data.ref}.${cell.name} first. Its inputs changed or it has no result.`);
      value = await kernelFor(node.id).readValue(cell.name!);
    } else throw Error('Artifact outputs are not available yet. Choose a note, image, or code result.');
    for (const key of input.reference.path ?? []) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || value == null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw Error(`Property ${key} is missing from ${input.name}.`);
      value = (value as Record<string, unknown>)[key];
    }
    const json = JSON.stringify(value, (_key, item) => { if (typeof item === 'function' || typeof item === 'bigint' || typeof item === 'symbol') throw Error('Artifact inputs must be plain JSON data.'); return item; });
    if (json === undefined || json.length > 2_000_000) throw Error(`Input ${input.name} is empty or too large.`);
    result[input.name] = JSON.parse(json);
  }
  if (JSON.stringify(result).length > 8_000_000) throw Error('Artifact inputs exceed 8 MB. Use smaller values.');
  return result;
}
