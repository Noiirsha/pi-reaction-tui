import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OutputMeter, speedText, ttftText } from '../src/performance.ts';
import { statistics, statusText } from '../src/status.ts';

function fixture(api = 'openai-completions') {
  let now = 0;
  const meter = new OutputMeter(() => now);
  const message = { role: 'assistant', api, content: [], stopReason: 'stop', usage: { output: 200, reasoning: 0 } };
  return {
    meter, message,
    at: time => { now = time; },
    delta(time, type, delta, redacted = false) {
      now = time;
      const block = type === 'thinking_delta' ? { type: 'thinking', thinking: delta, redacted } : { type: 'text', text: delta };
      message.content.push(block);
      meter.update({ type, delta, contentIndex: message.content.length - 1, partial: message });
    },
  };
}

test('hidden Responses reasoning and summaries do not start TTFT or count toward text speed', () => {
  const f = fixture('openai-responses'); f.meter.begin();
  f.delta(500, 'thinking_delta', 'Summary of hidden reasoning');
  assert.equal(f.meter.snapshot().ttftMs, undefined);
  f.delta(2000, 'text_delta', 'a'.repeat(40));
  f.delta(3000, 'text_delta', 'b'.repeat(40));
  assert.equal(f.meter.snapshot().tokensPerSecond, 20);
  assert.equal(speedText(f.meter.snapshot()), '~20.0t/s');
  f.message.usage = { output: 200, reasoning: 180 };
  f.at(10000); f.meter.finish(f.message); // final usage/network tail does not slow the text interval
  assert.deepEqual(f.meter.snapshot(), { ttftMs: 2000, tokensPerSecond: 20, estimated: false, scope: 'text', active: false });
  assert.equal(speedText(f.meter.snapshot()), '20.0t/s');
  f.at(30000); assert.equal(f.meter.snapshot().tokensPerSecond, 20, 'tool execution afterward is excluded');
});

test('streamed thinking counts with text; provider totals correct the final estimate', () => {
  const f = fixture('anthropic-messages'); f.meter.begin();
  f.delta(500, 'thinking_delta', 'thinking'.repeat(10));
  f.delta(1500, 'text_delta', 'answer'.repeat(10));
  assert.equal(f.meter.snapshot().ttftMs, 500);
  assert.equal(f.meter.snapshot().scope, 'text+thinking');
  assert.equal(f.meter.snapshot().estimated, true);
  f.message.usage = { output: 150, reasoning: 100 }; f.meter.finish(f.message);
  assert.equal(f.meter.snapshot().tokensPerSecond, 150);
  assert.equal(f.meter.snapshot().estimated, false);
});

test('missing reasoning split and tool arguments retain visible-only estimates', () => {
  const f = fixture(); f.meter.begin();
  f.delta(100, 'text_delta', 'abcd'); f.delta(1100, 'text_delta', 'efgh');
  f.message.usage = { output: 999 }; f.meter.finish(f.message);
  assert.equal(speedText(f.meter.snapshot()), '~2.0t/s');
  f.at(5000); f.meter.begin();
  f.delta(5500, 'text_delta', 'abcd'); f.delta(6500, 'text_delta', 'efgh');
  f.message.content.push({ type: 'toolCall', name: 'bash', arguments: { command: 'ignored' } });
  f.message.usage = { output: 1000, reasoning: 0 }; f.meter.finish(f.message);
  assert.equal(speedText(f.meter.snapshot()), '~2.0t/s');
  assert.equal(f.meter.snapshot().ttftMs, 500);
});

test('empty, tool-only and buffered single-chunk requests have no invented output speed', () => {
  const f = fixture(); f.meter.begin();
  f.delta(100, 'text_delta', '');
  f.meter.update({ type: 'toolcall_delta', delta: '{large tool arguments}', partial: f.message });
  f.meter.finish(f.message);
  assert.equal(f.meter.snapshot().ttftMs, undefined);
  assert.equal(speedText(f.meter.snapshot()), '-');
  f.at(200); f.meter.begin(); f.delta(1200, 'text_delta', 'Buffered answer'); f.meter.finish(f.message);
  assert.equal(f.meter.snapshot().ttftMs, 1000);
  assert.equal(speedText(f.meter.snapshot()), '-');
});

test('retries and session resets clear timings; abort never corrects from incomplete usage', () => {
  const f = fixture(); f.meter.begin(); f.at(5000); f.meter.begin();
  f.delta(5500, 'text_delta', 'abcd'); f.delta(6500, 'text_delta', 'efgh');
  f.message.stopReason = 'aborted'; f.meter.finish(f.message);
  assert.equal(f.meter.snapshot().ttftMs, 500); assert.equal(speedText(f.meter.snapshot()), '~2.0t/s');
  f.meter.stop(); assert.equal(f.meter.snapshot().active, false);
  f.meter.reset(); assert.equal(f.meter.snapshot().ttftMs, undefined); assert.equal(speedText(f.meter.snapshot()), '-');
});

test('redacted thinking is excluded and missing counters never become exact', () => {
  const f = fixture('anthropic-messages'); f.meter.begin();
  f.delta(100, 'thinking_delta', 'redacted', true);
  f.delta(1000, 'text_delta', 'abcd'); f.delta(2000, 'text_delta', 'efgh');
  f.message.usage = { output: 200 }; f.meter.finish(f.message);
  assert.equal(f.meter.snapshot().ttftMs, 1000); assert.equal(speedText(f.meter.snapshot()), '~2.0t/s');
});

test('TTFT and speed fit one status row and keep mode at the right when narrowed', () => {
  const output = { ttftMs: 1200, tokensPerSecond: 48.6, estimated: true, scope: 'text', active: false };
  assert.equal(ttftText(450), '450ms'); assert.equal(ttftText(1200), '1.2s');
  for (const width of [1, 4, 20, 40, 80, 160]) {
    const text = statusText(width, 'IDLE', statistics([]), { percent: 1.8 }, 'rw', output);
    assert.equal(text.length, width); assert.ok(!text.includes('\n'));
    if (width >= 4) assert.ok(text.endsWith(' RW '));
    if (width >= 80) assert.match(text, /TTFT 1\.2s.*OUT ~48\.6t\/s/);
  }
});
