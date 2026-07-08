import type { ProviderKind } from './db.ts';

export function showManualContextWindowInput(kind: ProviderKind) {
  return kind === 'openaiCompatible';
}
