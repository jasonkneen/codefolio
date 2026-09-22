import { NotebookKernel } from "./runtime";
import { inspect } from "./inspect";

const kernels = new Map<string, NotebookKernel>();
const imports = new Map<string, { kernel: string; resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
let session: string | undefined;
const send = (message: object) => parent.postMessage({ ...message, folioKernel: session }, "*");
addEventListener("message", async event => {
  const message = event.data;
  if (event.source !== parent || !message || typeof message.session !== "string") return;
  if (!session && message.type === "init") { session = message.session; send({ type: "ready" }); return; }
  if (message.session !== session) return;
  if (message.type === 'rename' && typeof message.from === 'string' && typeof message.to === 'string') { kernels.get(message.kernel)?.renameCell(message.from, message.to); return; }
  if (message.type === "reset") {
    kernels.get(message.kernel)?.reset(); kernels.delete(message.kernel);
    for (const [id, pending] of imports) if (pending.kernel === message.kernel) { pending.reject(new Error("Execution cancelled")); imports.delete(id); }
    return;
  }
  if (message.type === "import-result") {
    const pending = imports.get(message.importId);
    if (!pending) return;
    imports.delete(message.importId);
    const imported = kernels.get(message.kernel);
    if (message.error || (!imported && !message.values)) pending.reject(new Error(message.error || "Imported notebook is unavailable"));
    else {
      try {
        const values = { ...imported?.snapshot(), ...message.values };
        pending.resolve(Array.isArray(message.names) ? Object.fromEntries(message.names.map((name: string) => [name, structuredClone(values[name])])) : values);
      } catch { pending.reject(Error('Named cell references need data values. Use a notebook import for functions.')); }
    }
    return;
  }
  if (message.type === "read" && typeof message.id === "string") {
    try {
      const value = await kernels.get(message.kernel)?.readValue(message.name);
      const json = JSON.stringify(value, (_key, item) => { if (typeof item === 'function' || typeof item === 'bigint' || typeof item === 'symbol') throw Error('Artifact inputs must be JSON values. Return plain data from this cell.'); return item; });
      if (json === undefined || json.length > 2_000_000) throw Error('This value is empty or too large for an artifact input.');
      send({ type: 'value', id: message.id, json });
    } catch (error) { send({ type: 'value', id: message.id, error: error instanceof Error ? error.message : String(error) }); }
    return;
  }
  if (message.type !== "run" || typeof message.kernel !== "string" || typeof message.id !== "string" || typeof message.source !== "string") return;
  for (const [key, value] of Object.entries(message.theme || {})) if (/^--(?:color-|font-)/.test(key) && typeof value === "string") document.documentElement.style.setProperty(key, value);
  const kernel = kernels.get(message.kernel) ?? new NotebookKernel();
  kernels.set(message.kernel, kernel);
  const output = await kernel.run(message.source, (ref, names) => new Promise((resolve, reject) => {
    const importId = crypto.randomUUID();
    imports.set(importId, { kernel: message.kernel, resolve, reject });
    send({ type: "import", id: message.id, importId, ref, names });
  }), message.options);
  const previews: Record<string, unknown> = Object.create(null);
  for (const name of kernel.names().slice(0, 200)) {
    try { previews[name] = inspect(kernel.peek(name).value); }
    catch { previews[name] = { kind: "text", text: "[Preview unavailable]" }; }
  }
  send({ type: "result", id: message.id, output, previews });
});
