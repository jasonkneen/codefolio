import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CodeXml, Download, FastForward, Pause, Play, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compileProject, type ProjectBuild } from "@/lib/artifacts/project-compiler";
import { artifactDocument, validateManifest } from "@/lib/artifacts/frame";
import { askProjectAssistant } from "@/lib/artifacts/project-assistant";
import { downloadProject, exportProject } from "@/lib/artifacts/project-export";
import { useFolioStore } from "@/lib/notebook/store";

type Run = { id: string; document: string; code: string; sourceKey: string; build: ProjectBuild };

export function ProjectPreview({ onClose }: { onClose: () => void }) {
  const nodes = useFolioStore(state => state.nodes);
  const setCellSource = useFolioStore(state => state.setCellSource);
  const entries = useMemo(() => nodes.flatMap(node => {
    const source = node.data.cells.find(cell => cell.kind === "artifact");
    return node.data.sourcePath && source ? [{ path: node.data.sourcePath, source: source.source, note: node.data.cells.find(cell => cell.kind === "markdown")?.source ?? "" }] : [];
  }), [nodes]);
  const [entry, setEntry] = useState("");
  const selected = entries.some(file => file.path === entry) ? entry : entries[0]?.path ?? "";
  const sourceKey = JSON.stringify(entries.map(file => [file.path, file.source]));
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Choose an entry file and run its preview.");
  const [walk, setWalk] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [repair, setRepair] = useState<{ path: string; source: string; reason: string } | null>(null);
  const attempted = useRef(new Set<string>());
  const frame = useRef<HTMLIFrameElement>(null);
  const generation = useRef(0);

  const stop = () => {
    generation.current++;
    frame.current?.contentWindow?.postMessage({ type: "dispose", id: run?.id }, "*");
    setRun(null);
    setPlaying(false);
    setStatus("Stopped");
  };
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (!run) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.folioArtifact !== run.id) return;
      if (event.data.type === "ready") setStatus("Preview running");
      if (event.data.type === "error") { setError(String(event.data.value).slice(0, 4000)); setStatus("Preview failed"); }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [run]);

  const start = async () => {
    if (!selected) return;
    const token = ++generation.current;
    setRun(null); setError(""); setRepair(null); setExplanation(""); setStatus("Compiling selected modules…");
    try {
      const build = compileProject(entries.map(({ path, source }) => ({ path, source })), selected);
      const response = await fetch("/folio-runtime/manifest.json");
      if (!response.ok) throw Error("Preview libraries are unavailable.");
      const manifest = validateManifest(await response.json());
      const document = await artifactDocument(build, false, manifest, location.origin);
      if (token !== generation.current) return;
      setRun({ id: crypto.randomUUID(), document, code: build.code, sourceKey, build });
      setStep(0); setStatus("Loading preview…");
    } catch (cause) {
      if (token !== generation.current) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message); setStatus("Build failed. Checking for a repair…");
      const key = `${sourceKey}/${selected}/${message}`;
      if (attempted.current.has(key)) { setStatus("Build failed"); return; }
      attempted.current.add(key);
      const answer = await askProjectAssistant({ data: { task: "repair", entry: selected, error: message, files: entries.slice(0, 12).map(({ path, source }) => ({ path, source: source.slice(0, 12_000) })) } }).catch(() => ({ ok: false as const, error: "AI assistance could not be reached." }));
      if (token !== generation.current) return;
      if (!answer.ok) { setStatus("Build failed"); return; }
      try {
        const raw = answer.text.replace(/^```(?:json)?\s*|\s*```$/g, "");
        const proposal = JSON.parse(raw) as { path: string; source: string; reason: string };
        if (!entries.some(file => file.path === proposal.path) || typeof proposal.source !== "string" || typeof proposal.reason !== "string" || proposal.source.length > 200_000) throw Error("Invalid repair");
        compileProject(entries.map(file => ({ path: file.path, source: file.path === proposal.path ? proposal.source : file.source })), selected);
        setRepair(proposal); setStatus("A compiling repair is ready to review.");
      } catch { setStatus("Build failed. The proposed repair did not compile."); }
    }
  };

  const buildDownload = async () => {
    if (!selected) return;
    setError(""); setStatus("Building a runnable project…");
    try {
      const response = await fetch("/folio-runtime/manifest.json");
      if (!response.ok) throw Error("Build libraries are unavailable.");
      const runtime = validateManifest(await response.json());
      const project = exportProject(entries.map(({ path, source }) => ({ path, source })), selected, runtime, Object.fromEntries(entries.map(({ path, note }) => [path, note])));
      downloadProject(project);
      setStatus(`Downloaded project with ${project.manifest.modules.length} linked modules. Run bun install, then bun run dev.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Project build failed");
    }
  };

  const openWalkthrough = async () => {
    if (walk) { setWalk(false); setPlaying(false); return; }
    setWalk(true);
    if (!run || explanation) return;
    const answer = await askProjectAssistant({ data: { task: "explain", entry: selected, files: entries.filter(file => run.build.paths.includes(file.path)).slice(0, 12).map(({ path, source }) => ({ path, source: source.slice(0, 12_000) })) } }).catch(() => ({ ok: false as const, error: "AI assistance could not be reached." }));
    setExplanation(answer.ok ? answer.text : answer.error);
  };

  const applyRepair = () => {
    if (!repair) return;
    const node = nodes.find(item => item.data.sourcePath === repair.path);
    const cell = node?.data.cells.find(item => item.kind === "artifact");
    if (!node || !cell) return;
    setCellSource(node.id, cell.id, repair.source);
    setRepair(null); setError(""); setStatus("Repair applied. Run the preview to verify it in the browser.");
  };

  const paths = run?.build.paths ?? [];
  useEffect(() => {
    if (!playing || !walk || paths.length < 2) return;
    const timer = window.setInterval(() => setStep(current => (current + 1) % paths.length), 2600);
    return () => window.clearInterval(timer);
  }, [playing, walk, paths.length]);
  const currentPath = paths[Math.min(step, paths.length - 1)];
  const currentFile = entries.find(file => file.path === currentPath);

  return <div className="folio-project-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="folio-project-panel" role="dialog" aria-modal="true" aria-label="Canvas preview">
      <header className="folio-project-head">
        <div><p className="folio-project-kicker">Source canvas</p><h2>Preview the assembled code</h2></div>
        <Button type="button" variant="ghost" size="iconSm" onClick={onClose} aria-label="Close canvas preview"><X /></Button>
      </header>
      <div className="folio-project-toolbar">
        <label>Entry file <select value={selected} onChange={event => { stop(); setEntry(event.target.value); }} aria-label="Preview entry file">{entries.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}</select></label>
        <Button type="button" onClick={() => run ? stop() : void start()} disabled={!selected}>{run ? <Square /> : <Play />}{run ? "Stop" : "Run preview"}</Button>
        <Button type="button" variant="ghost" onClick={() => void buildDownload()} disabled={!selected}><Download />Build project</Button>
        <Button type="button" variant="ghost" onClick={() => void openWalkthrough()} disabled={!run}><FastForward />{walk ? "Hide walkthrough" : "Walk me through this"}</Button>
        <Button type="button" variant="ghost" onClick={() => setShowCode(value => !value)} disabled={!run}><CodeXml />{showCode ? "Hide build" : "Show build"}</Button>
      </div>
      {!entries.length && <p className="folio-project-empty">Import a source file or folder from the desk menu to build a canvas preview.</p>}
      <p className="folio-project-status" role="status">{run && run.sourceKey !== sourceKey ? "Source changed. Run again to refresh the preview." : status}</p>
      {error && <pre className="folio-project-error" role="alert">{error}</pre>}
      {repair && <div className="folio-project-repair"><p><strong>Suggested repair for {repair.path}</strong><br />{repair.reason}</p><details><summary>Review replacement source</summary><pre>{repair.source}</pre></details><Button type="button" onClick={applyRepair}>Apply repair</Button></div>}
      {walk && run && currentFile && <div className="folio-project-walk">
        <div className="folio-project-walk-head"><div><span>Step {step + 1} of {paths.length}</span><h3>{currentPath}</h3></div><div className="folio-project-walk-actions"><Button type="button" variant="ghost" size="iconSm" onClick={() => setStep(value => (value + paths.length - 1) % paths.length)} aria-label="Previous step"><ArrowLeft /></Button><Button type="button" variant="ghost" size="iconSm" onClick={() => setPlaying(value => !value)} aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}>{playing ? <Pause /> : <Play />}</Button><Button type="button" variant="ghost" size="iconSm" onClick={() => setStep(value => (value + 1) % paths.length)} aria-label="Next step"><ArrowRight /></Button></div></div>
        <p>{step === 0 ? "This is the preview entrypoint. The modules it imports are loaded from the notebooks on this canvas." : `This module is required by the preview. Its source is kept in the notebook at ${currentPath}.`}</p>
        {explanation && <p className="folio-project-ai">{explanation}</p>}
        {currentFile.note && <p className="folio-project-note">{currentFile.note.replace(/^#.*\n?/, "").trim().slice(0, 240)}</p>}
        <pre>{currentFile.source.split("\n").slice(0, 14).join("\n")}</pre>
        <div className="folio-project-progress" aria-label="Walkthrough progress">{paths.map((path, index) => <button type="button" key={path} className={index === step ? "is-current" : ""} onClick={() => setStep(index)} aria-label={`Show ${path}`} />)}</div>
      </div>}
      {showCode && run && <details className="folio-project-build" open><summary>Generated preview bundle · {run.build.paths.length} modules</summary><pre>{run.code}</pre></details>}
      {run && <iframe ref={frame} key={run.id} title="Canvas preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={run.document} onLoad={() => frame.current?.contentWindow?.postMessage({ type: "start", id: run.id, code: run.code, inputs: {} }, "*")} />}
    </section>
  </div>;
}
