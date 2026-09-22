import { analyzeSource } from "./source";
import { html, inspect, inspectLogArgs, md, table } from "./inspect";
import { prepareSource, type CardImport } from "./refs";
import type { CellOutput, Display, LogLine } from "./types";

type KernelStore = Record<string, unknown>;

export type RunOptions = { resultName?: string; values?: Record<string, unknown> };
export type LoadCard = (ref: string, names?: string[]) => Promise<KernelStore>;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

const RESERVED = new Set([
  "__store",
  "__cards",
  "__value",
  "__bindings",
  "__displays",
  "console",
  "display",
  "html",
  "md",
  "canvas",
  "table",
  "chart",
  "sketch",
  "print",
  "help",
]);

export function isReservedRef(name: string): boolean {
  return RESERVED.has(name);
}

export class NotebookKernel {
  private bindings: KernelStore = {};
  private cellResults: KernelStore = {};
  private cellValues: KernelStore = {};
  private published = false;
  private lifetime = new AbortController();

  reset() {
    this.lifetime.abort();
    this.lifetime = new AbortController();
    this.bindings = {};
    this.cellResults = {};
    this.cellValues = {};
    this.published = false;
  }

  renameCell(from: string, to: string) {
    for (const values of [this.cellResults, this.cellValues]) if (Object.hasOwn(values, from)) { values[to] = values[from]; delete values[from]; }
  }

  hasRun() {
    return this.published;
  }

  unpublish() {
    this.published = false;
  }

  markRun() {
    this.published = true;
  }

  names(): string[] {
    return Object.keys(this.snapshot());
  }

  peek(name: string): { found: boolean; value: unknown; display?: Display } {
    const values = this.snapshot();
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      return { found: true, value: values[name] };
    }
    return { found: false, value: undefined };
  }

  async readValue(name: string): Promise<unknown> {
    if (!Object.hasOwn(this.snapshot(), name)) throw Error(`No value named ${name}. Run its cell first.`);
    return this.snapshot()[name];
  }

  snapshot(): KernelStore {
    return { ...this.bindings, ...this.cellResults, ...this.cellValues };
  }

  async run(source: string, loadCard?: LoadCard, options: RunOptions = {}): Promise<CellOutput> {
    const signal = this.lifetime.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    try {
      return await Promise.race([
        this.evaluate(source, loadCard, signal, options),
        new Promise<never>((_, reject) => {
          cancel = () => reject(new Error("Execution cancelled"));
          signal.addEventListener("abort", cancel, { once: true });
          timer = setTimeout(() => { reject(new Error("Timed out after 10s; restart the kernel before continuing.")); this.reset(); }, 10_000);
        }),
      ]);
    } catch (error) {
      return { logs: [], displays: [{ kind: "error", message: error instanceof Error ? error.message : String(error) }] };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    }
  }

  private async evaluate(source: string, loadCard: LoadCard | undefined, signal: AbortSignal, options: RunOptions): Promise<CellOutput> {
    if (options.values) this.cellValues = options.values;
    const scope = this.snapshot();
    const logs: LogLine[] = [];
    const displays: Display[] = [];
    const prepared = prepareSource(source.replace(/\u00a0/g, " "));
    const code = prepared.code.trim();
    if (!code && prepared.imports.length === 0) {
      return { logs, displays };
    }

    let cards: Record<string, KernelStore> = {};
    try {
      cards = await loadImports(prepared.imports, loadCard);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      displays.push({ kind: "error", message: error.message, stack: error.stack });
      return { logs, displays };
    }

    signal.throwIfAborted();
    const existing = Object.keys(scope).filter((n) => isIdent(n));
    const analyzed = analyzeSource(code);
    const declared = analyzed.names;
    const reservedDeclaration = declared.find(name => RESERVED.has(name));
    if (reservedDeclaration) throw new Error(`${reservedDeclaration} is reserved by the kernel. Choose another variable name.`);
    const importedLocals = prepared.locals.filter((n) => isIdent(n) && !RESERVED.has(n));
    const reservedImport = prepared.locals.find((n) => RESERVED.has(n));
    if (reservedImport) {
      displays.push({
        kind: "error",
        message: `@${reservedImport} is reserved by the kernel. Pick another card handle.`,
      });
      return { logs, displays };
    }
    const allNames = unique(
      [...existing, ...declared, ...importedLocals].filter((n) => isIdent(n) && !RESERVED.has(n)),
    );

    const prelude = existing
      .filter((n) => isIdent(n) && !RESERVED.has(n) && !analyzed.lexical.includes(n) && !importedLocals.includes(n))
      .map((n) => `var ${n} = __store[${JSON.stringify(n)}];`)
      .join("\n");

    const { body, tail } = analyzed;
    const harvest = allNames
      .filter(n => !n.startsWith("$flowrunnerInput"))
      .map((n) => `try { __bindings[${JSON.stringify(n)}] = ${n}; } catch {}`)
      .join("\n");

    const importPrelude = importLines(prepared.imports);

    const compiled = `
${prelude}
${importPrelude}
let __value = undefined;
const __bindings = Object.create(null);
const __displays = [];
${body}
${tail ? `__value = (${tail});` : ""}
if (__value && typeof __value.then === "function") {
  __value = await __value;
}
${harvest}
return { value: __value, bindings: __bindings, displays: __displays };
`;

    const consoleProxy = {
      log: (...args: unknown[]) => logs.push({ level: "log", text: inspectLogArgs(args) }),
      info: (...args: unknown[]) => logs.push({ level: "info", text: inspectLogArgs(args) }),
      warn: (...args: unknown[]) => logs.push({ level: "warn", text: inspectLogArgs(args) }),
      error: (...args: unknown[]) => logs.push({ level: "error", text: inspectLogArgs(args) }),
    };

    const display = (value: unknown) => {
      displays.push(inspect(value));
    };

    const print = (...args: unknown[]) => {
      logs.push({ level: "log", text: inspectLogArgs(args) });
    };

    try {
      const fn = new AsyncFunction(
        "__store",
        "__cards",
        "console",
        "display",
        "html",
        "md",
        "canvas",
        "table",
        "chart",
        "sketch",
        "print",
        "help",
        compiled,
      );
      const result = (await fn(
          scope,
          cards,
          consoleProxy,
          display,
          html,
          md,
          makeCanvas,
          table,
          chart,
          sketch,
          print,
          helpText,
        )) as {
        value: unknown;
        bindings: KernelStore;
        displays?: unknown[];
      };

      signal.throwIfAborted();
      Object.assign(this.bindings, result.bindings);
      if (options.resultName) this.cellResults[options.resultName] = result.value;
      this.published = true;
      if (Array.isArray(result.displays)) {
        for (const item of result.displays) displays.push(inspect(item));
      }
      if (result.value !== undefined) {
        displays.push(inspect(result.value));
      }
      return { logs, displays };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      displays.push({ kind: "error", message: error.message, stack: error.stack });
      return { logs, displays };
    }
  }
}

