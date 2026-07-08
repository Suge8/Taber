import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const { database, initializeDatabase } = await import('../lib/db.ts');
const {
  getProviderApiKey,
  getSelectedModelId,
  listProvidersWithModels,
  testConnection,
  maskApiKey,
  getReasoningEffort,
  normalizeReasoningEffort,
  reasoningProviderOptions,
  reasoningProviderOptionsForModel,
  setReasoningEffort,
} = await import('../lib/provider-store.ts');
const {
  createProviderConnection,
  updateProviderConnection,
  deleteProviderConnection,
  saveOpenAICodexModels,
  selectModel,
} = await import('../lib/provider-config-flow.ts');

await initializeDatabase();

await testCreateOpenAIProviderConnectionUsesOfficialKind();
await testCreateCompatibleProviderConnectionIsAtomic();
await testUpdateProviderConnectionIsAtomic();
await testDeleteProviderConnectionCascades();
await testRemovingSelectedModelFallsBack();
await testCodexModelRefreshFallbackAndManualContext();
await testUpdateModelContextWindow();
await testDeleteProviderFallsBackToNextModel();
await testUpdateProviderValidates();
await testMaskApiKey();
await testReasoningEffortSettings();
await testReasoningProviderOptionsForModel();
await testOpenAICompatibleRequestOmitsUnsupportedReasoning();
await testConnectionUsesBearerAndModelsEndpoint();
await testConnectionFailsOnHttpError();

database.close();
console.info('provider-store tests passed');

async function reset() {
  await database.transaction('rw', database.providers, database.providerCredentials, database.models, database.settings, async () => {
    await database.providers.clear();
    await database.providerCredentials.clear();
    await database.models.clear();
    await database.settings.clear();
  });
}

async function testCreateOpenAIProviderConnectionUsesOfficialKind() {
  await reset();
  const created = await createProviderConnection({
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'sk-test1234',
    models: [{ name: 'gpt-5.4', contextWindowTokens: 200000, supportedReasoningEfforts: ['low', 'high'] }],
  });
  assert.equal(created.provider.kind, 'openaiApiKey');
  assert.equal(await getProviderApiKey(created.provider.id), 'sk-test1234');
  assert.equal(await getSelectedModelId(), created.models[0]!.id);

  const view = await listProvidersWithModels();
  assert.equal(view.length, 1);
  assert.equal(view[0]!.hasCredential, true);
  assert.equal(Object.hasOwn(view[0]!, 'apiKey'), false);
  assert.equal(view[0]!.models[0]!.name, 'gpt-5.4');
  assert.deepEqual(view[0]!.models[0]!.supportedReasoningEfforts, ['low', 'high']);
}

async function testCreateCompatibleProviderConnectionIsAtomic() {
  await reset();
  const created = await createProviderConnection({
    name: 'Compatible',
    baseURL: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    models: [
      { name: 'model-a', contextWindowTokens: 200000 },
      { name: 'model-b' },
    ],
  });
  assert.equal(created.provider.kind, 'openaiCompatible');
  assert.equal(created.models.length, 2);
  assert.equal(await getProviderApiKey(created.provider.id), 'sk-test');
  assert.equal(await getSelectedModelId(), created.models[0]!.id);

  await reset();
  await assert.rejects(
    () => createProviderConnection({ name: 'Broken', baseURL: 'https://broken.example', apiKey: 'k', models: [{ name: 'bad', contextWindowTokens: 0 }] }),
    /positive integer/,
  );
  assert.equal((await database.providers.toArray()).length, 0);
  assert.equal((await database.providerCredentials.toArray()).length, 0);
  assert.equal((await database.models.toArray()).length, 0);
  assert.equal(await getSelectedModelId(), null);
}

async function testUpdateProviderConnectionIsAtomic() {
  await reset();
  const created = await createProviderConnection({
    name: 'Original',
    baseURL: 'https://old.example',
    apiKey: 'old-key',
    models: [{ name: 'keep' }, { name: 'remove' }],
  });
  await selectModel(created.models[1]!.id);
  const updated = await updateProviderConnection(created.provider.id, {
    name: 'Renamed',
    baseURL: 'https://new.example',
    apiKey: 'new-key',
    models: [
      { id: created.models[0]!.id, name: 'kept', contextWindowTokens: 64000 },
      { name: 'new', contextWindowTokens: 32000 },
    ],
  });

  assert.equal(updated.provider.name, 'Renamed');
  assert.equal(updated.provider.baseURL, 'https://new.example');
  assert.equal(updated.provider.kind, 'openaiCompatible');
  assert.equal(await getProviderApiKey(created.provider.id), 'new-key');
  assert.deepEqual(updated.models.map((model) => model.name), ['kept', 'new']);
  assert.equal(updated.models.find((model) => model.name === 'kept')?.contextWindowTokens, 64000);
  assert.equal(await database.models.get(created.models[1]!.id), undefined);
  assert.equal(await getSelectedModelId(), created.models[0]!.id);
}

