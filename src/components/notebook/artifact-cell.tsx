import { PreviewTheme } from "./preview-theme";
import { Play, Square, Plus, Minus, CodeXml, PanelTop, Rows2 } from "lucide-react";
import { ArtifactInputs } from "./artifact-inputs";
import { resolveArtifactInputs, useFolioStore } from "@/lib/notebook/store";
import { referenceTarget } from "@/lib/notebook/cell-references";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { NotebookEditor } from "./lazy-editor";
import { Button } from "@/components/ui/button";
import { artifactDocument, validateManifest } from "@/lib/artifacts/frame";
import { ARTIFACT_TEMPLATES } from "@/lib/artifacts/templates";
import catalog from "@/lib/artifacts/catalog.json";
import { useFolioUi } from "@/lib/notebook/ui";
import type { Cell } from "@/lib/notebook/types";

type Run = { id: string; document: string; code: string; inputs: Record<string, unknown>; source: string; bindings: Cell["inputs"]; dependencies: (Cell | undefined)[] };
function themeValues(element?: HTMLElement | null) {
  const style = getComputedStyle(element ?? document.documentElement);
  return Object.fromEntries(["--color-paper", "--color-ink", "--color-forest", "--font-sans", "--font-mono"].map(key => [key, style.getPropertyValue(key)]));
}
export function ArtifactCell({ nodeId, cell, active, onChange, onNetwork }: { nodeId: string; cell: Cell; active: boolean; onChange: (source: string) => void; onNetwork: (value: boolean) => void }) {
  const nodes = useFolioStore(s => s.nodes);
  const sourcePath = nodes.find(node => node.id === nodeId)?.data.sourcePath;
  const dependencies = (cell.inputs ?? []).map(i => referenceTarget(nodes, i.reference)?.cell);
  const ask = useFolioUi((s) => s.ask);
  const frame = useRef<HTMLIFrameElement>(null);
  const generation = useRef(0);
  const [run, setRun] = useState<Run | null>(null);
  const [status, setStatus] = useState("Ready to run");
  const [error, setError] = useState("");
  const [view, setView] = useState<"source" | "preview" | "both">("both");
  const [inputsOpen, setInputsOpen] = useState(false);
  const inputsId = useId();
  const stop = useCallback(() => {
    generation.current++;
    frame.current?.contentWindow?.postMessage({ type: "dispose", id: run?.id }, "*");
    setRun(null); setStatus("Stopped");
  }, [run?.id]);
  useEffect(() => { if (!active) stop(); }, [active, stop]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (!run) return;
    let failed = false;
    const timeout = window.setTimeout(() => { failed = true; setStatus("Error"); setError("The artifact did not finish starting. Stop it or check its source, then run again."); }, 20_000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.folioArtifact !== run.id) return;
      if (event.data.type === "ready") { window.clearTimeout(timeout); if (!failed) setStatus("Running"); }
      if (event.data.type === "error" && typeof event.data.value === "string") { failed = true; window.clearTimeout(timeout); setError(event.data.value.slice(0, 4000)); setStatus("Error"); }
    };
    window.addEventListener("message", receive);
    const observer = new MutationObserver(() => frame.current?.contentWindow?.postMessage({ type: "theme", id: run.id, theme: themeValues(frame.current) }, "*"));
    observer.observe(document.documentElement, { attributes: true });
    return () => { window.clearTimeout(timeout); window.removeEventListener("message", receive); observer.disconnect(); };
  }, [run]);
  useEffect(() => { if (run) frame.current?.contentWindow?.postMessage({ type: "theme", id: run.id, theme: themeValues(frame.current) }, "*"); }, [cell.previewTheme, run]);
  const start = async () => {
    stop(); const token = ++generation.current; setError(""); setStatus("Preparing libraries…");
    try {
      const compiled = sourcePath
        ? (await import("@/lib/artifacts/project-compiler")).compileProject(nodes.flatMap(node => {
            const source = node.data.cells.find(item => item.kind === "artifact");
            return node.data.sourcePath && source ? [{ path: node.data.sourcePath, source: source.source }] : [];
          }), sourcePath)
        : (await import("@/lib/artifacts/compiler")).compileArtifact(cell.source);
      const inputs = await resolveArtifactInputs(cell.inputs ?? []);
      const response = await fetch("/folio-runtime/manifest.json");
      if (!response.ok) throw Error("Artifact libraries could not be loaded.");
      const manifest = validateManifest(await response.json());
      const document = await artifactDocument(compiled, !!cell.artifactNetwork, manifest, location.origin);
      if (token !== generation.current) return;
      setRun({ id: crypto.randomUUID(), document, code: compiled.code, inputs, source: cell.source, bindings: cell.inputs, dependencies }); setStatus("Loading preview…");
    } catch (e) { if (token === generation.current) { setError(e instanceof Error ? e.message : String(e)); setStatus("Error"); } }
  };
  const playing = run !== null || status === "Preparing libraries…" || status === "Loading preview…";
  return <div className="folio-artifact nodrag nopan nowheel" onKeyDown={e => { if (e.defaultPrevented) return; if (e.shiftKey && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); void start(); } }}>
    <div className="folio-artifact-toolbar">
      <Button size="iconSm" variant="ghost" onClick={() => playing ? stop() : void start()} disabled={!active} aria-label={playing ? "Stop artifact" : "Run artifact"} title={playing ? "Stop artifact" : "Run artifact"}>{playing ? <Square /> : <Play />}</Button>
      <Button size="sm" variant="ghost" onClick={() => setInputsOpen(v => !v)} aria-expanded={inputsOpen} aria-controls={inputsId}>{inputsOpen ? <Minus /> : <Plus />}Inputs</Button>
      <div className="folio-artifact-views" role="group" aria-label="Artifact view">
        <Button size="iconSm" variant="ghost" aria-label="Source and preview" title="Both" aria-pressed={view === "both"} onClick={() => setView("both")}><Rows2 /></Button>
        <Button size="iconSm" variant="ghost" aria-label="Source only" title="Source" aria-pressed={view === "source"} onClick={() => setView("source")}><CodeXml /></Button>
        <Button size="iconSm" variant="ghost" aria-label="Preview only" title="Preview" aria-pressed={view === "preview"} onClick={() => setView("preview")}><PanelTop /></Button>
      </div>
    </div>
    <div id={inputsId} hidden={!inputsOpen}><ArtifactInputs nodeId={nodeId} cell={cell} /></div>
    <div className="folio-artifact-status" role="status">{run && (run.source !== cell.source || run.bindings !== cell.inputs || run.dependencies.some((c, i) => c !== dependencies[i])) ? "Inputs changed · Run to update" : status}</div>
    {view !== "preview" && <>
      <label>Start from <select aria-label="Artifact template" defaultValue="" onChange={e => { const template = ARTIFACT_TEMPLATES[e.target.value as keyof typeof ARTIFACT_TEMPLATES]; if (template) { const replace = () => { stop(); onChange(template.source); }; if (!cell.source.trim()) replace(); else ask({ title: "Replace artifact source", body: "Replace this artifact’s source with the selected example?", confirmLabel: "Replace", onConfirm: replace }); } e.target.value = ""; }}><option value="" disabled>Choose an example</option>{Object.entries(ARTIFACT_TEMPLATES).map(([key, item]) => <option key={key} value={key}>{item.name}</option>)}</select></label>
      <div className="folio-artifact-source-panel" data-panel-theme={cell.codeTheme}><NotebookEditor value={cell.source} onChange={onChange} language="tsx" label="Artifact source" maxHeight="320px" onRun={() => void start()} /></div>
      <label className="folio-artifact-network"><input type="checkbox" checked={!!cell.artifactNetwork} onChange={e => { stop(); onNetwork(e.target.checked); }} />Allow network requests</label>
      <details className="folio-artifact-libraries"><summary>Libraries and usage</summary><p>Export a React component, or draw into <code>mount</code>. Register resource cleanup with <code>onCleanup(fn)</code>. Static imports use these exact names. Images can load from URLs; fetch requests require the option above. View changes stop the preview.</p><ul>{Object.entries(catalog).map(([name, item]) => <li key={name}><code>{name}</code> — {item.about}</li>)}</ul></details>
    </>}
    {error && <pre role="alert" className="folio-artifact-error">{error}</pre>}
    {view !== "source" && <div className="folio-artifact-preview-head"><PreviewTheme nodeId={nodeId} cell={cell} /></div>}
    {run && active && <iframe data-panel-theme={cell.previewTheme} hidden={view === "source"} ref={frame} key={run.id} title="Artifact preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={run.document} onLoad={() => frame.current?.contentWindow?.postMessage({ type: "start", id: run.id, code: run.code, inputs: run.inputs, theme: themeValues(frame.current) }, "*")} />}
  </div>;
}
