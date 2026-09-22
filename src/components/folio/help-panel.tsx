import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KERNEL_HELPERS } from "@/lib/notebook/runtime";
import { useFolioUi } from "@/lib/notebook/ui";

const SHORTCUTS = [
  { keys: "Shift + Enter", does: "Run the current code cell" },
  { keys: "⌘/Ctrl + A", does: "Select all notebooks on the desk; in an editor, select its text" },
  { keys: "Delete / Backspace", does: "Delete selected notebooks after confirmation" },
  { keys: "Double-click desk", does: "Drop a new notebook" },
  { keys: "Double-click title", does: "Focus the page" },
  { keys: "Drag header", does: "Move the page" },
  { keys: "?", does: "Open this panel" },
];

export function HelpPanel() {
  const open = useFolioUi((s) => s.helpOpen);
  const close = useFolioUi((s) => s.closeHelp);
  const toggle = useFolioUi((s) => s.toggleHelp);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "?" && event.key !== "/") return;
      if (event.key === "/" && !event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, toggle]);

  if (!open) return null;

  return (
    <div className="folio-help-scrim" onClick={close}>
      <aside
        className="folio-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folio-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="folio-help-head">
          <div>
            <p className="folio-help-kicker">Public beta</p>
            <h2 id="folio-help-title">On the desk</h2>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={close} aria-label="Close help">
            <X />
          </Button>
        </header>

        <div className="folio-help-body">
          <section>
            <h3>Shortcuts</h3>
            <dl className="folio-help-dl">
              {SHORTCUTS.map((row) => (
                <div key={row.keys}>
                  <dt>{row.keys}</dt>
                  <dd>{row.does}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3>Named cells &amp; inputs</h3>
            <p>Every cell has a variable name. Click it to rename. In code, type <code>@</code> to choose a value such as <code>@research.image1.src</code> or <code>@research.note1</code>.</p>
            <p>Notes expose text; images expose their source, alt text, caption, and dimensions. Code exposes its last expression after you run it. Renaming a cell updates its references.</p>
            <p>Connect artifact inputs below its toolbar, then receive them as component props or through <code>inputs</code>. Changed inputs need an explicit Run to update the preview. The “Connected image &amp; caption” example shows how.</p>
          </section>
          <section>
            <h3>In every code cell</h3>
            <dl className="folio-help-dl is-mono">
              {KERNEL_HELPERS.map((row) => (
                <div key={row.name}>
                  <dt>
                    <code>{row.name}</code>
                  </dt>
                  <dd>{row.hint}</dd>
                </div>
              ))}
            </dl>
            <p className="folio-help-note">
              Top-level variables persist down the page. <code>@name</code> is a value from earlier on this card —
              a chip until you click the cell. Hover the chip to preview it. <code>import @card</code> brings in
              another card by the reference in its header. Run all follows the lines out of a card and runs those
              cards next.
            </p>
          </section>

          <section>
            <h3>This beta</h3>
            <p>
              Pages live in this browser, not in an account. The kernel runs your JavaScript here, in the page.
              Export the desk if you want a file you can bring back later.
            </p>
            <p>Import selected JavaScript or TypeScript files from the desk menu to make source notebooks. Their paths stay attached to the notebooks; reimporting a path refreshes its source while keeping your notes. Canvas preview resolves relative imports and walks through the loaded modules. Build project downloads a runnable Bun and Vite project with the source files and build scripts.</p>
          </section>
        </div>
      </aside>
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest(".cm-editor, .cm-content"));
}
