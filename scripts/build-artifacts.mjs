import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(join(root, "src/lib/artifacts/catalog.json"), "utf8"));
const output = join(root, "public/folio-runtime");
await mkdir(output, { recursive: true });
const groups = ["core", "icons", "three", "fiber", "charts", "data", "math", "text"];
const manifest = { groups: {}, versions: {} };
for (const name of Object.keys(catalog)) {
  const packageName = name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
  manifest.versions[name] = JSON.parse(await readFile(join(root, "node_modules", packageName, "package.json"), "utf8")).version;
}
for (const group of groups) {
  const names = Object.keys(catalog).filter((name) => catalog[name].group === group);
  const entries = names.map((name, i) => `import * as lib${i} from ${JSON.stringify(name)};`).join("\n");
  const register = names.map((name, i) => `globalThis.__folioLibraries[${JSON.stringify(name)}] = { ...lib${i}, __esModule: true };`).join("\n");
  const result = await build({
    stdin: { contents: `${entries}\nglobalThis.__folioLibraries ??= Object.create(null);\n${register}`, resolveDir: root },
    bundle: true, minify: true, format: "iife", platform: "browser", target: "es2022", write: false,
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "shared-artifact-libraries", setup(builder) {
      builder.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?|three)$/ }, (args) => {
        if (catalog[args.path] && catalog[args.path].group !== group) return { path: args.path, namespace: "folio-shared" };
      });
      builder.onLoad({ filter: /.*/, namespace: "folio-shared" }, (args) => ({ contents: `module.exports = globalThis.__folioLibraries[${JSON.stringify(args.path)}];`, loader: "js" }));
    } }],
  });
  const content = result.outputFiles[0].contents;
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const filename = `${group}-${hash}.js`;
  await writeFile(join(output, filename), content);
  manifest.groups[group] = filename;
  console.log(`[artifacts] ${group}: ${Math.round(content.length / 1024)} KB`);
}
const kernelBuild = await build({ entryPoints: [join(root, "src/lib/notebook/kernel-frame.ts")], bundle: true, minify: true, format: "iife", platform: "browser", target: "es2022", write: false });
const kernelBytes = kernelBuild.outputFiles[0].contents;
manifest.kernel = `kernel-${createHash("sha256").update(kernelBytes).digest("hex").slice(0, 16)}.js`;
await writeFile(join(output, manifest.kernel), kernelBytes);
await cp(join(root, "node_modules/katex/dist/fonts"), join(output, "fonts"), { recursive: true });
await cp(join(root, "node_modules/katex/dist/katex.min.css"), join(output, "katex.css"));
await writeFile(join(output, "manifest.json"), JSON.stringify(manifest));
