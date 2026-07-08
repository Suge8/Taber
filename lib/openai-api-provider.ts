import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  builtinProviderPresets,
  mergeProviderCatalog,
  readCachedModelCatalog,
  refreshModelCatalog,
  type ModelPreset,
  type ProviderPreset,
} from './model-catalog.ts';
import type { ProviderConnectionModelInput } from './provider-config-flow.ts';
import { OPENAI_API_BASE_URL } from './provider-kind.ts';

export { apiKeyProviderKind } from './provider-kind.ts';

export const OPENAI_API_PROVIDER_PRESET_ID = 'openai';

export type OpenAIApiModelCatalogInput = {
  baseURL: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export type OpenAIApiModelDiscoveryInput = OpenAIApiModelCatalogInput & {
  selectedModelNames: string[];
};

export type OpenAIApiModelCatalogSnapshot = {
  baseURL: string;
  apiKey: string;
  catalog: ProviderPreset;
};

export async function listOpenAIApiModelCatalog(input: OpenAIApiModelCatalogInput): Promise<ProviderPreset> {
  const accountModelIds = await fetchOpenAIApiModelIds(input.baseURL, input.apiKey, input.fetch);
  const preset = await readOpenAIProviderPreset(input.fetch);
  const metadata = new Map(preset.models.map((model) => [model.name, model]));
  return { ...preset, models: unique(accountModelIds).map((name) => metadata.get(name) ?? accountModelPreset(name)) };
}

export function createOpenAIApiModelCatalogSnapshot(input: OpenAIApiModelCatalogInput, catalog: ProviderPreset): OpenAIApiModelCatalogSnapshot {
  return { baseURL: normalizeBaseURL(input.baseURL), apiKey: input.apiKey.trim(), catalog };
}

export function currentOpenAIApiModelCatalog(snapshot: OpenAIApiModelCatalogSnapshot | null, input: OpenAIApiModelCatalogInput) {
  return snapshot?.baseURL === normalizeBaseURL(input.baseURL) && snapshot.apiKey === input.apiKey.trim() ? snapshot.catalog : null;
}

export async function discoverOpenAIApiModels(input: OpenAIApiModelDiscoveryInput): Promise<ProviderConnectionModelInput[]> {
  return selectOpenAIApiModels(await listOpenAIApiModelCatalog(input), input.selectedModelNames);
}

export function selectOpenAIApiModels(catalog: ProviderPreset, selectedModelNames: string[]): ProviderConnectionModelInput[] {
  const selectedNames = unique(selectedModelNames);
  if (selectedNames.length === 0) throw new Error('At least one model is required.');
  const available = new Set(catalog.models.map((model) => model.name));
  const missing = selectedNames.filter((name) => !available.has(name));
  if (missing.length > 0) throw new Error(`OpenAI API key cannot access selected model(s): ${missing.join(', ')}.`);
  return selectedNames.map((name) => modelInputFromPreset(name, catalog));
}

export async function fetchOpenAIApiModelIds(baseURL: string, apiKey: string, fetcher = fetch) {
  const response = await fetcher(joinUrl(baseURL, 'models'), {
    method: 'GET',
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!response.ok) throw new Error(`OpenAI models request failed: HTTP ${response.status} ${response.statusText}`);
  const body = await response.json().catch(() => undefined);
  const ids = readModelIds(body);
  if (ids.length === 0) throw new Error('OpenAI models response did not include any model ids.');
  return ids;
}

export function modelInputFromPreset(name: string, preset: ProviderPreset): ProviderConnectionModelInput {
  const model = preset.models.find((item) => item.name === name);
  return model ? modelInput(model) : { name, contextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS, supportedReasoningEfforts: [] };
}

async function readOpenAIProviderPreset(fetcher = fetch) {
  const catalog = await refreshModelCatalog(fetcher).catch(() => readCachedModelCatalog());
  return mergeProviderCatalog(catalog).find((provider) => provider.id === OPENAI_API_PROVIDER_PRESET_ID)
    ?? builtinProviderPresets.find((provider) => provider.id === OPENAI_API_PROVIDER_PRESET_ID)
    ?? { id: OPENAI_API_PROVIDER_PRESET_ID, name: 'OpenAI', baseURL: OPENAI_API_BASE_URL, models: [] };
}

function accountModelPreset(name: string): ModelPreset {
  return { name, contextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS, supportedReasoningEfforts: [] };
}

function modelInput(model: ModelPreset): ProviderConnectionModelInput {
  return {
    name: model.name,
    contextWindowTokens: model.contextWindowTokens,
    ...(model.displayName ? { displayName: model.displayName } : {}),
    supportedReasoningEfforts: model.supportedReasoningEfforts ?? [],
    ...(model.defaultReasoningEffort ? { defaultReasoningEffort: model.defaultReasoningEffort } : {}),
  };
}

function readModelIds(body: unknown) {
  if (!body || typeof body !== 'object') return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' ? [(item as { id: string }).id] : []);
}

function unique(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function normalizeBaseURL(baseURL: string) {
  return baseURL.trim().replace(/\/+$/, '');
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
