import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindReferences, normalizeCells, prepareCellSource, validCellName } from './cell-references';
import { useFolioStore, kernelFor, resolveArtifactInputs } from './store';
import { parseFolioExport, serializeDesk } from './io';
import type { Cell, FolioNode } from './types';
const cell = (id: string, kind: Cell['kind'], source = '', name?: string): Cell => ({ id, kind, source, name, status: 'idle', output: null });
const node = (id: string, cells: Cell[]): FolioNode => ({ id, type: 'notebook', position: { x: 0, y: 0 }, data: { title: id, ref: id, cells } });
const store = () => useFolioStore.getState();
function setup() {
  store().replaceDesk([node('research', [cell('note', 'markdown', 'A quiet morning', 'summary'), { ...cell('image', 'image', '', 'cover'), image: { src: 'https://example.com/cover.png', alt: 'Cover', caption: '', width: 500, height: 300 } }, cell('code', 'code', '({ total: 42 })', 'sales')]), node('consumer', [cell('read', 'code', '[@research.summary, @research.cover.width]', 'result')])], []);
}

test('migration assigns unique names without colliding with existing declarations', () => {
  const result = normalizeCells([node('n', [cell('a', 'code', 'const result1 = 8'), cell('b', 'code'), cell('c', 'markdown'), cell('d', 'image')])]);
  assert.deepEqual(result[0].data.cells.map(c => c.name), ['result2', 'result3', 'note1', 'image1']);
  for (const name of ['await', 'for', 'if', '__proto__', 'constructor', 'html', 'bad-name']) assert.equal(validCellName(name), false);
});

test('references ignore strings/comments and bind stable IDs in template expressions', () => {
  setup();
  const source = '// @research.cover\nconst s = "@research.summary"\n`text @research.cover ${@research.cover.width}`';
  const references = bindReferences(source, store().nodes);
  assert.deepEqual(Object.keys(references), ['research.cover']);
  const prepared = prepareCellSource({ ...cell('x', 'code', source), references }, store().nodes);
  assert.match(prepared, /import \{ cover as \$flowrunnerInput0 \} from @research/);
  assert.match(prepared, /text @research.cover \$\{\$flowrunnerInput0.width\}/);
});

test('notes and images work across notebooks without running source code', async () => {
  setup();
  await store().runCell('consumer', 'read');
  assert.equal(store().nodes[1].data.cells[0].status, 'ok');
  assert.deepEqual(kernelFor('consumer').peek('result').value, ['A quiet morning', 500]);
  assert.equal(store().nodes[0].data.cells[2].status, 'idle');
});

test('renames update executable references while preserving literal text and input IDs', async () => {
  setup();
  store().setCellSource('consumer', 'read', 'const literal = "@research.cover"\n@research.cover.width');
  assert.equal(store().setCellName('research', 'image', 'hero'), true);
  assert.equal(store().setRef('research', 'assets'), true);
  assert.match(store().nodes[1].data.cells[0].source, /"@research.cover"/);
  assert.match(store().nodes[1].data.cells[0].source, /@assets.hero.width/);
  await store().runCell('consumer', 'read');
  assert.equal(kernelFor('consumer').peek('result').value, 500);
  assert.equal(store().setCellName('research', 'note', 'hero'), false);
});

test('named results require a manual run, become stale, and reach artifacts as copied JSON', async () => {
  setup();
  store().setCellSource('consumer', 'read', '@research.sales.total');
  await store().runCell('consumer', 'read');
  assert.equal(store().nodes[1].data.cells[0].status, 'error');
  await store().runCell('research', 'code');
  await store().runCell('consumer', 'read');
  assert.equal(kernelFor('consumer').peek('result').value, 42);
  const inputs = [{ name: 'data', reference: { nodeId: 'research', cellId: 'code' } }];
  const value = await resolveArtifactInputs(inputs);
  assert.deepEqual(value.data, { total: 42 });
  (value.data as any).total = 99;
  assert.deepEqual(kernelFor('research').peek('sales').value, { total: 42 });
  store().setCellSource('research', 'code', '({ total: 7 })');
  assert.equal(store().nodes[1].data.cells[0].stale, true);
  await assert.rejects(resolveArtifactInputs(inputs), /Run @research.sales first/);
});

