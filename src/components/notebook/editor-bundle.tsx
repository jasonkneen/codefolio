import { editorPresence } from "./editor-presence";
import { updatePresence, useCollaboration } from "@/lib/collaboration/client";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { useFolioStore } from "@/lib/notebook/store";
import { referenceOptions } from "@/lib/notebook/cell-references";
import { useProductPanels } from "@/lib/ai/ui";
import { actionPrefix, editorActions } from "@/lib/ai/editor-actions";
import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { paperEditorTheme } from "./editor-theme";
import type { NotebookEditorProps } from "./lazy-editor";

export default function Editor(props: NotebookEditorProps) {
  const peers = useCollaboration(s => s.peers);
  const extensions = useMemo(() => [
    props.language === "markdown" ? markdown() : javascript({ jsx: props.language === "tsx", typescript: props.language === "tsx" }),
    autocompletion({ override: [context => {
      const line = context.state.doc.lineAt(context.pos);
      const prefix = actionPrefix(context.state.sliceDoc(line.from, context.pos));
      const match = context.matchBefore(/@[\w$.]*/);
      if (!prefix && !match) return null;
      const from = prefix ? context.pos - prefix.length : match!.from;
      const options = prefix ? editorActions.filter(action => action.label.startsWith(prefix)).map(action => ({
        label: action.label, type: "function", detail: action.detail,
        apply: (view: EditorView, _completion: unknown, start: number, end: number) => {
          // Remove only the typed shortcut. Existing source remains available as context.
          view.dispatch({ changes: { from: start, to: end, insert: "" } });
          useProductPanels.getState().compose({ nodeId: props.nodeId, cellId: props.cellId, prompt: action.prompt, provider: action.provider });
        },
      })) : [];
      return { from, options: [
        ...options,
        ...(match && props.language === "javascript" ? referenceOptions(useFolioStore.getState().nodes).map(o => ({ label: o.label, type: "variable", detail: o.detail })) : []),
      ], validFor: /^[\w@/$.]*$/ };
    }] }),
    ...editorPresence(props.nodeId, props.cellId, peers),
    EditorView.lineWrapping, EditorView.contentAttributes.of({ "aria-label": props.label }), paperEditorTheme,
    Prec.highest(keymap.of([...completionKeymap, { key: "Shift-Enter", run: () => { if (!props.onRun) return false; props.onRun(); return true; } }])),
  ], [props.language, props.label, props.onRun, props.nodeId, props.cellId, peers]);
  return <CodeMirror value={props.value} onChange={props.onChange} onBlur={() => { updatePresence("selection", null); props.onBlur?.(); }} autoFocus={props.autoFocus} height="auto" minHeight="44px" maxHeight={props.maxHeight} theme="none" placeholder={props.placeholder} extensions={extensions} basicSetup={{ lineNumbers: props.language !== "markdown", foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, autocompletion: false, tabSize: 2 }} />;
}
