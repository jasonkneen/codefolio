import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isVideoSource } from './videos';
import { parseFolioExport, serializeDesk } from './io';
import { useFolioStore } from './store';
import { passiveValues } from './cell-references';
import type { Cell } from './types';
const video: Cell = { id: 'video-test', kind: 'video', source: '', output: null, status: 'idle', video: { src: 'data:video/webm;base64,GkXfow==', name: 'Clip.webm', caption: '' } };
test('video sources reject transient and executable URLs', () => {
  assert.ok(isVideoSource(video.video!.src));
  for (const src of ['blob:https://example.com/a', 'javascript:alert(1)', 'data:text/html;base64,AAAA', 'https://example.com/v.mp4']) assert.equal(isVideoSource(src), false);
});
test('dropped media creates a named notebook and survives export and import', () => {
  const store = useFolioStore.getState();
  store.replaceDesk([], []);
  store.addMediaCells([video], undefined, { x: 120, y: 240 });
  const node = useFolioStore.getState().nodes[0];
  assert.deepEqual(node.position, { x: 120, y: 240 });
  assert.equal(node.data.cells.length, 1);
  assert.equal(node.data.cells[0].name, 'video1');
  const parsed = parseFolioExport(serializeDesk([node], []))!;
  assert.deepEqual(parsed.nodes[0].data.cells[0].video, video.video);
  assert.deepEqual(passiveValues(node.data.cells).video1, video.video);
  store.addMediaCells([{ ...video, id: 'second' }], node.id);
  assert.deepEqual(useFolioStore.getState().nodes[0].data.cells.map(c => c.name), ['video1', 'video2']);
  assert.throws(() => store.addMediaCells([video], 'removed'));
});
