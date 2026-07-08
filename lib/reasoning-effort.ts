export const reasoningEffortLevels = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export type ReasoningEffortLevel = typeof reasoningEffortLevels[number];
export type ReasoningEffort = 'default' | ReasoningEffortLevel;

const reasoningEffortLevelSet = new Set<string>(reasoningEffortLevels);

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  return readReasoningEffortLevel(value) ?? 'default';
}

export function readReasoningEffortLevel(value: unknown): ReasoningEffortLevel | undefined {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return reasoningEffortLevelSet.has(text) ? text as ReasoningEffortLevel : undefined;
}

export function normalizeSupportedReasoningEfforts(value: unknown): ReasoningEffortLevel[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => readReasoningEffortLevel(item) ?? []))];
}

export function reasoningEffortOptionsForModel(model?: { supportedReasoningEfforts?: unknown }): ReasoningEffort[] {
  return ['default', ...normalizeSupportedReasoningEfforts(model?.supportedReasoningEfforts)];
}

export function normalizeReasoningEffortForModel(value: unknown, model?: { supportedReasoningEfforts?: unknown }): ReasoningEffort {
  const effort = normalizeReasoningEffort(value);
  if (effort === 'default') return effort;
  return normalizeSupportedReasoningEfforts(model?.supportedReasoningEfforts).includes(effort) ? effort : 'default';
}

export function assertReasoningEffortSupported(value: ReasoningEffort, supported: unknown, modelId: string) {
  if (value === 'default') return;
  const efforts = normalizeSupportedReasoningEfforts(supported);
  if (efforts.includes(value)) return;
  const label = efforts.length > 0 ? efforts.join(', ') : 'none reported';
  throw new Error(`Model ${modelId} does not support reasoning effort "${value}". Supported: ${label}. Choose Default or a supported effort.`);
}
