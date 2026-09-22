import { outputSchema } from "./output-safety";
import type { LoadCard, RunOptions } from "./runtime";
import type { CellOutput, Display } from "./types";

type Result = { output: CellOutput; previews: Record<string, Display> };
type Pending = { resolve: (value: Result) => void; reject: (error: Error) => void; loadCard?: LoadCard };
const pending = new Map<string, Pending>();
const reads = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let frame: HTMLIFrameElement | undefined;
let loading: Promise<void> | undefined;
let session = "";
let generation = 0;
let detach = () => {};
let cancelStartup = () => {};
export function disposeSandboxRuntime() {
  generation++;
  cancelStartup(); detach();
  frame?.remove(); frame = undefined; loading = undefined;
  for (const call of [...pending.values()]) call.reject(Error("Notebook runtime was replaced"));
  pending.clear();
  for (const call of reads.values()) call.reject(Error("Notebook runtime was replaced"));
  reads.clear();
}
function send(message: object) { frame?.contentWindow?.postMessage({ ...message, session }, "*"); }
function themeValues() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(["paper", "ink", "line", "forest", "muted"].map(name => [`--color-${name}`, style.getPropertyValue(`--color-${name}`)]));
}
export function readKernelResult(message: { output: unknown; previews: unknown }): Result {
  const output = outputSchema.parse(message.output);
  if (!message.previews || typeof message.previews !== "object" || Array.isArray(message.previews)) throw Error("Invalid kernel previews");
  const entries = Object.entries(message.previews);
  if (entries.length > 200) throw Error("Too many kernel previews");
  const previews = Object.fromEntries(entries.map(([name, value]) => {
    if (name.length > 200) throw Error("Invalid binding name");
    return [name, outputSchema.parse({ logs: [], displays: [value] }).displays[0]];
  }));
  return { output, previews };
}
async function ensureFrame() {
  if (loading) return loading;
  const epoch = generation;
  loading = (async () => {
    const response = await fetch("/folio-runtime/manifest.json");
    if (!response.ok) throw Error("Notebook runtime is unavailable. Reload the app.");
    const manifest = await response.json();
    if (epoch !== generation) throw Error("Notebook runtime was replaced");
    if (typeof manifest.kernel !== "string" || !/^kernel-[a-f0-9]{16}\.js$/.test(manifest.kernel)) throw Error("Invalid notebook runtime manifest");
    const url = new URL(`/folio-runtime/${manifest.kernel}`, location.origin).href;
    session = crypto.randomUUID();
    frame = document.createElement("iframe");
    frame.title = "Isolated notebook runtime";
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.referrerPolicy = "no-referrer";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { abortStartup(); reject(Error("Notebook runtime did not start")); }, 15_000);
      const receive = (event: MessageEvent) => {
        const message = event.data;
        if (event.source !== frame?.contentWindow || message?.folioKernel !== session) return;
        if (message.type === "ready") { clearTimeout(timer); resolve(); return; }
        if (typeof message.id !== "string") return;
        if (message.type === "value") {
          const read = reads.get(message.id);
          if (read) { if (message.error) read.reject(Error(String(message.error).slice(0, 4000))); else { try { if (typeof message.json !== 'string' || message.json.length > 2_000_000) throw Error('Invalid input value'); read.resolve(JSON.parse(message.json)); } catch { read.reject(Error('Invalid input value')); } } }
          return;
        }
        const call = pending.get(message.id);
        if (!call) return;
        if (message.type === "result") {
          try { call.resolve(readKernelResult(message)); }
          catch { call.reject(Error("The cell returned an unsupported or oversized result.")); }
        } else if (message.type === "import" && typeof message.ref === "string" && message.ref.length <= 200 && typeof message.importId === "string" && message.importId.length <= 100) {
          void (async () => {
            try {
              if (!call.loadCard) throw Error(`No card @${message.ref}`);
              const reference = await call.loadCard(message.ref, Array.isArray(message.names) && message.names.length <= 500 && message.names.every((n: unknown) => typeof n === "string" && n.length <= 200) ? message.names : undefined);
              if (pending.get(message.id) === call) send({ type: "import-result", importId: message.importId, kernel: reference.__folioKernel, values: reference.__folioValues, names: reference.__folioNames });
            } catch (error) {
              if (pending.get(message.id) === call) send({ type: "import-result", importId: message.importId, error: error instanceof Error ? error.message : String(error) });
            }
          })();
        }
      };
      window.addEventListener("message", receive);
      detach = () => window.removeEventListener("message", receive);
      cancelStartup = () => { clearTimeout(timer); reject(Error("Notebook runtime was replaced")); };
      const abortStartup = () => { clearTimeout(timer); window.removeEventListener("message", receive); };
      frame!.onerror = () => { abortStartup(); reject(Error("Notebook runtime could not load")); };
      // The single runtime preserves function identity across linked notebooks.
      // All user code and live values remain in this opaque-origin frame.
      frame!.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-eval' ${url}; style-src 'unsafe-inline'; img-src data: blob: https: http:; connect-src 'none'; base-uri 'none'; form-action 'none'"><script src="${url}"></script>`;
      frame!.onload = () => send({ type: "init" });
      document.body.append(frame!);
    });
  })().catch(error => { if (epoch === generation) { detach(); frame?.remove(); frame = undefined; loading = undefined; } throw error; });
  return loading;
}
async function execute(kernel: string, source: string, signal: AbortSignal, loadCard?: LoadCard, options?: RunOptions): Promise<Result> {
  await ensureFrame();
  signal.throwIfAborted();
  const id = crypto.randomUUID();
  return new Promise<Result>((resolve, reject) => {
    const cleanup = () => { pending.delete(id); clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(Error("Execution cancelled")); };
    const timer = setTimeout(() => { cleanup(); send({ type: "reset", kernel }); reject(Error("Notebook execution timed out. Restart the kernel before continuing.")); }, 15_000);
    pending.set(id, { loadCard, resolve: result => { cleanup(); resolve(result); }, reject: error => { cleanup(); reject(error); } });
    signal.addEventListener("abort", abort, { once: true });
    send({ type: "run", id, kernel, source, options, theme: themeValues() });
  });
}
export class SandboxKernel {
  private id = crypto.randomUUID();
  private lifetime = new AbortController();
  private published = false;
  private previews: Record<string, Display> = {};
  reset() { this.lifetime.abort(); this.lifetime = new AbortController(); this.previews = {}; this.published = false; send({ type: "reset", kernel: this.id }); }
  renameCell(from: string, to: string) {
    if (Object.hasOwn(this.previews, from)) { this.previews[to] = this.previews[from]; delete this.previews[from]; }
    send({ type: 'rename', kernel: this.id, from, to });
  }
  hasRun() { return this.published; }
  markRun() { this.published = true; }
  unpublish() { this.published = false; }
  names() { return Object.keys(this.previews); }
  peek(name: string) { return { found: Object.hasOwn(this.previews, name), value: undefined, display: this.previews[name] }; }
  snapshot(): Record<string, unknown> { return { __folioKernel: this.id }; }
  async readValue(name: string): Promise<unknown> {
    await ensureFrame();
    const id = crypto.randomUUID();
    const signal = this.lifetime.signal;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const cleanup = () => { reads.delete(id); clearTimeout(timer); signal.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(Error('Execution cancelled')); };
      const timer = setTimeout(() => { cleanup(); reject(Error('Could not read the code result. Run its cell again.')); }, 5000);
      reads.set(id, { resolve: value => { cleanup(); resolve(value); }, reject: error => { cleanup(); reject(error); } });
      signal.addEventListener('abort', abort, { once: true });
      send({ type: 'read', id, kernel: this.id, name });
    });
  }
  async run(source: string, loadCard?: LoadCard, options: RunOptions = {}): Promise<CellOutput> {
    const signal = this.lifetime.signal;
    try {
      const result = await execute(this.id, source, signal, loadCard, options);
      signal.throwIfAborted();
      this.previews = result.previews;
      this.published = !result.output.displays.some(display => display.kind === "error");
      return result.output;
    } catch (error) { return { logs: [], displays: [{ kind: "error", message: error instanceof Error ? error.message : String(error) }] }; }
  }
}
