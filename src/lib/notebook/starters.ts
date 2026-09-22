import { uid } from "@/lib/utils";
import type { Cell, FolioNode } from "./types";

function md(id: string, source: string): Cell {
  return { id, kind: "markdown", source, output: null, status: "idle" };
}

function js(id: string, source: string): Cell {
  return { id, kind: "code", source, output: null, status: "idle" };
}

export function blankNotebook(): FolioNode {
  return {
    id: uid("nb"),
    type: "notebook",
    dragHandle: ".notebook-drag-handle",
    position: { x: 72, y: 96 },
    style: { width: 520, height: 560 },
    data: {
      title: "Untitled notebook",
      ref: "untitled",
      cells: [
        md("cell-blank-md", "# Untitled\n\nWrite a note, then a cell of JavaScript. Shift+Enter runs it."),
        js("cell-blank-js", "// last expression is shown\n2 + 2"),
      ],
    },
  };
}

export function starterNodes(): FolioNode[] {
  return [
    {
      id: "nb-folio",
      type: "notebook",
      dragHandle: ".notebook-drag-handle",
      position: { x: 40, y: 104 },
      style: { width: 500, height: 680 },
      data: {
        title: "Getting started",
        ref: "gettingStarted",
        cells: [
          md("cell-gs-intro", `# A notebook, on a canvas

This is a real JavaScript notebook sitting inside a page. Write **notes**, run **code**, see **results**, then keep writing — one continuous document.

Click a note to edit it. Drag the header to move the page. Shift+Enter runs a cell.

This public beta keeps the desk in **this browser**. Export from the menu if you want a copy.`),
          js("cell-gs-hello", `const greeting = "Hello from the kernel"
greeting`),
          md("cell-gs-persist", `Variables persist down the page. \`@greeting\` is the name from the cell above — a chip until you click in to edit.`),
          js("cell-gs-table", `const names = ["ink", "paper", "kernel", "canvas"]
const counts = names.map((n) => n.length)

console.log(@greeting.toUpperCase())
table(names.map((name, i) => ({ name, letters: counts[i] })))`),
          md("cell-gs-rich", `Return a canvas, HTML, or a chart and it renders inline.`),
          js("cell-gs-chart", `chart(counts, { title: "letters in each word" })`),
          js("cell-gs-html", `html\`<div class="folio-callout">This HTML was returned from a cell. Notes above, code beside, results below — the whole thing is the document.</div>\``),
        ],
      },
    },
    {
      id: "nb-sketch",
      type: "notebook",
      dragHandle: ".notebook-drag-handle",
      position: { x: 568, y: 140 },
      style: { width: 440, height: 560 },
      data: {
        title: "Sketchbook",
        ref: "sketchbook",
        cells: [
          md("cell-sk-intro", `# Sketchbook

A second kernel, a second page. This one just draws.`),
          js("cell-sk-draw", `const W = 400
const H = 180
const seed = 7

function hash(n) {
  var x = Math.sin(n * 12.9898 + seed) * 43758.5453
  return x - Math.floor(x)
}

const art = sketch(W, H, function (ctx) {
  ctx.fillStyle = "#1c1916"
  ctx.fillRect(0, 0, W, H)
  for (var i = 0; i < 28; i++) {
    var y = 16 + hash(i) * (H - 32)
    var alpha = 0.25 + hash(i + 3) * 0.6
    ctx.strokeStyle = "rgba(243,238,228," + alpha + ")"
    ctx.lineWidth = 1 + hash(i + 1) * 2
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (var x = 0; x <= W; x += 8) {
      var wobble = Math.sin(x / 40 + i) * 10 * hash(i + 2)
      ctx.lineTo(x, y + wobble)
    }
    ctx.stroke()
  }
})
art`),
          md("cell-sk-note", `Change \`seed\` and run again. Add a note. Keep going.`),
        ],
      },
    },
    {
      id: "nb-tables",
      type: "notebook",
      dragHandle: ".notebook-drag-handle",
      position: { x: 1056, y: 80 },
      style: { width: 460, height: 620 },
      data: {
        title: "Data tables",
        ref: "tables",
        cells: [
          md("cell-tb-intro", `# Data tables

Return plain objects or arrays of objects from a cell and the kernel renders them as a table.

The \`table()\` helper inspects what you hand it. Arrays of objects become columns. Numbers become a labeled column.`),
          js("cell-tb-raw", `const books = [
  { title: "The Pragmatic Programmer", pages: 320, rating: 4.6 },
  { title: "Designing Data-Intensive Applications", pages: 616, rating: 4.8 },
  { title: "Code", pages: 400, rating: 4.7 },
  { title: "The Mythical Man-Month", pages: 322, rating: 4.3 },
]
table(books)`),
          md("cell-tb-derived", `Derive columns and let the same data tell a different story.`),
          js("cell-tb-compute", `const enriched = books.map((b) => ({
  ...b,
    hours: +(b.pages / 60).toFixed(1),
    perHour: +(b.rating / (b.pages / 60)).toFixed(3),
  }))
table(enriched)`),
          md("cell-tb-filter", `Filter and sort — anything that returns a value works.`),
          js("cell-tb-sorted", `table(books.filter((b) => b.pages < 500).sort((a, b) => b.rating - a.rating))`),
          md("cell-tb-outro", `Hand \`table()\` a single number for a one-column view, or a plain object to see both fields at once.`),
        ],
      },
    },
    {
      id: "nb-functions",
      type: "notebook",
      dragHandle: ".notebook-drag-handle",
      position: { x: 40, y: 836 },
      style: { width: 460, height: 560 },
      data: {
        title: "Functions & reuse",
        ref: "functions",
        cells: [
          md("cell-fn-intro", `# Functions & reuse

Top-level \`function\` and \`const\` declarations live for the whole notebook. Define helpers once, call them anywhere below.`),
          js("cell-fn-defs", `function normalize(series) {
  const max = Math.max(...series)
  const min = Math.min(...series)
  const span = max - min || 1
  return series.map((v) => (v - min) / span)
}

function summarize(series) {
  const sorted = [...series].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return {
    n: series.length,
    min: Math.min(...series),
    max: Math.max(...series),
    median: +median.toFixed(2),
    mean: +(series.reduce((s, v) => s + v, 0) / series.length).toFixed(2),
  }
}

summarize([3, 7, 2, 9, 14, 6, 11])`),
          md("cell-fn-call", `The bindings from the cell above are still in scope. Use \`normalize\` on something new.`),
          js("cell-fn-scale", `const samples = [42, 58, 71, 39, 88, 64, 53, 76]
const scaled = normalize(samples)

table(samples.map((v, i) => ({
  raw: v,
  scaled: +scaled[i].toFixed(2),
})))`),
          md("cell-fn-error", `Errors render inline rather than crashing the notebook. Try uncommenting the throw to see it.`),
          js("cell-fn-throw", `// uncomment to see how errors render:
  // throw new Error("Something went wrong on purpose")
  "All clear for now."`),
          md("cell-fn-import", `The handle in a card's header is how another card imports it. \`import @sketchbook\` brings that page in as \`sketchbook\`.`),
          js("cell-fn-use", `import @sketchbook

@sketchbook.seed`),
        ],
      },
    },
    {
      id: "nb-charts",
      type: "notebook",
      dragHandle: ".notebook-drag-handle",
      position: { x: 568, y: 776 },
      style: { width: 460, height: 520 },
      data: {
        title: "Charts",
        ref: "charts",
        cells: [
          md("cell-ch-intro", `# Charts

\`chart()\` takes numbers or \`{ label, value }\` rows and returns a bar chart canvas. The last expression is what gets shown.`),
          js("cell-ch-basic", `const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const visits = [12, 18, 9, 24, 31, 28, 14]
chart(visits, { title: "Daily visits" })`),
          md("cell-ch-ref", `\`@visits\` is the array above. Hover the chip to preview it. Click the cell to see the code.`),
          js("cell-ch-len", `@visits.length`),
          md("cell-ch-labeled", `Pass objects when you want the x-axis to carry meaning.`),
          js("cell-ch-rich", `const minutes = [
  { label: "sleep", value: 7.5 },
  { label: "work", value: 8.2 },
  { label: "code", value: 2.1 },
  { label: "read", value: 1.0 },
  { label: "walk", value: 0.8 },
]
chart(minutes, { title: "A working Tuesday" })`),
          md("cell-ch-outro", `Use the cells above as a starting point — pull a fresh dataset in, edit the title, run again.`),
        ],
      },
    },
    {
      id: "nb-richtext",
      type: "notebook",
      dragHandle: ".notebook-drag-handle",
      position: { x: 1056, y: 740 },
      style: { width: 460, height: 580 },
      data: {
        title: "Rich text from cells",
        ref: "richText",
        cells: [
          md("cell-rt-intro", `# Rich text from cells

\`md\` and \`html\` are tagged-template helpers. Insert values directly — they render in place, no escaping required when you mean them to be HTML.`),
          js("cell-rt-md", `const name = "folio"
const adjective = "terse"

md\`## Hello, *\${name}*

A small notebook can be \${adjective} **and** expressive — notes, code, and results in a single document.\``),
          md("cell-rt-html", `\`html\` returns a value the kernel treats as rendered markup. Inline styles are fine.`),
          js("cell-rt-html-render", `const score = 0.82
const pct = Math.round(score * 100)

html\`<div class="folio-callout">
  <strong>Readiness</strong>
  <div style="margin-top:8px;height:10px;border-radius:999px;background:rgba(63,93,81,0.18);overflow:hidden">
    <div style="width:\${pct}%;height:100%;background:#3f5d51"></div>
  </div>
  <small style="display:block;margin-top:6px;color:#7a7268">\${pct}% of assets are settled.</small>
</div>\``),
          md("cell-rt-mixed", `Mix display helpers and prose. Anything the last expression returns shows up under the cell.`),
          js("cell-rt-mixed-render", `const phrases = ["ink", "paper", "kernel", "canvas"]
const callout = html\`<div class="folio-callout">\${phrases.length} words, fresh from the kernel.</div>\`

display(callout)
table(phrases.map((word, i) => ({ word, index: i, letters: word.length })))`),
        ],
      },
    },
  ];
}
