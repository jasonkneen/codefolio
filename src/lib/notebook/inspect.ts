import type { Display } from "./types";

const RICH = "__folio";

export type HtmlValue = { [RICH]: "html"; html: string };
export type MdValue = { [RICH]: "md"; markdown: string };
export type TableValue = {
  [RICH]: "table";
  columns: string[];
  rows: string[][];
};

export function isHtmlValue(v: unknown): v is HtmlValue {
  return isRecord(v) && v[RICH] === "html" && typeof v.html === "string";
}

export function isMdValue(v: unknown): v is MdValue {
  return isRecord(v) && v[RICH] === "md" && typeof v.markdown === "string";
}

export function isTableValue(v: unknown): v is TableValue {
  return isRecord(v) && v[RICH] === "table";
}

export function html(strings: TemplateStringsArray | string, ...values: unknown[]): HtmlValue {
  const markup =
    typeof strings === "string"
      ? strings
      : strings.reduce((acc, chunk, i) => acc + chunk + (i < values.length ? String(values[i]) : ""), "");
  return { [RICH]: "html", html: markup };
}

export function md(strings: TemplateStringsArray | string, ...values: unknown[]): MdValue {
  const markdown =
    typeof strings === "string"
      ? strings
      : strings.reduce((acc, chunk, i) => acc + chunk + (i < values.length ? String(values[i]) : ""), "");
  return { [RICH]: "md", markdown };
}

export function table(data: unknown): TableValue {
  if (isTableValue(data)) return data;
  if (!Array.isArray(data) || data.length === 0) {
    return { [RICH]: "table", columns: [], rows: [] };
  }
  if (data.every((row) => isRecord(row))) {
    const columns: string[] = [];
    for (const row of data) {
      for (const key of Object.keys(row)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }
    const rows = data.map((row) => columns.map((col) => stringifyCell((row as Record<string, unknown>)[col])));
    return { [RICH]: "table", columns, rows };
  }
  return {
    [RICH]: "table",
    columns: ["value"],
    rows: data.map((v) => [stringifyCell(v)]),
  };
}

export function inspect(value: unknown): Display {
  if (value === undefined) return { kind: "text", text: "undefined" };
  if (value === null) return { kind: "text", text: "null" };
  if (typeof value === "string") return { kind: "text", text: value };
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return { kind: "text", text: String(value) };
  }
  if (typeof value === "symbol") return { kind: "text", text: value.toString() };
  if (typeof value === "function") {
    return { kind: "text", text: `[Function ${value.name || "anonymous"}]` };
  }
  if (isHtmlValue(value)) return { kind: "html", html: value.html };
  if (isMdValue(value)) return { kind: "html", html: renderLiteMarkdown(value.markdown) };
  if (isTableValue(value)) return { kind: "table", columns: value.columns, rows: value.rows };
  if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) {
    try {
      return { kind: "image", src: value.toDataURL(), alt: "canvas" };
    } catch {
      return { kind: "text", text: "[canvas]" };
    }
  }
  if (typeof HTMLImageElement !== "undefined" && value instanceof HTMLImageElement) {
    return { kind: "image", src: value.src, alt: value.alt || "image" };
  }
  if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) {
    return { kind: "html", html: value.outerHTML };
  }
  if (value instanceof Error) {
    return { kind: "error", message: value.message, stack: value.stack };
  }
  if (value instanceof Date) return { kind: "text", text: value.toISOString() };
  if (Array.isArray(value) && value.length > 0 && value.every((row) => isRecord(row) && !isRich(row))) {
    const t = table(value);
    return { kind: "table", columns: t.columns, rows: t.rows };
  }
  return { kind: "json", json: safeJson(value) };
}

export function inspectLogArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (typeof arg === "number" || typeof arg === "boolean" || arg == null) return String(arg);
      return safeJson(arg);
    })
    .join(" ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isRich(v: unknown): boolean {
  return isRecord(v) && typeof v[RICH] === "string";
}

function stringifyCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  return safeJson(v);
}

function safeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_key, val: unknown) => {
        if (typeof val === "bigint") return `${val}n`;
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      },
      2,
    );
  } catch {
    return String(value);
  }
}

function renderLiteMarkdown(src: string): string {
  const escaped = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br />");
}
