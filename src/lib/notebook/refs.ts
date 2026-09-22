import { tokenizer } from "acorn";
import type { FolioNode } from "./types";

export type NamedSpec = { imported: string; local: string };

export type CardImport =
  | { kind: "namespace"; ref: string; local: string }
  | { kind: "named"; ref: string; specs: NamedSpec[] };

export type SourcePart = { type: "text"; text: string } | { type: "ref"; name: string };

const IMPORT_NS = /^\s*import\s+@([A-Za-z_$][\w$]*)\s*;?\s*(?:\/\/.*)?$/;
const IMPORT_NAMED = /^\s*import\s*\{([^}]*)\}\s*from\s+@([A-Za-z_$][\w$]*)\s*;?\s*(?:\/\/.*)?$/;
const IMPORT_STAR = /^\s*import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s+@([A-Za-z_$][\w$]*)\s*;?\s*(?:\/\/.*)?$/;

/** Cards the line points at. The card on the start of the line is the parent. */
export function downstreamOf(edges: { source: string; target: string }[], nodeId: string): string[] {
  const ids: string[] = [];
  for (const edge of edges) {
    if (edge.source !== nodeId || !edge.target || edge.target === nodeId) continue;
    if (!ids.includes(edge.target)) ids.push(edge.target);
  }
  return ids;
}

export function isRef(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

/** Turn a title into a handle: "Getting started" → gettingStarted. */
export function slugRef(input: string): string {
  const parts = input
    .trim()
    .replace(/[^A-Za-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "card";
  const raw = parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) return lower;
      return lower.slice(0, 1).toUpperCase() + lower.slice(1);
    })
    .join("");
  const ident = /^[A-Za-z_$]/.test(raw) ? raw : `card${raw}`;
  return ident.replace(/[^\w$]/g, "") || "card";
}

export function uniqueRef(base: string, taken: Set<string>): string {
  const root = isRef(base) ? base : slugRef(base);
  let ref = root;
  let n = 2;
  while (taken.has(ref)) {
    ref = `${root}${n}`;
    n += 1;
  }
  taken.add(ref);
  return ref;
}

export function assignRefs<T extends FolioNode>(nodes: T[]): T[] {
  const taken = new Set<string>();
  return nodes.map((node) => {
    const title = node.data.title || "Untitled notebook";
    const requested = typeof node.data.ref === "string" && node.data.ref ? node.data.ref : slugRef(title);
    const ref = uniqueRef(requested, taken);
    return { ...node, data: { ...node.data, title, ref } };
  });
}

export function splitAtRefs(source: string): SourcePart[] {
  const parts: SourcePart[] = [];
  let end = 0;
  // A same-length identifier prefix lets Acorn distinguish executable references
  // from regexes, comments, strings, and the literal portions of templates.
  const tokens = tokenizer(source.replace(/@/g, '$'), { ecmaVersion: 'latest' });
  try {
    while (true) {
      const token = tokens.getToken();
      if (token.type.label === 'eof') break;
      if (token.type.label !== 'name' || source[token.start] !== '@') continue;
      const name = source.slice(token.start + 1, token.end);
      if (!isRef(name)) continue;
      if (token.start > end) parts.push({ type: 'text', text: source.slice(end, token.start) });
      parts.push({ type: 'ref', name });
      end = token.end;
    }
  } catch { /* Incomplete source while typing: preserve the unfinished tail. */ }
  if (end < source.length) parts.push({ type: 'text', text: source.slice(end) });
  return parts;
}

export function eraseAtSigils(source: string): string {
  return splitAtRefs(source)
    .map((part) => (part.type === "text" ? part.text : part.name))
    .join("");
}

export function replaceRef(source: string, from: string, to: string): string {
  if (from === to) return source;
  return splitAtRefs(source)
    .map((part) => {
      if (part.type === "text") return part.text;
      return `@${part.name === from ? to : part.name}`;
    })
    .join("");
}

export function prepareSource(source: string): { code: string; imports: CardImport[]; locals: string[] } {
  const lines = source.split("\n");
  const imports: CardImport[] = [];
  const locals: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*import\b/.test(lines[i]) || !lines[i].includes("@")) continue;
    const parsed = parseImportLine(lines[i]);
    if (!parsed) {
      lines[i] = `throw new Error("Write import @card, or import { name } from @card")`;
      continue;
    }
    imports.push(parsed);
    if (parsed.kind === "namespace") locals.push(parsed.local);
    else parsed.specs.forEach((spec) => locals.push(spec.local));
    lines[i] = "";
  }
  return { code: eraseAtSigils(lines.join("\n")), imports, locals };
}

export function describeValue(value: unknown): string {
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value === "string") return JSON.stringify(clip(value, 180));
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" || value == null) {
    return String(value);
  }
  if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) return "[canvas]";
  if (Array.isArray(value)) {
    const inner = value.slice(0, 8).map((item) => oneLine(item));
    const more = value.length > 8 ? `, … ${value.length} items` : "";
    return `[${inner.join(", ")}${more}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines = entries.slice(0, 10).map(([key, item]) => `${key}: ${oneLine(item)}`);
    if (entries.length > 10) lines.push(`… ${entries.length - 10} more`);
    return lines.join("\n");
  }
  return String(value);
}

function parseImportLine(line: string): CardImport | null {
  const star = IMPORT_STAR.exec(line);
  if (star) return { kind: "namespace", local: star[1], ref: star[2] };
  const named = IMPORT_NAMED.exec(line);
  if (named) {
    const specs = parseSpecs(named[1]);
    if (!specs) return null;
    return { kind: "named", ref: named[2], specs };
  }
  const ns = IMPORT_NS.exec(line);
  if (ns) return { kind: "namespace", ref: ns[1], local: ns[1] };
  return null;
}

function parseSpecs(raw: string): NamedSpec[] | null {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const specs: NamedSpec[] = [];
  for (const part of parts) {
    const match = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(part);
    if (!match) return null;
    specs.push({ imported: match[1], local: match[2] || match[1] });
  }
  return specs;
}

function oneLine(value: unknown): string {
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value === "string") return JSON.stringify(clip(value, 48));
  if (value == null || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) return "[canvas]";
  if (typeof value === "object") return "{…}";
  return String(value);
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
