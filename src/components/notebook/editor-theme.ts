import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const colors = {
  ink: "var(--color-ink)",
  muted: "var(--color-muted)",
  forest: "var(--color-forest)",
  clay: "var(--color-danger)",
  wash: "color-mix(in oklab, var(--color-ink) 5%, transparent)",
};

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: colors.muted, fontStyle: "italic" },
  { tag: tags.keyword, color: colors.forest, fontWeight: "600" },
  { tag: tags.string, color: colors.clay },
  { tag: tags.number, color: colors.forest },
  { tag: tags.bool, color: colors.forest },
  { tag: tags.null, color: colors.forest },
  { tag: tags.definition(tags.variableName), color: colors.ink },
  { tag: tags.function(tags.variableName), color: colors.ink },
  { tag: tags.propertyName, color: colors.ink },
  { tag: tags.operator, color: colors.muted },
  { tag: tags.punctuation, color: colors.muted },
  { tag: tags.className, color: colors.ink, fontWeight: "600" },
]);

const base = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "var(--color-ink)",
      fontSize: "0.8125rem",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-content": {
      fontFamily: "var(--font-mono)",
      caretColor: "var(--color-ink)",
      padding: "8px 0",
      minHeight: "44px",
    },
    ".cm-scroller": { overflow: "auto" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--color-muted)",
      fontFamily: "var(--font-mono)",
      fontSize: "0.6875rem",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "1.75rem",
      paddingRight: "8px",
    },
    ".cm-activeLine": { backgroundColor: colors.wash },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-ink)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "color-mix(in oklab, var(--color-forest) 22%, transparent) !important",
    },
    ".cm-placeholder": {
      color: "var(--color-muted)",
      fontStyle: "italic",
      fontFamily: "var(--font-sans)",
    },
  },
  { dark: false },
);

export const paperEditorTheme = [base, syntaxHighlighting(highlight)];
