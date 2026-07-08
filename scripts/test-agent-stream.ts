import assert from 'node:assert/strict';
import { collectAgentResponseText, type AgentStreamPart } from '../lib/agent-stream.ts';

await testTextDeltasAreEmitted();
await testReasoningAndToolProgressAreEmitted();
await testFallbackTextIsEmitted();
await testFinishReasonErrorRejects();

console.info('agent stream tests passed');

async function testTextDeltasAreEmitted() {
  const events: string[] = [];
  const text = await collectAgentResponseText({
    fullStream: streamParts([
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo' },
      { type: 'finish', finishReason: 'stop' },
    ]),
    text: Promise.resolve('ignored'),
  }, streamEvents(events));

  assert.equal(text, 'Hello');
  assert.deepEqual(events, ['create', 'append:Hel', 'append:lo']);
}

async function testReasoningAndToolProgressAreEmitted() {
  const events: string[] = [];
  const text = await collectAgentResponseText({
    fullStream: streamParts([
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', text: 'Need page state' },
      { type: 'reasoning-end', id: 'r1' },
      { type: 'tool-input-start', id: 'call-1', toolName: 'browserRepl', title: 'Inspect page' },
      { type: 'tool-input-delta', id: 'call-1', delta: '{"code":' },
      { type: 'tool-call', toolCallId: 'call-1', toolName: 'browserRepl', input: { code: 'return 1' } },
      { type: 'finish', finishReason: 'tool-calls' },
    ]),
    text: Promise.resolve(''),
  }, streamEvents(events));

  assert.equal(text, '');
  assert.deepEqual(events, [
    'reasoning-start:r1',
    'reasoning-append:r1:Need page state',
    'reasoning-complete:r1',
    'tool-input-start:call-1:browserRepl:Inspect page',
    'tool-input-append:call-1:{"code":',
    'tool-input-complete:call-1:browserRepl:{"code":"return 1"}',
  ]);
}

async function testFallbackTextIsEmitted() {
  const events: string[] = [];
  const text = await collectAgentResponseText({
    fullStream: streamParts([{ type: 'finish', finishReason: 'stop' }]),
    text: Promise.resolve('Done'),
  }, streamEvents(events));

  assert.equal(text, 'Done');
  assert.deepEqual(events, ['create', 'append:Done']);
}

async function testFinishReasonErrorRejects() {
  const events: string[] = [];
  await assert.rejects(
    () => collectAgentResponseText({
      fullStream: streamParts([{ type: 'finish', finishReason: 'error' }]),
      text: Promise.resolve('should not complete'),
    }, streamEvents(events)),
    /Model response failed\./,
  );
  assert.deepEqual(events, []);
}

async function* streamParts(parts: AgentStreamPart[]) {
  for (const part of parts) yield part;
}

function streamEvents(events: string[]) {
  return {
    createMessage: async () => { events.push('create'); },
    appendText: async (delta: string) => { events.push(`append:${delta}`); },
    startReasoning: async ({ reasoningId }: { reasoningId: string }) => { events.push(`reasoning-start:${reasoningId}`); },
    appendReasoning: async ({ reasoningId, delta }: { reasoningId: string; delta: string }) => { events.push(`reasoning-append:${reasoningId}:${delta}`); },
    completeReasoning: async ({ reasoningId }: { reasoningId: string }) => { events.push(`reasoning-complete:${reasoningId}`); },
    startToolInput: async ({ toolCallId, toolName, title }: { toolCallId: string; toolName: string; title?: string }) => { events.push(`tool-input-start:${toolCallId}:${toolName}:${title ?? ''}`); },
    appendToolInput: async ({ toolCallId, delta }: { toolCallId: string; delta: string }) => { events.push(`tool-input-append:${toolCallId}:${delta}`); },
    completeToolInput: async ({ toolCallId, toolName, input }: { toolCallId: string; toolName: string; input: unknown }) => { events.push(`tool-input-complete:${toolCallId}:${toolName}:${JSON.stringify(input)}`); },
  };
}
