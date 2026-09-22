import { Component, lazy, Suspense, type ReactNode } from "react";

export type NotebookEditorProps = {
  value: string;
  onChange: (source: string) => void;
  language: "javascript" | "markdown" | "tsx";
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  maxHeight?: string;
  onBlur?: () => void;
  onRun?: () => void;
};
const Editor = lazy(() => import("./editor-bundle"));
function PlainEditor(props: NotebookEditorProps) {
  return <textarea className="folio-editor-fallback" aria-label={props.label} value={props.value} onChange={event => props.onChange(event.target.value)} placeholder={props.placeholder} autoFocus={props.autoFocus} onBlur={props.onBlur} onKeyDown={event => {
    if (event.key === "Enter" && event.shiftKey && props.onRun) { event.preventDefault(); event.stopPropagation(); props.onRun(); }
  }} />;
}
class EditorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function NotebookEditor(props: NotebookEditorProps) {
  const fallback = <PlainEditor {...props} />;
  return <EditorBoundary fallback={fallback}><Suspense fallback={fallback}><Editor {...props} /></Suspense></EditorBoundary>;
}
