import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The log markup carries the numbering, and the page cannot be imported under
// node, so these guard the two attributes the browser numbers entries from.
const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');

test('the newest-first shot log counts down from the running total', () => {
  const list = read('index.html').match(/<ol[^>]*id="log"[^>]*>/)?.[0];
  assert.ok(list, 'the log list exists');
  assert.match(list, /\breversed\b/, 'newest first means the list numbers descend');

  const ui = read('src/ui.js');
  assert.match(ui, /item\.value = game\.shotCount;/, 'entries are numbered by the running count');
  assert.match(ui, /el\.log\.prepend\(item\);/, 'entries are prepended');
});
