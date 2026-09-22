import { type ReactNode, useMemo } from "react";
import { isImageSource, sanitizeOutputHtml } from "@/lib/notebook/output-safety";
import type { CellOutput, Display } from "@/lib/notebook/types";
import { cn } from "@/lib/utils";

export function CellOutputView({ output, running = false, theme, themeControl }: { output: CellOutput | null; running?: boolean; theme?: "light" | "dark"; themeControl?: ReactNode }) {
  output ??= { logs: [], displays: [] };
  const hasLogs = output.logs.length > 0;

  return (
    <div className="folio-output" data-panel-theme={theme} aria-busy={running}>
      <div className="folio-output-divider">{themeControl && <div className="folio-preview-theme-control">{themeControl}</div>}<span role="status" className="folio-output-label">{running && <span className="folio-output-spinner" aria-hidden="true" />}{running ? "running" : "return"}</span></div>
      {hasLogs ? (
        <div className="folio-logs">
          {output.logs.map((line, i) => (
            <pre key={i} className={cn("folio-log", line.level === "error" && "is-error", line.level === "warn" && "is-warn")}>
              {line.text}
            </pre>
          ))}
        </div>
      ) : null}
      {output.displays.map((d, i) => (
        <DisplayView key={i} display={d} />
      ))}
    </div>
  );
}

function DisplayView({ display }: { display: Display }) {
  switch (display.kind) {
    case "text":
      return <pre className="folio-result">{display.text}</pre>;
    case "json":
      return <pre className="folio-result is-json">{display.json}</pre>;
    case "html":
      return (
        <HtmlOutput html={display.html} />
      );
    case "image":
      if (!isImageSource(display.src)) return <p className="folio-error">Unsupported image address.</p>;
      return (
        <img
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="folio-image"
          src={display.src}
          alt={display.alt || "cell output"}
        />
      );
    case "table":
      return (
        <div className="folio-table-wrap">
          <table className="folio-table">
            <thead>
              <tr>
                {display.columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {display.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "error":
      return (
        <div className="folio-error">
          <div className="folio-error-msg">{display.message}</div>
          {display.stack ? <pre className="folio-error-stack">{firstStackLines(display.stack)}</pre> : null}

        </div>
      );
    default:
      return null;
  }
}

function firstStackLines(stack: string): string {
  return stack.split("\n").slice(0, 4).join("\n");
}

function HtmlOutput({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeOutputHtml(html), [html]);
  return <div className="folio-html" dangerouslySetInnerHTML={{ __html: clean }} />;
}
