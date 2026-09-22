import { splitAtRefs, isRef } from './refs';
import { topLevelNames, isReservedRef } from './runtime';
import type { Cell, CellReference, FolioNode } from './types';

export const cellKindLabel = { markdown: 'Note', image: 'Image', code: 'Code', artifact: 'Artifact', video: 'Video' };
const prefixes = { markdown: 'note', image: 'image', code: 'result', artifact: 'artifact', video: 'video' };
export function validCellName(name: string) {
  return name.length <= 80 && topLevelNames(`let ${name}`).includes(name) && isRef(name) && !isReservedRef(name) && !['__proto__', 'constructor', 'prototype', 'default', 'class', 'return', 'import', 'export', 'var', 'let', 'const', 'await', 'yield', 'this', 'null', 'true', 'false'].includes(name);
}
export function normalizeCells(nodes: FolioNode[]): FolioNode[] {
  const named = nodes.map(node => {
    const taken = new Set(node.data.cells.flatMap(cell => cell.kind === 'code' ? topLevelNames(cell.source) : []));
    for (const cell of node.data.cells) if (cell.name) taken.add(cell.name);
    const seen = new Set<string>();
    const cells = node.data.cells.map(cell => {
      let name = cell.name;
      if (!name || !validCellName(name) || seen.has(name)) {
        let n = 1; while (taken.has(`${prefixes[cell.kind]}${n}`)) n++;
        name = `${prefixes[cell.kind]}${n}`;
      }
      taken.add(name); seen.add(name);
      return name === cell.name ? cell : { ...cell, name };
    });
    return { ...node, data: { ...node.data, cells } };
  });
  return named.map(node => ({ ...node, data: { ...node.data, cells: node.data.cells.map(cell => cell.kind === 'code' ? { ...cell, references: bindReferences(cell.source, named, cell.references) } : cell) } }));
}

// Work only on executable @ tokens; quoted strings and comments stay literal.
export function mapCellRefs(source: string, visit: (token: string) => string): string {
  const parts = splitAtRefs(source);
  return parts.map((part, index) => {
    if (part.type === 'text') return part.text;
    const next = parts[index + 1];
    const member = next?.type === 'text' ? /^\.([A-Za-z_$][\w$]*)/.exec(next.text) : null;
    if (!member) return `@${part.name}`;
    const token = `${part.name}.${member[1]}`;
    const replacement = visit(token);
    if (replacement === `@${token}`) return `@${part.name}`;
    if (next?.type === 'text') next.text = next.text.slice(member[0].length);
    return replacement;
  }).join('');
}
export function bindReferences(source: string, nodes: FolioNode[], previous: Record<string, CellReference> = {}) {
  const refs: Record<string, CellReference> = {};
  mapCellRefs(source, token => {
    if (Object.hasOwn(previous, token)) refs[token] = previous[token];
    else {
      const [ref, name] = token.split('.');
      const node = nodes.find(n => n.data.ref === ref);
      const cell = node?.data.cells.find(c => c.name === name);
      if (node && cell) refs[token] = { nodeId: node.id, cellId: cell.id };
    }
    return `@${token}`;
  });
  return refs;
}
export function referenceTarget(nodes: FolioNode[], ref: CellReference) {
  const node = nodes.find(n => n.id === ref.nodeId);
  const cell = node?.data.cells.find(c => c.id === ref.cellId);
  return node && cell ? { node, cell } : undefined;
}
export function referenceLabel(nodes: FolioNode[], ref: CellReference) {
  const target = referenceTarget(nodes, ref);
  return target ? `@${target.node.data.ref}.${target.cell.name}${ref.path?.length ? '.' + ref.path.join('.') : ''}` : 'Missing source';
}
export function prepareCellSource(cell: Cell, nodes: FolioNode[]) {
  const imports: string[] = [];
  const source = mapCellRefs(cell.source, token => {
    const ref = cell.references?.[token];
    if (!ref) return `@${token}`;
    const target = referenceTarget(nodes, ref);
    if (!target) throw Error(`@${token} was removed. Choose another source.`);
    let alias = `$flowrunnerInput${imports.length}`;
    while (cell.source.includes(alias)) alias += '_';
    imports.push(`import { ${target.cell.name} as ${alias} } from @${target.node.data.ref}`);
    return alias;
  });
  return [...imports, source].join('\n');
}
export function refreshReferenceLabels(nodes: FolioNode[]) {
  return nodes.map(node => ({ ...node, data: { ...node.data, cells: node.data.cells.map(cell => {
    if (cell.kind !== 'code') return cell;
    const references: Record<string, CellReference> = {};
    const source = mapCellRefs(cell.source, token => {
      const ref = cell.references?.[token];
      if (!ref) return `@${token}`;
      const target = referenceTarget(nodes, ref);
      const next = target ? `${target.node.data.ref}.${target.cell.name}` : token;
      references[next] = ref;
      return `@${next}`;
    });
    return { ...cell, source, references };
  }) } }));
}
export function passiveValues(cells: Cell[]) {
  return Object.fromEntries(cells.filter(c => c.name && (c.kind === 'markdown' || (c.kind === 'image' && c.image) || (c.kind === 'video' && c.video))).map(c => [c.name!, c.kind === 'markdown' ? c.source : c.kind === 'video' ? c.video : c.image]));
}
export function markDependents(nodes: FolioNode[], changed: CellReference[]): FolioNode[] {
  const affected = new Set(changed.map(r => `${r.nodeId}/${r.cellId}`));
  let more = true;
  while (more) {
    more = false;
    for (const node of nodes) for (const cell of node.data.cells) {
      const key = `${node.id}/${cell.id}`;
      const refs = [...Object.values(cell.references ?? {}), ...(cell.inputs ?? []).map(i => i.reference)];
      if (!affected.has(key) && refs.some(r => affected.has(`${r.nodeId}/${r.cellId}`))) { affected.add(key); more = true; }
    }
  }
  return nodes.map(node => ({ ...node, data: { ...node.data, cells: node.data.cells.map(cell => affected.has(`${node.id}/${cell.id}`) && (cell.kind === 'code' || cell.kind === 'artifact') ? { ...cell, stale: true } : cell) } }));
}
export function referenceOptions(nodes: FolioNode[]) {
  return nodes.flatMap(node => node.data.cells.filter(cell => cell.kind !== 'artifact').flatMap(cell => {
    const base = `@${node.data.ref}.${cell.name}`;
    const detail = cell.kind === 'markdown' ? cell.source.slice(0, 70) : cell.kind === 'video' ? cell.video?.name || 'Video' : cell.kind === 'image' ? cell.image?.alt || 'Image' : cell.status === 'ok' && !cell.stale ? 'Code result' : 'Run this cell first';
    const paths = cell.kind === 'video' ? ['', '.src', '.name', '.caption'] : cell.kind === 'image' ? ['', '.src', '.alt', '.caption', '.width', '.height'] : [''];
    return paths.map(path => ({ label: base + path, detail, reference: { nodeId: node.id, cellId: cell.id, path: path ? [path.slice(1)] : [] } as CellReference }));
  }));
}
