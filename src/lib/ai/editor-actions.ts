import type { Provider } from "./protocol";
export const editorActions: { label: string; detail: string; prompt: string; provider?: Provider }[] = [
  { label: "@claude", detail: "Ask Claude about this cell", prompt: "Help me with this cell.", provider: "claude" },
  { label: "@codex", detail: "Ask Codex about this cell", prompt: "Help me with this cell.", provider: "codex" },
  { label: "@agent", detail: "Ask the selected assistant", prompt: "Help me with this cell." },
  { label: "/ask", detail: "Draft a question about this cell", prompt: "Help me with this cell." },
  { label: "/explain", detail: "Explain this cell", prompt: "Explain this cell." },
  { label: "/repair", detail: "Propose a repair", prompt: "Find errors in this cell and propose a repair." },
  { label: "/generate", detail: "Draft new notebook content", prompt: "Propose a useful new cell after this cell." },
];
/** Slash actions occupy their own line so division, URLs and regex literals remain code. */
export function actionPrefix(lineBeforeCursor: string): string | null {
  return /^\s*([/@][\w]*)$/.exec(lineBeforeCursor)?.[1] ?? null;
}
