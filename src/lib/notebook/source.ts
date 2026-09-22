import { parse, type Pattern } from "acorn";

function namesIn(pattern: Pattern, names: string[]) {
  switch (pattern.type) {
    case "Identifier": names.push(pattern.name); break;
    case "RestElement": namesIn(pattern.argument, names); break;
    case "AssignmentPattern": namesIn(pattern.left, names); break;
    case "ArrayPattern": for (const item of pattern.elements) if (item) namesIn(item, names); break;
    case "ObjectPattern": for (const item of pattern.properties) namesIn(item.type === "RestElement" ? item.argument : item.value as Pattern, names); break;
  }
}

export function analyzeSource(source: string) {
  const program = parse(source, { ecmaVersion: "latest", sourceType: "script", allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
  const names: string[] = [];
  const lexical: string[] = [];
  const edits: { start: number; end: number; value: string }[] = [];
  for (const statement of program.body) {
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) namesIn(declaration.id, names);
      if (statement.kind !== "var") edits.push({ start: statement.start, end: statement.start + statement.kind.length, value: "var" });
    } else if ((statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") && statement.id) { names.push(statement.id.name); if (statement.type === "ClassDeclaration") lexical.push(statement.id.name); }
  }
  const last = program.body.filter(statement => statement.type !== "EmptyStatement").at(-1);
  let tail: string | null = null;
  if (last?.type === "ExpressionStatement") {
    tail = source.slice(last.expression.start, last.expression.end);
    edits.push({ start: last.start, end: last.end, value: "" });
  }
  let body = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.value + body.slice(edit.end);
  return { names: [...new Set(names)], lexical, body, tail };
}
