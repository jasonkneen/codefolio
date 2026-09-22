import { useMediaDrop } from "@/components/notebook/use-media-drop";
import { useSaveStatus } from "@/lib/notebook/persistence";
import { DeskSaveStatus } from "@/components/folio/desk-save-status";
import { AppearanceSync } from "@/components/folio/appearance-panel";
import { FullNotebook } from "@/components/notebook/full-notebook";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowInstance,
} from "@xyflow/react";
import { DeskFallback } from "@/components/canvas/desk-fallback";
import { DeskStack } from "@/components/canvas/desk-stack";
import { FolioChrome } from "@/components/canvas/folio-chrome";
import { NotebookNode } from "@/components/canvas/notebook-node";
import { WorkspaceSidebar } from "@/components/canvas/workspace-sidebar";
import { ConfirmHost } from "@/components/folio/confirm-dialog";
import { EmptyDesk } from "@/components/folio/empty-desk";
import { HelpPanel } from "@/components/folio/help-panel";
import { FolioToaster } from "@/components/folio/toaster";
import { WelcomeGate } from "@/components/folio/welcome";
import { useFolioStore } from "@/lib/notebook/store";
import { useFolioUi } from "@/lib/notebook/ui";
import { loadWorkspaces } from "@/lib/notebook/workspaces";
import type { FolioNode } from "@/lib/notebook/types";

const nodeTypes = { notebook: NotebookNode };

const FIT = { padding: 0.16, maxZoom: 0.86, minZoom: 0.35, duration: 0 };

function CanvasInner() {
  const nodes = useFolioStore((s) => s.nodes);
  const edges = useFolioStore((s) => s.edges);
  const onNodesChange = useFolioStore((s) => s.onNodesChange);
  const onEdgesChange = useFolioStore((s) => s.onEdgesChange);
  const onConnect = useFolioStore((s) => s.onConnect);
  const addNotebook = useFolioStore((s) => s.addNotebook);
  const instance = useRef<ReactFlowInstance<FolioNode> | null>(null);
  const mediaDrop = useMediaDrop(undefined, point => instance.current?.screenToFlowPosition(point) ?? point);
  const nodeIds = nodes.map((node) => node.id).join("\0");

  const fit = useCallback(() => {
    const flow = instance.current;
    if (!flow || flow.getNodes().length === 0) return;
    flow.fitView(FIT);
  }, []);

  useEffect(() => {
    if (!nodeIds) return;
    const frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
  }, [nodeIds, fit]);

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.detail !== 2) return;
      const flow = instance.current;
      if (!flow) return;
      const pos = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNotebook({ x: pos.x - 40, y: pos.y - 20 });
    },
    [addNotebook],
  );

  return (
    <div className="folio-canvas-drop" {...mediaDrop}>
      <FolioChrome />
      {nodes.length === 0 ? (
        <EmptyDesk />
      ) : (
        <div className="folio-flow">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onInit={(rf) => {
              instance.current = rf;
              requestAnimationFrame(fit);
            }}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={FIT}
            minZoom={0.35}
            maxZoom={1.4}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "var(--color-muted)", strokeWidth: 1.5 } }}
          >
            <Background
              id="desk"
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.4}
              color="color-mix(in srgb, var(--color-desk-fg) 12%, transparent)"
            />
            <Controls showInteractive={false} />
            {(
              <MiniMap
                pannable
                zoomable
                maskColor="color-mix(in srgb, var(--color-desk) 72%, transparent)"
                nodeColor="var(--color-paper)"
                className="folio-minimap"
              />
            )}
          </ReactFlow>
        </div>
      )}
      <p className="folio-hint">Double-click the desk to add a page. Open full view to read and edit. Shift+Enter runs a cell.</p>
    </div>
  );
}

export function FolioCanvas() {
  const saveState = useSaveStatus((s) => s.state);
  const focusedNodeId = useFolioStore((s) => s.focusedNodeId);
  const hydrated = useFolioStore((s) => s.hydrated);
  const [layout, setLayout] = useState<"boot" | "stack" | "flow">("boot");
  const ask = useFolioUi((s) => s.ask);

  useEffect(() => {
    loadWorkspaces();
    const unsub = useFolioStore.persist.onFinishHydration(() => {
      useFolioStore.setState({ hydrated: true });
    });
    void useFolioStore.persist.rehydrate();
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!hydrated || focusedNodeId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || document.querySelector('[aria-modal="true"]')) return;
      if (isTextTarget(event.target)) return;
      const state = useFolioStore.getState();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault(); event.stopPropagation();
        state.selectAll();
        return;
      }
      if (event.metaKey || event.ctrlKey || (event.key !== "Delete" && event.key !== "Backspace")) return;
      if (window.getSelection()?.toString()) return;
      const count = state.nodes.filter(node => node.selected).length;
      const edgeCount = state.edges.filter(edge => edge.selected).length;
      if (!count && !edgeCount) return;
      event.preventDefault(); event.stopPropagation();
      ask({
        title: count ? `Delete ${count} ${count === 1 ? "notebook" : "notebooks"}?` : `Delete ${edgeCount} ${edgeCount === 1 ? "connection" : "connections"}?`,
        body: count ? `Remove the selected ${count === 1 ? "notebook and its" : "notebooks and their"} connections from this workspace?` : "Remove the selected connections from this workspace?",
        confirmLabel: "Delete selected",
        danger: true,
        onConfirm: () => useFolioStore.getState().removeSelected(),
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hydrated, focusedNodeId, ask]);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 720px)");
    const apply = () => setLayout(mql.matches ? "stack" : "flow");
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  const desk =
    !hydrated || layout === "boot" ? (
      <DeskFallback />
    ) : layout === "stack" ? (
      <DeskStack />
    ) : (
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
    );

  return (
    <>
      <AppearanceSync />
      <DeskSaveStatus />
      <div className="folio-desk-layer" data-app-ready={hydrated && layout !== "boot" && saveState === "saved"} inert={Boolean(focusedNodeId)} aria-hidden={Boolean(focusedNodeId)} style={{ opacity: focusedNodeId ? 0 : 1, pointerEvents: focusedNodeId ? "none" : undefined }}><WorkspaceSidebar /><div className="folio-workspace-main">{desk}</div></div>
      {focusedNodeId && <FullNotebook nodeId={focusedNodeId} />}
      <WelcomeGate />
      <HelpPanel />
      <ConfirmHost />
      <FolioToaster />
    </>
  );
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], .cm-editor'));
}