async function testDeleteProviderConnectionCascades() {
  await reset();
  const first = await createProviderConnection({ name: 'A', baseURL: 'https://a.example', apiKey: 'a', models: [{ name: 'a-model' }] });
  const second = await createProviderConnection({ name: 'B', baseURL: 'https://b.example', apiKey: 'b', models: [{ name: 'b-model' }] });
  await selectModel(first.models[0]!.id);
  const result = await deleteProviderConnection(first.provider.id);
  assert.deepEqual(result.removedModelIds, [first.models[0]!.id]);
  assert.equal(await database.providers.get(first.provider.id), undefined);
  assert.equal(await database.providerCredentials.get(first.provider.id), undefined);
  assert.equal(await database.models.get(first.models[0]!.id), undefined);
  assert.equal(await getSelectedModelId(), second.models[0]!.id);
}

async function testRemovingSelectedModelFallsBack() {
  await reset();
  const created = await createProviderConnection({ name: 'P', baseURL: 'https://example.com', apiKey: 'k', models: [{ name: 'm1' }, { name: 'm2' }] });
  await selectModel(created.models[0]!.id);
  const result = await updateProviderConnection(created.provider.id, {
    name: created.provider.name,
    baseURL: created.provider.baseURL,
    models: [{ id: created.models[1]!.id, name: 'm2' }],
  });
  assert.deepEqual(result.removedModelIds, [created.models[0]!.id]);
  assert.equal(await getSelectedModelId(), created.models[1]!.id);
}

async function testCodexModelRefreshFallbackAndManualContext() {
  await reset();
  const providerId = Number(await database.providers.add({
    kind: 'openaiCodex',
    name: 'ChatGPT subscription',
    baseURL: 'https://chatgpt.com/backend-api/codex',
    createdAt: 1,
    updatedAt: 1,
  }));
  await database.providerCredentials.put({
    providerId,
    kind: 'openaiCodexOAuth',
    value: { accessToken: 'access', refreshToken: 'refresh', expiresAt: 2, accountId: 'account' },
    updatedAt: 1,
  });
  const initial = await saveOpenAICodexModels(providerId, [{ name: 'gpt-5.5', contextWindowTokens: 128000 }], 10);
  await database.models.update(initial[0]!.id, { contextWindowTokens: 64000 });
  const refreshed = await saveOpenAICodexModels(providerId, [
    { name: 'gpt-5.5', contextWindowTokens: 272000 },
    { name: 'gpt-new', contextWindowTokens: 512000 },
  ], 20);
  assert.equal(refreshed.find((model) => model.name === 'gpt-5.5')?.contextWindowTokens, 64000);

  await selectModel(initial[0]!.id);
  const next = await saveOpenAICodexModels(providerId, [{ name: 'gpt-new', contextWindowTokens: 512000 }], 30);
  assert.equal((await database.models.get(initial[0]!.id))?.unavailable, true);
  assert.equal(await getSelectedModelId(), next[0]!.id);
}

async function testUpdateModelContextWindow() {
  await reset();
  const created = await createProviderConnection({ name: 'P', baseURL: 'https://example.com', apiKey: 'k', models: [{ name: 'm', contextWindowTokens: 200000 }] });
  assert.equal(created.models[0]!.contextWindowTokens, 200000);
  const updated = await updateProviderConnection(created.provider.id, {
    name: created.provider.name,
    baseURL: created.provider.baseURL,
    models: [{ id: created.models[0]!.id, name: 'm', contextWindowTokens: 64000 }],
  });
  assert.equal(updated.models[0]!.contextWindowTokens, 64000);
  await assert.rejects(() => updateProviderConnection(created.provider.id, {
    name: created.provider.name,
    baseURL: created.provider.baseURL,
    models: [{ id: created.models[0]!.id, name: 'm', contextWindowTokens: 0 }],
  }), /positive integer/);
}

