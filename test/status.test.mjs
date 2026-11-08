import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statistics, statusText } from '../src/status.ts';
import { formatKey, keyText } from '../src/keys.ts';

test('session totals include recorded auxiliary usage; hit rate uses the latest assistant prompt', () => {
  const assistant = usage => ({ type: 'message', message: { role: 'assistant', usage } });
  const result = statistics([
    assistant({ input: 1000, output: 500, cacheRead: 8000, cacheWrite: 1000, cost: { total: 0.01 } }),
    { type: 'usage', usage: { input: 20, output: 0, cacheRead: 30, cacheWrite: 10, cost: { total: 0.001 } } },
    { type: 'message', message: { role: 'user', content: 'no usage here' } },
    assistant({ input: 500, output: 250, cacheRead: 1500, cacheWrite: 0, cost: { total: 0.02 } }),
  ]);
  assert.deepEqual({ ...result, cost: Number(result.cost.toFixed(3)) }, {
    input: 1520, output: 750, cacheRead: 9530, cacheWrite: 1010, cost: 0.031, recorded: true, hit: 75,
  });
  const empty = statusText(100, 'IDLE', statistics([]), undefined);
  assert.match(empty, /UP -.*DN -.*HIT -.*COST -.*CTX -/);
  assert.ok(!empty.includes('NaN')); assert.ok(!empty.includes('0.0%'));
});

test('platform-specific notation retains actual modifiers and the primary custom binding', () => {
  assert.equal(formatKey('ctrl+l', 'darwin'), '⌃L');
  assert.equal(formatKey('shift+enter', 'darwin'), '⇧↵');
  assert.equal(formatKey('alt+left', 'darwin'), '⌥←');
  assert.equal(formatKey('ctrl+g', 'linux'), 'Ctrl+G');
  assert.equal(formatKey('shift+enter', 'win32'), 'Shift+Enter');
  assert.equal(keyText({ getKeys: () => ['alt+k', 'ctrl+l'] }, 'app.model.select'),
    formatKey('alt+k'));
  assert.equal(keyText({ getKeys: () => [] }, 'unbound'), '');
});