async function loadImports(imports: CardImport[], loadCard: LoadCard | undefined): Promise<Record<string, KernelStore>> {
  const cards: Record<string, KernelStore> = {};
  for (const item of imports) {
    if (!loadCard) throw new Error(`No card @${item.ref}`);
    if (!Object.hasOwn(cards, item.ref)) {
      const related = imports.filter(entry => entry.ref === item.ref);
      const names = related.some(entry => entry.kind === 'namespace') ? undefined : related.flatMap(entry => entry.kind === 'named' ? entry.specs.map(s => s.imported) : []);
      cards[item.ref] = await loadCard(item.ref, names);
    }
    if (item.kind === "named") {
      for (const spec of item.specs) {
        if (!Object.prototype.hasOwnProperty.call(cards[item.ref], spec.imported)) {
          throw new Error(`@${item.ref} has no ${spec.imported}`);
        }
      }
    }
  }
  return cards;
}

function importLines(imports: CardImport[]): string {
  return imports
    .map((item) => {
      if (item.kind === "namespace") {
        return `var ${item.local} = __cards[${JSON.stringify(item.ref)}];`;
      }
      return item.specs
        .map((spec) => `var ${spec.local} = __cards[${JSON.stringify(item.ref)}][${JSON.stringify(spec.imported)}];`)
        .join("\n");
    })
    .join("\n");
}

export function topLevelNames(source: string): string[] {
  try {
    const prepared = prepareSource(source);
    return unique([...analyzeSource(prepared.code).names, ...prepared.locals].filter(name => isIdent(name) && !RESERVED.has(name)));
  } catch {
    // Incomplete source is expected while the editor is open.
    return [];
  }
}

function isIdent(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name);
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function makeCanvas(width = 320, height = 180): HTMLCanvasElement {
  const el = document.createElement("canvas");
  el.width = Math.max(1, Math.round(width));
  el.height = Math.max(1, Math.round(height));
  return el;
}

function sketch(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
): HTMLCanvasElement {
  const el = makeCanvas(width, height);
  const ctx = el.getContext("2d");
  if (ctx) draw(ctx, el);
  return el;
}

function chart(
  values: Array<number | { label?: string; value: number }>,
  options?: { title?: string },
): ReturnType<typeof html> {
  const rows = values.map((v, i) =>
    typeof v === "number" ? { label: String(i + 1), value: v } : { label: v.label ?? String(i + 1), value: v.value },
  );
  const max = Math.max(...rows.map((r) => r.value), 1);
  const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // Rendered as HTML (not a baked PNG) so the bars and labels pick up the
  // output panel's theme colours via the .folio-chart styles.
  const bars = rows
    .map((row) => {
      const pct = Math.max(0, Math.min(100, (row.value / max) * 100));
      return `<div class="folio-chart-col"><div class="folio-chart-track"><div class="folio-chart-bar" style="height: ${pct.toFixed(2)}%"></div></div><div class="folio-chart-label">${esc(row.label)}</div></div>`;
    })
    .join("");
  const title = options?.title ? `<div class="folio-chart-title">${esc(options.title)}</div>` : "";
  return html(`<div class="folio-chart">${title}<div class="folio-chart-plot">${bars}</div></div>`);
}

export const KERNEL_HELPERS = [
  { name: "display(value)", hint: "rich output — html, canvas, tables, objects" },
  { name: "html`<b>markup</b>`", hint: "render HTML" },
  { name: "md`**markdown**`", hint: "render markdown" },
  { name: "table(array)", hint: "pretty table from objects" },
  { name: "canvas(w, h)", hint: "2D canvas — return it to show" },
  { name: "sketch(w, h, fn)", hint: "canvas plus a draw callback" },
  { name: "chart(values)", hint: "bar chart from numbers" },
  { name: "print(...args)", hint: "write to the cell output" },
  { name: "console.log", hint: "same as print" },
] as const;

const helpText = `Available in every code cell:
${KERNEL_HELPERS.map((row) => `  ${row.name.padEnd(18)} ${row.hint}`).join("\n")}

Top-level variables persist down the notebook.
Write @name for a value from earlier on this card.
import @card brings in another card under that handle.
The last expression in a cell is shown automatically.
Shift+Enter runs the cell.`;
