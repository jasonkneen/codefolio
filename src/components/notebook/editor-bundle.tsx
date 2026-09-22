import { autocompletion } from "@codemirror/autocomplete";
import { useFolioStore } from "@/lib/notebook/store";
import { referenceOptions } from "@/lib/notebook/cell-references";
import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { paperEditorTheme } from "./editor-theme";
import type { NotebookEditorProps } from "./lazy-editor";

export default function Editor(props: NotebookEditorProps) {
  const extensions = useMemo(() => [
    props.language === "markdown" ? markdown() : javascript({ jsx: props.language === "tsx", typescript: props.language === "tsx" }),
    ...(props.language === 'javascript' ? [autocompletion({ override: [context => {
      const match = context.matchBefore(/@[\w$.]*/);
      if (!match) return null;
      return { from: match.from, options: referenceOptions(useFolioStore.getState().nodes).map(o => ({ label: o.label, type: 'variable', detail: o.detail })), validFor: /^@[\w$.]*$/ };
    }] })] : []),
    EditorView.lineWrapping, EditorView.contentAttributes.of({ "aria-label": props.label }), paperEditorTheme,
    Prec.highest(keymap.of([{ key: "Shift-Enter", run: () => { if (!props.onRun) return false; props.onRun(); return true; } }])),
  ], [props.language, props.label, props.onRun]);
  return <CodeMirror value={props.value} onChange={props.onChange} onBlur={props.onBlur} autoFocus={props.autoFocus} height="auto" minHeight="44px" maxHeight={props.maxHeight} theme="none" placeholder={props.placeholder} extensions={extensions} basicSetup={{ lineNumbers: props.language !== "markdown", foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, autocompletion: false, tabSize: 2 }} />;
}
