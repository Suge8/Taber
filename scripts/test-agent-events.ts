import assert from 'node:assert/strict';
import { deriveTaskState } from '../lib/agent-events.ts';
import { projectAgentEvents } from '../lib/agent-event-projection.ts';

assert.equal(deriveTaskState([]), 'idle');
assert.equal(deriveTaskState([{ type: 'task.started', payload: { taskId: '1' } }]), 'running');
assert.equal(
  deriveTaskState([
    { type: 'task.started', payload: { taskId: '1' } },
    { type: 'task.stopRequested', payload: { taskId: '1' } },
  ]),
  'running',
);
assert.equal(
  deriveTaskState([
    { type: 'task.started', payload: { taskId: '1' } },
    { type: 'task.completed', payload: { taskId: '1' } },
  ]),
  'idle',
);
assert.equal(
  deriveTaskState([
    { type: 'task.started', payload: { taskId: '1' } },
    { type: 'task.failed', payload: { taskId: 'other' } },
  ]),
  'running',
);
assert.equal(
  deriveTaskState([
    { type: 'task.started', payload: { taskId: '1' } },
    { type: 'task.completed', payload: { taskId: '1' } },
    { type: 'task.started', payload: { taskId: '2' } },
  ]),
  'running',
);

const projection = projectAgentEvents([
  event(1, 'task.started', { taskId: '1', context: { id: 1, url: 'https://start.example', title: 'Start' } }),
  event(2, 'task.targetChanged', { taskId: '1', fromTabId: 1, toTabId: 2, reason: 'switchTab', tab: { id: 2, url: 'https://target.example', title: 'Target' } }),
]);
const startedPayload = projection.currentTask?.started.payload as { context?: { url?: string } } | undefined;
assert.equal(projection.currentTask?.context?.url, 'https://target.example');
assert.equal(startedPayload?.context?.url, 'https://start.example');
assert.equal(projection.timeline.length, 0);

console.info('agent event tests passed');

function event(id: number, type: string, payload: unknown) {
  return { id, sessionId: 1, type, payload, createdAt: id };
}
