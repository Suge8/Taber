export type AgentStreamPart = { type: string; [key: string]: unknown };

export type AgentStreamResult = {
  fullStream: AsyncIterable<AgentStreamPart>;
  text: PromiseLike<string> | string;
};

export type AgentTextEvents = {
  createMessage: () => Promise<void>;
  appendText: (delta: string) => Promise<void>;
  startReasoning?: (input: { reasoningId: string }) => Promise<void>;
  appendReasoning?: (input: { reasoningId: string; delta: string }) => Promise<void>;
  completeReasoning?: (input: { reasoningId: string }) => Promise<void>;
  startToolInput?: (input: { toolCallId: string; toolName: string; title?: string }) => Promise<void>;
  appendToolInput?: (input: { toolCallId: string; delta: string }) => Promise<void>;
  completeToolInput?: (input: { toolCallId: string; toolName: string; input: unknown; title?: string }) => Promise<void>;
};

export async function collectAgentResponseText(result: AgentStreamResult, events: AgentTextEvents) {
  let text = '';
  let messageCreated = false;

  for await (const part of result.fullStream) {
    const failure = streamFailureMessage(part);
    if (failure) throw new Error(failure);
    await emitProgressEvent(part, events);
    if (part.type !== 'text-delta' || typeof part.text !== 'string') continue;
    if (!messageCreated) {
      await events.createMessage();
      messageCreated = true;
    }
    text += part.text;
    await events.appendText(part.text);
  }

  if (messageCreated) return text;

  text = await result.text;
  if (!text) return '';
  await events.createMessage();
  await events.appendText(text);
  return text;
}

async function emitProgressEvent(part: AgentStreamPart, events: AgentTextEvents) {
  if (part.type === 'reasoning-start') {
    const reasoningId = readString(part.id);
    if (reasoningId) await events.startReasoning?.({ reasoningId });
    return;
  }
  if (part.type === 'reasoning-delta') {
    const reasoningId = readString(part.id);
    const delta = readString(part.text) ?? readString(part.delta);
    if (reasoningId && delta) await events.appendReasoning?.({ reasoningId, delta });
    return;
  }
  if (part.type === 'reasoning-end') {
    const reasoningId = readString(part.id);
    if (reasoningId) await events.completeReasoning?.({ reasoningId });
    return;
  }
  if (part.type === 'tool-input-start') {
    const toolCallId = readString(part.id) ?? readString(part.toolCallId);
    const toolName = readString(part.toolName);
    if (toolCallId && toolName) await events.startToolInput?.({ toolCallId, toolName, title: readString(part.title) });
    return;
  }
  if (part.type === 'tool-input-delta') {
    const toolCallId = readString(part.id) ?? readString(part.toolCallId);
    const delta = readString(part.delta) ?? readString(part.inputTextDelta);
    if (toolCallId && delta) await events.appendToolInput?.({ toolCallId, delta });
    return;
  }
  if (part.type === 'tool-call') {
    const toolCallId = readString(part.toolCallId) ?? readString(part.id);
    const toolName = readString(part.toolName);
    if (toolCallId && toolName) await events.completeToolInput?.({ toolCallId, toolName, input: part.input, title: readString(part.title) });
  }
}

function streamFailureMessage(part: AgentStreamPart) {
  if (part.type === 'error') return stringifyError(part.error);
  if (part.type === 'abort') return part.reason === undefined ? 'Task aborted' : String(part.reason);
  if (part.type === 'finish' && part.finishReason === 'error') return 'Model response failed.';
  return undefined;
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  const message = isRecord(error) ? readString(error.message) : undefined;
  return message ?? String(error);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
