import type { CompiledArtifact } from "./compiler";

// This trusted bootstrap is hashed into CSP. User code is sent as data only
// after the opaque-origin frame has loaded its allowlisted library scripts.
export const BOOTSTRAP = String.raw`
(() => {
  let session = null;
  let started = false;
  let root = null;
  const cleanups = [];
  const mount = document.getElementById('artifact-root');
  const send = (type, value) => { if (session) parent.postMessage({ folioArtifact: session, type, value }, '*'); };
  const error = (value) => {
    const message = String(value && value.message || value || 'Artifact failed').slice(0, 4000);
    send('error', message);
    const pre = document.createElement('pre'); pre.textContent = message; pre.style.whiteSpace = 'pre-wrap';
    mount.replaceChildren(pre);
  };
  const theme = (values) => {
    for (const [key, value] of Object.entries(values || {})) {
      if (/^--(?:color-|font-)/.test(key) && typeof value === 'string') document.documentElement.style.setProperty(key, value);
    }
  };
  addEventListener('error', event => { if (started) error(event.error || event.message || 'A library failed to load'); });
  addEventListener('unhandledrejection', event => { if (started) error(event.reason); });
  addEventListener('message', async event => {
    if (event.source !== parent || !event.data || typeof event.data.id !== 'string') return;
    if (event.data.type === 'theme' && event.data.id === session) { theme(event.data.theme); return; }
    if (event.data.type === 'dispose' && event.data.id === session) {
      try { root?.unmount(); } catch {}
      for (const dispose of cleanups.splice(0)) { try { dispose(); } catch {} }
      return;
    }
    if (event.data.type !== 'start' || started) return;
    started = true; session = event.data.id; theme(event.data.theme);
    try {
      const require = name => {
        const value = globalThis.__folioLibraries?.[name];
        if (!value) throw Error('Library not loaded: ' + name);
        return value;
      };
      const React = require('react');
      const ReactDOM = require('react-dom/client');
      class Boundary extends React.Component {
        constructor(props) { super(props); this.state = { error: null }; }
        static getDerivedStateFromError(error) { return { error }; }
        componentDidCatch(e) { send('error', String(e.message).slice(0, 4000)); }
        render() { return this.state.error ? React.createElement('pre', null, this.state.error.message) : this.props.children; }
      }
      const render = element => {
        root ??= ReactDOM.createRoot(mount);
        root.render(React.createElement(Boundary, null, element));
      };
      const module = { exports: {} };
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      await new AsyncFunction('require', 'module', 'exports', 'React', 'mount', 'render', 'onCleanup', 'inputs', event.data.code)(require, module, module.exports, React, mount, render, fn => { if (typeof fn === 'function') cleanups.push(fn); }, event.data.inputs || {});
      const component = module.exports.default;
      if (typeof component === 'function' || (component && typeof component === 'object' && !React.isValidElement(component))) render(React.createElement(component, event.data.inputs || {}));
      else if (React.isValidElement(component)) render(component);
      requestAnimationFrame(() => send('ready', true));
    } catch (e) { error(e); }
  });
})();`;

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
export type ArtifactManifest = { groups: Record<string, string>; versions: Record<string, string> };
export function validateManifest(value: unknown): ArtifactManifest {
  if (!value || typeof value !== "object") throw new Error("Artifact libraries are unavailable. Rebuild the app.");
  const manifest = value as ArtifactManifest;
  if (!manifest.groups || !manifest.versions) throw new Error("Invalid artifact library manifest.");
  for (const [group, filename] of Object.entries(manifest.groups)) {
    if (!/^(core|icons|three|fiber|charts|data|math|text)$/.test(group) || typeof filename !== "string" || !new RegExp(`^${group}-[a-f0-9]{16}\\.js$`).test(filename)) throw new Error("Invalid artifact library path.");
  }
  return manifest;
}
export async function artifactDocument(compiled: CompiledArtifact, network: boolean, manifest: ArtifactManifest, origin: string): Promise<string> {
  const base = new URL("/folio-runtime/", origin).href;
  const scripts = compiled.groups.map((group) => {
    const filename = manifest.groups[group];
    if (!filename) throw new Error(`Missing ${group} libraries. Rebuild the app.`);
    return new URL(filename, base).href;
  });
  const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(BOOTSTRAP)))));
  const csp = [
    "default-src 'none'", `script-src 'unsafe-eval' 'sha256-${hash}' ${scripts.join(" ")}`,
    `style-src 'unsafe-inline' ${base}katex.css`, `font-src ${base}fonts/ data:`,
    "img-src https: http: data: blob:", `connect-src ${network ? "https: http: data: blob:" : "'none'"}`,
    "worker-src blob:", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join("; ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;min-height:100%;background:var(--color-paper,#fff);color:var(--color-ink,#222);font-family:var(--font-sans,system-ui)}*{box-sizing:border-box}body{padding:16px}button,input,select{font:inherit}button{cursor:pointer}img,svg,canvas{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}#artifact-root{min-height:40px}</style>${compiled.groups.includes("text") ? `<link rel="stylesheet" href="${escapeAttribute(base)}katex.css">` : ""}</head><body><div id="artifact-root"></div><script>${BOOTSTRAP}</script>${scripts.map((url) => `<script src="${escapeAttribute(url)}"></script>`).join("")}</body></html>`;
}
