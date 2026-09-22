import { parse } from "@babel/parser";
import { transform } from "sucrase";
import catalog from "./catalog.json";

export type CompiledArtifact = { code: string; libraries: string[]; groups: string[] };
export function compileArtifact(source: string): CompiledArtifact {
  if (source.length > 200_000) throw new Error("Keep an artifact below 200,000 characters.");
  const ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"], allowAwaitOutsideFunction: true });
  const libraries = new Set<string>(["react", "react-dom/client"]);
  const include = (name: string) => {
    if (!Object.hasOwn(catalog, name)) throw new Error(`Library "${name}" is not included. Open Libraries for supported imports.`);
    libraries.add(name);
  };
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, any>;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source && node.importKind !== "type" && node.exportKind !== "type") include(node.source.value);
    if (node.type === "ImportExpression" || (node.type === "CallExpression" && node.callee?.type === "Import")) throw new Error("Use static imports at the top of the artifact instead of import().");
    if (node.type === "CallExpression" && node.callee?.name === "require") {
      if (node.arguments?.length !== 1 || node.arguments[0].type !== "StringLiteral") throw new Error("require() needs a literal library name.");
      include(node.arguments[0].value);
    }
    for (const [key, child] of Object.entries(node)) if (!["loc", "start", "end", "comments", "tokens"].includes(key)) visit(child);
  };
  visit(ast.program);
  const code = transform(source, { transforms: ["typescript", "jsx", "imports"], production: true, filePath: "artifact.tsx" }).code;
  const groups = new Set(["core", ...[...libraries].map((name) => catalog[name as keyof typeof catalog].group)]);
  if (groups.has("fiber")) groups.add("three");
  return { code, libraries: [...libraries], groups: ["core", "icons", "three", "fiber", "charts", "data", "math", "text"].filter((group) => groups.has(group)) };
}
