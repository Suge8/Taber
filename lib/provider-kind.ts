import type { ProviderKind } from './db.ts';

export const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

export function apiKeyProviderKind(baseURL: string): ProviderKind {
  return isOpenAIApiBaseURL(baseURL) ? 'openaiApiKey' : 'openaiCompatible';
}

export function isOpenAIApiBaseURL(value: string) {
  try {
    const url = new URL(value);
    return url.origin === 'https://api.openai.com' && url.pathname.replace(/\/+$/, '') === '/v1';
  } catch {
    return false;
  }
}
