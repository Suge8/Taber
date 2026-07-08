import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const {
  database,
  initializeDatabase,
  createSession,
  appendToolRun,
  appendAgentEvent,
  readLatestSessionSnapshot,
  readSessionSnapshot,
  setSessionRetentionLimit,
  UNLIMITED_SESSION_RETENTION,
} = await import('../lib/db.ts');

await testSnapshotPersistsRecords();
await testPruneDeletesOldSessionsAndLinkedRecords();
await testUnlimitedRetentionDisablesPrune();

database.close();
console.info('database integration tests passed');

async function testSnapshotPersistsRecords() {
  await resetDatabase();

  const session = await createSession({ title: 'Persisted session', now: 1 });
  await appendAgentEvent({
    sessionId: session.id,
    type: 'task.started',
    payload: { taskId: 'task-1', prompt: 'Summarize this page' },
    now: 2,
  });
  await appendToolRun({
    sessionId: session.id,
    toolName: 'getDocument',
    input: { source: 'currentPage', mode: 'article' },
    output: { ok: true, source: 'currentPage', mode: 'article', content: '# Page', contentChars: 6, truncated: false },
    now: 3,
  });
  await appendAgentEvent({
    sessionId: session.id,
    type: 'tool.completed',
    payload: { toolName: 'getDocument', output: { ok: true } },
    now: 4,
  });

  const snapshot = await readLatestSessionSnapshot();
  assert(snapshot);
  assert.equal(snapshot.session.id, session.id);
  assert.deepEqual(snapshot.toolRuns[0].output, { ok: true, source: 'currentPage', mode: 'article', content: '# Page', contentChars: 6, truncated: false });
  assert.deepEqual(snapshot.agentEvents[0].payload, { taskId: 'task-1', prompt: 'Summarize this page' });
  assert.deepEqual(snapshot.agentEvents[1].payload, { toolName: 'getDocument', output: { ok: true } });
}

async function testPruneDeletesOldSessionsAndLinkedRecords() {
  await resetDatabase();
  await setSessionRetentionLimit(3);

  const pinned = await createSession({ title: 'Pinned', pinned: true, now: 1 });
  const pruned = await createSession({ title: 'Pruned', now: 2 });
  await appendToolRun({ sessionId: pruned.id, toolName: 'debugger', input: {}, output: { ok: true }, now: 2 });
  await appendAgentEvent({ sessionId: pruned.id, type: 'task.done', payload: { ok: true }, now: 2 });

  await createSession({ title: 'Kept 1', now: 3 });
  await createSession({ title: 'Kept 2', now: 4 });
  await createSession({ title: 'Kept 3', now: 5 });

  assert.equal(await database.sessions.get(pinned.id).then(Boolean), true);
  assert.equal(await database.sessions.get(pruned.id).then(Boolean), false);
  assert.equal(await database.toolRuns.where('sessionId').equals(pruned.id).count(), 0);
  assert.equal(await database.agentEvents.where('sessionId').equals(pruned.id).count(), 0);

  await assert.rejects(() => readSessionSnapshot(pruned.id), /Session not found/);
}

async function testUnlimitedRetentionDisablesPrune() {
  await resetDatabase();
  await setSessionRetentionLimit(UNLIMITED_SESSION_RETENTION);

  for (let index = 1; index <= 35; index += 1) {
    await createSession({ title: `Session ${index}`, now: index });
  }

  assert.equal(await database.sessions.count(), 35);
}

async function resetDatabase() {
  database.close();
  await database.delete();
  await initializeDatabase();
}