test('deleting a source never retargets its references to a new cell with the same name', async () => {
  setup();
  store().removeCell('research', 'image');
  store().insertCell('research', null, 'image');
  const replacement = store().nodes[0].data.cells[0];
  store().setCellName('research', replacement.id, 'cover');
  await store().runCell('consumer', 'read');
  assert.match(JSON.stringify(store().nodes[1].data.cells[0].output), /was removed/);
});

test('names, references, and artifact inputs round trip; older versions migrate', () => {
  setup();
  store().insertCell('consumer', null, 'artifact');
  const artifact = store().nodes[1].data.cells[0];
  store().setArtifactInputs('consumer', artifact.id, [{ name: 'photo', reference: { nodeId: 'research', cellId: 'image', path: ['src'] } }]);
  const file = serializeDesk(store().nodes, []);
  assert.equal(file.folio, 4);
  const parsed = parseFolioExport(file)!;
  assert.deepEqual(parsed.nodes[1].data.cells[0].inputs, artifact.inputs ?? store().nodes[1].data.cells[0].inputs);
  assert.equal(parsed.nodes[0].data.cells[1].name, 'cover');
  for (const folio of [1, 2, 3]) assert.ok(parseFolioExport({ folio, nodes: [node('old', [cell('x', 'markdown')])] })?.nodes[0].data.cells[0].name);
});

test('changed source during a pending consumer run cannot publish an outdated result', async () => {
  setup();
  let release!: () => void;
  (globalThis as any).__referenceGate = new Promise<void>(r => { release = r; });
  store().setCellSource('consumer', 'read', 'const text = @research.summary\nawait globalThis.__referenceGate\ntext');
  const pending = store().runCell('consumer', 'read');
  await new Promise(r => setTimeout(r, 0));
  store().setCellSource('research', 'note', 'A different morning');
  release(); await pending;
  assert.equal(store().nodes[1].data.cells[0].status, 'idle');
  assert.equal(store().nodes[1].data.cells[0].stale, true);
});

test('reference rewriting leaves regex literals intact and supports nested template expressions', () => {
  setup();
  const source = '/@research.cover/.test("x")\n`outer ${`inner ${@research.cover.width}`}`';
  const refs = bindReferences(source, store().nodes);
  const prepared = prepareCellSource({ ...cell('x', 'code', source), references: refs }, store().nodes);
  assert.match(prepared, /\/@research.cover\//);
  assert.match(prepared, /inner \$\{\$flowrunnerInput0.width\}/);
});

test('ordinary declarations in another cell cannot overwrite a named result', async () => {
  setup();
  await store().runCell('research', 'code');
  store().insertCell('research', 'code', 'code');
  const other = store().nodes[0].data.cells.at(-1)!;
  store().setCellSource('research', other.id, 'const sales = 999\nsales');
  await store().runCell('research', other.id);
  const input = await resolveArtifactInputs([{ name: 'data', reference: { nodeId: 'research', cellId: 'code' } }]);
  assert.deepEqual(input.data, { total: 42 });
});

test('named imported objects are copies and cannot mutate the source notebook', async () => {
  setup();
  await store().runCell('research', 'code');
  store().setCellSource('consumer', 'read', 'const value = @research.sales\nvalue.total = 100\nvalue');
  await store().runCell('consumer', 'read');
  assert.deepEqual(kernelFor('research').peek('sales').value, { total: 42 });
});

test('renaming a computed cell preserves its published result and existing consumers', async () => {
  setup();
  await store().runCell('research', 'code');
  store().setCellSource('consumer', 'read', '@research.sales.total');
  await store().runCell('consumer', 'read');
  assert.equal(store().setCellName('research', 'code', 'revenue'), true);
  assert.equal(store().nodes[1].data.cells[0].stale, false);
  assert.equal(store().nodes[1].data.cells[0].source, '@research.revenue.total');
  await store().runCell('consumer', 'read');
  assert.equal(kernelFor('consumer').peek('result').value, 42);
});

test('panel themes persist independently through desk export and import', () => {
  setup();
  store().setPanelTheme('consumer', 'read', 'codeTheme', 'dark');
  store().setPanelTheme('consumer', 'read', 'previewTheme', 'light');
  const restored = parseFolioExport(serializeDesk(store().nodes, []))!;
  const saved = restored.nodes.find(n => n.id === 'consumer')!.data.cells[0];
  assert.equal(saved.codeTheme, 'dark');
  assert.equal(saved.previewTheme, 'light');
  assert.equal(saved.source, '[@research.summary, @research.cover.width]');
});
