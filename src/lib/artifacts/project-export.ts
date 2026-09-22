import { strToU8, zipSync, type Zippable } from "fflate";
import type { ArtifactManifest } from "./frame";
import { compileProject, type ProjectFile } from "./project-compiler";

export type ProjectBuildManifest = { format: string; entry: string; generatedEntry: string; modules: string[]; imports: Record<string, string[]>; dependencies: Record<string, string>; documentation: string[] };
export type ProjectExport = { filename: string; bytes: Uint8Array; files: string[]; manifest: ProjectBuildManifest };

function packageName(specifier: string): string {
  return specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
}

function sourceImport(from: string, to: string): string {
  const depth = from.split("/").length - 1;
  return `${"../".repeat(depth)}${to}`;
}

function uniqueGeneratedDir(paths: ReadonlySet<string>): string {
  let name = "codefolio.generated";
  for (let index = 2; [...paths].some(path => path.startsWith(`${name}/`)); index++) name = `codefolio.generated-${index}`;
  return name;
}

function stableJson(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }
function comparePaths(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function projectFiles(files: ProjectFile[], entry: string, runtime: ArtifactManifest, notes: Readonly<Record<string, string>>): { contents: Record<string, string>; manifest: ProjectBuildManifest } {
  const build = compileProject(files, entry);
  if (build.commonJsPaths.length) throw Error(`Repository export needs ES modules. Convert require/module.exports in ${build.commonJsPaths.join(", ")} first.`);
  const paths = new Set(files.map(file => file.path));
  const generated = uniqueGeneratedDir(paths);
  const entryPath = `${generated}/entry.tsx`;
  const configPath = `${generated}/vite.config.mjs`;
  const testPath = `${generated}/build.test.ts`;
  const dependencies: Record<string, string> = {};
  for (const name of new Set(["react", "react-dom", ...build.libraries].map(packageName))) {
    const version = runtime.versions[name] ?? runtime.versions[build.libraries.find(value => packageName(value) === name) ?? ""];
    if (!version) throw Error(`The installed version of ${name} is unavailable. Rebuild the Codefolio preview libraries.`);
    dependencies[name] = version;
  }
  const documentation = files.filter(file => notes[file.path]?.trim()).map(file => `docs/source/${file.path}.md`).sort();
  const manifest: ProjectBuildManifest = {
    format: "codefolio-source-build-v1",
    entry,
    generatedEntry: entryPath,
    modules: [...build.paths].sort(),
    imports: Object.fromEntries(Object.entries(build.imports).sort(([a], [b]) => comparePaths(a, b)).map(([path, imports]) => [path, [...imports].sort()])),
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => comparePaths(a, b))),
    documentation,
  };
  const contents: Record<string, string> = {};
  for (const file of files) contents[file.path] = file.source;
  for (const file of files) if (notes[file.path]?.trim()) contents[`docs/source/${file.path}.md`] = `${notes[file.path].trim()}\n`;
  contents["package.json"] = stableJson({
    name: "codefolio-export", private: true, type: "module",
    scripts: {
      dev: `vite --config ${configPath}`,
      build: `vite build --config ${configPath}`,
      preview: `vite preview --config ${configPath}`,
      test: "bun test",
    },
    dependencies: manifest.dependencies,
    devDependencies: { "@vitejs/plugin-react": "5.2.0", "@types/react": "19.2.18", "@types/react-dom": "19.2.5", "typescript": "5.9.3", "vite": "8.2.2" },
  });
  contents["index.html"] = `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Codefolio export</title></head><body><div id="root"></div><script type="module" src="/${entryPath}"></script></body></html>\n`;
  contents[entryPath] = `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport * as entry from ${JSON.stringify(sourceImport(entryPath, entry))};\n\nconst component = entry.default;\nif (component) {\n  const root = document.getElementById("root");\n  if (!root) throw Error("Missing root element");\n  createRoot(root).render(React.isValidElement(component) ? component : React.createElement(component));\n}\n`;
  contents[configPath] = `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()], server: { port: 8284, strictPort: true }, preview: { port: 8285, strictPort: true }, build: { outDir: "dist" } });\n`;
  contents[testPath] = `import { test, expect } from "bun:test";\nimport { resolve } from "node:path";\n\ntest("the selected module graph bundles for the browser", async () => {\n  const result = await Bun.build({ entrypoints: [resolve(${JSON.stringify(entryPath)})], target: "browser" });\n  expect(result.success).toBe(true);\n  expect(result.outputs.length).toBeGreaterThan(0);\n});\n`;
  contents["codefolio.build.json"] = stableJson(manifest);
  contents["README.md"] = `# Codefolio source build\n\nThis project was exported from source notebooks. The selected entry is \`${entry}\`; its reachable files are listed in \`codefolio.build.json\`. All imported source files are included. Notebook notes are under \`docs/source/\`.\n\n\`\`\`sh\nbun install\nbun run dev\nbun run build\nbun run preview\nbun run test\n\`\`\`\n\nThe dev server uses port 8284 and the built preview uses 8285. The build output is in \`dist/\`. Edit the source files directly; the generated entry and Vite configuration live in \`${generated}/\`. Run \`bun run build\` to check the browser bundle before publishing it.\n`;
  contents[".gitignore"] = "node_modules/\ndist/\n";
  return { contents, manifest };
}

export function exportProject(files: ProjectFile[], entry: string, runtime: ArtifactManifest, notes: Readonly<Record<string, string>> = {}): ProjectExport {
  const { contents, manifest } = projectFiles(files, entry, runtime, notes);
  const mtime = new Date("1980-01-01T00:00:00.000Z");
  const archive: Zippable = Object.fromEntries(Object.entries(contents).sort(([a], [b]) => comparePaths(a, b)).map(([path, content]) => [path, [strToU8(content), { mtime, level: 6 }] as const]));
  const bytes = zipSync(archive);
  return { filename: "codefolio-project.zip", bytes, files: Object.keys(contents).sort(), manifest };
}

export function downloadProject(project: ProjectExport): void {
  const blob = new Blob([project.bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = project.filename;
  link.rel = "noopener";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
