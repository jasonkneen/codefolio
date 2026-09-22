import { parse } from "@babel/parser";
import { transform } from "sucrase";
import catalog from "./catalog.json";
import type { CompiledArtifact } from "./compiler";

export type ProjectFile = { path: string; source: string };
export type ProjectBuild = CompiledArtifact & { paths: string[]; imports: Record<string, string[]>; commonJsPaths: string[] };

const extensions = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

function normalized(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw Error(`Import escapes the selected files: ${path}`);
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

export function resolveProjectImport(from: string, specifier: string, files: ReadonlySet<string>): string {
  if (!specifier.startsWith(".")) return specifier;
  const directory = from.split("/").slice(0, -1).join("/");
  const base = normalized(`${directory}/${specifier}`);
  const found = extensions.map(ext => `${base}${ext}`).find(candidate => files.has(candidate));
  if (!found) throw Error(`${from}: cannot resolve ${specifier}. Add that file to the canvas.`);
  return found;
}

/** Compile the reachable selected files as one browser module graph. No source file is rewritten. */
export function compileProject(files: ProjectFile[], entry: string): ProjectBuild {
  const sources = new Map<string, string>();
  for (const file of files) {
    const path = normalized(file.path);
    if (!path || path !== file.path.replaceAll("\\", "/")) throw Error(`Invalid source path: ${file.path}`);
    if (sources.has(path)) throw Error(`Duplicate source file: ${path}`);
    if (file.source.length > 200_000) throw Error(`${path} exceeds the 200,000 character limit.`);
    sources.set(path, file.source);
  }
  if (!sources.has(entry)) throw Error(`No source file ${entry} on this canvas.`);
  const names = new Set(sources.keys());
  const visited = new Set<string>();
  const libraries = new Set<string>(["react", "react-dom/client"]);
  const imports: Record<string, string[]> = {};
  const commonJsPaths = new Set<string>();
  const compiled: Record<string, string> = {};

  const visit = (path: string) => {
    if (visited.has(path)) return;
    visited.add(path);
    const source = sources.get(path)!;
    const ast = parse(source, { sourceType: "unambiguous", plugins: ["jsx", "typescript"], allowAwaitOutsideFunction: false });
    const dependencies: string[] = [];
    const inspect = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(inspect); return; }
      const node = value as Record<string, any>;
      if (node.type === "ImportExpression" || (node.type === "CallExpression" && node.callee?.type === "Import")) throw Error(`${path}: dynamic import() is not supported in previews.`);
      let specifier: string | undefined;
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source && node.importKind !== "type" && node.exportKind !== "type") specifier = node.source.value;
      if (node.type === "CallExpression" && node.callee?.name === "require") {
        commonJsPaths.add(path);
        if (node.arguments?.length !== 1 || node.arguments[0]?.type !== "StringLiteral") throw Error(`${path}: require() needs a literal module path.`);
        specifier = node.arguments[0].value;
      }
      if (node.type === "MemberExpression" && (node.object?.name === "module" || node.object?.name === "exports")) commonJsPaths.add(path);
      if (specifier) {
        const resolved = resolveProjectImport(path, specifier, names);
        if (resolved.startsWith(".")) throw Error(`${path}: cannot resolve ${specifier}.`);
        if (sources.has(resolved)) dependencies.push(resolved);
        else if (Object.hasOwn(catalog, resolved)) libraries.add(resolved);
        else throw Error(`${path}: package "${specifier}" is not available in the browser preview.`);
      }
      for (const [key, child] of Object.entries(node)) if (!["loc", "start", "end", "comments", "tokens"].includes(key)) inspect(child);
    };
    inspect(ast.program);
    imports[path] = [...new Set(dependencies)];
    compiled[path] = transform(source, { transforms: ["typescript", "jsx", "imports"], production: true, filePath: path }).code;
    for (const dependency of imports[path]) visit(dependency);
  };
  visit(entry);

  const payload = JSON.stringify(Object.fromEntries([...visited].map(path => [path, compiled[path]])));
  const code = `
const __projectSources = ${payload};
const __projectCache = Object.create(null);
const __projectLoad = (path) => {
  if (Object.hasOwn(__projectCache, path)) return __projectCache[path].exports;
  const source = __projectSources[path];
  if (source === undefined) return require(path);
  const loaded = { exports: {} };
  __projectCache[path] = loaded;
  const localRequire = (name) => {
    if (name.startsWith('.')) {
      const base = path.split('/').slice(0, -1).concat(name.split('/'));
      const parts = [];
      for (const item of base) { if (!item || item === '.') continue; if (item === '..') parts.pop(); else parts.push(item); }
      const candidate = parts.join('/');
      const match = [candidate, candidate + '.tsx', candidate + '.ts', candidate + '.jsx', candidate + '.js', candidate + '.mjs', candidate + '.cjs', candidate + '/index.tsx', candidate + '/index.ts', candidate + '/index.jsx', candidate + '/index.js'].find(key => Object.hasOwn(__projectSources, key));
      if (!match) throw Error(path + ': cannot resolve ' + name);
      return __projectLoad(match);
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', 'React', 'mount', 'render', 'onCleanup', 'inputs', source)(localRequire, loaded, loaded.exports, React, mount, render, onCleanup, inputs);
  return loaded.exports;
};
module.exports = __projectLoad(${JSON.stringify(entry)});
`;
  const groups = new Set(["core", ...[...libraries].map(name => catalog[name as keyof typeof catalog].group)]);
  if (groups.has("fiber")) groups.add("three");
  return { code, libraries: [...libraries], groups: ["core", "icons", "three", "fiber", "charts", "data", "math", "text"].filter(group => groups.has(group)), paths: [...visited], imports, commonJsPaths: [...commonJsPaths] };
}
