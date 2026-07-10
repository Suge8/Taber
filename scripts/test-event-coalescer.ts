import assert from 'node:assert/strict';
import { createDeltaCoalescer, DELTA_FLUSH_AGE_MS, DELTA_FLUSH_CHARS } from '../lib/event-coalescer.ts';

await testAccumulatesUntilSizeThreshold();
await testFlushesAfterAgeWithoutAnotherDelta();
await testKeyChangeFlushesPreviousBufferFirst();
await testExplicitFlushAndEmptyFlush();

console.info('event coalescer tests passed');

function createRecorder() {
  const emitted: { type: string; payload: Record<string, unknown> }[] = [];
  return { emitted, emit: async (type: string, payload: Record<string, unknown>) => { emitted.push({ type, payload }); } };
}

async function testAccumulatesUntilSizeThreshold() {
  const { emitted, emit } = createRecorder();
  const coalescer = createDeltaCoalescer(emit);

  const chunk = 'x'.repeat(100);
  for (let index = 0; index < 5; index += 1) await coalescer.append('tool.input.appended', 'call-1', { toolCallId: 'call-1' }, chunk);
  assert.equal(emitted.length, 0);

  await coalescer.append('tool.input.appended', 'call-1', { toolCallId: 'call-1' }, chunk);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].payload.delta, 'x'.repeat(600));
  assert.ok((emitted[0].payload.delta as string).length >= DELTA_FLUSH_CHARS);
}

async function testFlushesAfterAgeWithoutAnotherDelta() {
  const { emitted, emit } = createRecorder();
  let scheduled: { callback: () => void; delayMs: number } | undefined;
  const coalescer = createDeltaCoalescer(emit, {
    setTimeout(callback, delayMs) {
      scheduled = { callback, delayMs };
      return callback;
    },
    clearTimeout(timer) {
      if (scheduled?.callback === timer) scheduled = undefined;
    },
  });

  await coalescer.append('message.appended', 'm1', { messageId: 'm1' }, 'a');
  assert.equal(scheduled?.delayMs, DELTA_FLUSH_AGE_MS);
  assert.equal(emitted.length, 0);
  const callback = scheduled?.callback;
  scheduled = undefined;
  callback?.();
  await coalescer.flush();
  assert.deepEqual(emitted, [{ type: 'message.appended', payload: { messageId: 'm1', delta: 'a' } }]);
}

async function testKeyChangeFlushesPreviousBufferFirst() {
  const { emitted, emit } = createRecorder();
  const coalescer = createDeltaCoalescer(emit);

  await coalescer.append('tool.input.appended', 'call-1', { toolCallId: 'call-1' }, 'first');
  await coalescer.append('tool.input.appended', 'call-2', { toolCallId: 'call-2' }, 'second');
  await coalescer.flush();

  assert.deepEqual(emitted, [
    { type: 'tool.input.appended', payload: { toolCallId: 'call-1', delta: 'first' } },
    { type: 'tool.input.appended', payload: { toolCallId: 'call-2', delta: 'second' } },
  ]);
}

async function testExplicitFlushAndEmptyFlush() {
  const { emitted, emit } = createRecorder();
  const coalescer = createDeltaCoalescer(emit);

  await coalescer.flush();
  assert.equal(emitted.length, 0);

  await coalescer.append('reasoning.appended', 'r1', { reasoningId: 'r1' }, 'thinking');
  await coalescer.flush();
  await coalescer.flush();
  assert.deepEqual(emitted, [{ type: 'reasoning.appended', payload: { reasoningId: 'r1', delta: 'thinking' } }]);
}