async function testDeleteProviderFallsBackToNextModel() {
  await reset();
  const first = await createProviderConnection({ name: 'A', baseURL: 'https://a.example', apiKey: 'k', models: [{ name: 'm-a' }] });
  const second = await createProviderConnection({ name: 'B', baseURL: 'https://b.example', apiKey: 'k', models: [{ name: 'm-b' }] });
  await selectModel(first.models[0]!.id);
  const result = await deleteProviderConnection(first.provider.id);
  assert.equal(result.nextSelectedModelId, second.models[0]!.id);
  assert.equal(await getSelectedModelId(), second.models[0]!.id);
}

async function testUpdateProviderValidates() {
  await reset();
  const created = await createProviderConnection({ name: 'P', baseURL: 'https://example.com', apiKey: 'k', models: [{ name: 'm' }] });
  await assert.rejects(() => updateProviderConnection(created.provider.id, { baseURL: 'not a url', models: [{ id: created.models[0]!.id, name: 'm' }] }), /valid URL/);
  const updated = await updateProviderConnection(created.provider.id, { name: 'Renamed', apiKey: 'new-key', models: [{ id: created.models[0]!.id, name: 'm' }] });
  assert.equal(updated.provider.name, 'Renamed');
  assert.equal(Object.hasOwn(updated.provider, 'apiKey'), false);
  assert.equal(await getProviderApiKey(created.provider.id), 'new-key');
}

function testMaskApiKey() {
  assert.equal(maskApiKey('sk-abcd1234'), '••••1234');
  assert.equal(maskApiKey('xxx'), '••••');
}

async function testReasoningEffortSettings() {
  await reset();
  assert.equal(await getReasoningEffort(), 'default');
  assert.equal(normalizeReasoningEffort('unknown'), 'default');
  assert.equal(normalizeReasoningEffort('none'), 'none');
  assert.equal(normalizeReasoningEffort('minimal'), 'minimal');
  assert.equal(normalizeReasoningEffort('xhigh'), 'xhigh');
  assert.equal(reasoningProviderOptions('default'), undefined);
  assert.deepEqual(reasoningProviderOptions('none'), { openaiCompatible: { reasoningEffort: 'none' } });
  assert.deepEqual(reasoningProviderOptions('low'), { openaiCompatible: { reasoningEffort: 'low' } });
  assert.deepEqual(reasoningProviderOptions('medium'), { openaiCompatible: { reasoningEffort: 'medium' } });
  assert.deepEqual(reasoningProviderOptions('high'), { openaiCompatible: { reasoningEffort: 'high' } });
  assert.deepEqual(reasoningProviderOptions('xhigh'), { openaiCompatible: { reasoningEffort: 'xhigh' } });
  await setReasoningEffort('high');
  assert.equal(await getReasoningEffort(), 'high');
}

function testReasoningProviderOptionsForModel() {
  assert.throws(() => reasoningProviderOptionsForModel('low', undefined), /does not support reasoning effort/);
  assert.throws(() => reasoningProviderOptionsForModel('low', []), /none reported/);
  assert.equal(reasoningProviderOptionsForModel('default', ['low']), undefined);
  assert.deepEqual(reasoningProviderOptionsForModel('low', ['low', 'high']), { openaiCompatible: { reasoningEffort: 'low' } });
}

async function testOpenAICompatibleRequestOmitsUnsupportedReasoning() {
  let body: Record<string, unknown> = {};
  const model = createOpenAICompatible({
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    apiKey: 'sk-test',
    fetch: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion', created: 0, model: 'deepseek-v4-pro', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  })('deepseek-v4-pro') as any;

  await model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }], providerOptions: reasoningProviderOptionsForModel('default', undefined) });
  assert.equal(Object.hasOwn(body, 'reasoning_effort'), false);

  await model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }], providerOptions: reasoningProviderOptionsForModel('low', ['low']) });
  assert.equal(body.reasoning_effort, 'low');
}

async function testConnectionUsesBearerAndModelsEndpoint() {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedAuth = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    const headers = init?.headers as Record<string, string> | undefined;
    capturedAuth = headers?.Authorization ?? '';
    return new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await testConnection('https://api.example.com/v1/', 'sk-test');
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.modelIds, ['gpt-4o']);
    assert.equal(capturedUrl, 'https://api.example.com/v1/models');
    assert.equal(capturedAuth, 'Bearer sk-test');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testConnectionFailsOnHttpError() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('forbidden', { status: 403, statusText: 'Forbidden' })) as typeof fetch;
  try {
    const result = await testConnection('https://api.example.com', 'bad');
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.error.includes('403'));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
