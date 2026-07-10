// Persist streaming deltas in batches without delaying visible updates.
export const DELTA_FLUSH_CHARS = 512;
export const DELTA_FLUSH_AGE_MS = 300;

type EmitEvent = (type: string, payload: Record<string, unknown>) => Promise<void>;
type Scheduler = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(timer: unknown): void;
};

const defaultScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>),
};

export function createDeltaCoalescer(emit: EmitEvent, scheduler: Scheduler = defaultScheduler) {
  let buffer: { type: string; key: string; base: Record<string, unknown>; delta: string } | undefined;
  let timer: unknown;
  let emitTail = Promise.resolve();

  function queueFlush() {
    if (timer !== undefined) scheduler.clearTimeout(timer);
    timer = undefined;
    if (!buffer) return;
    const { type, base, delta } = buffer;
    buffer = undefined;
    emitTail = emitTail.then(() => emit(type, { ...base, delta }));
    void emitTail.catch(() => undefined);
  }

  async function flush() {
    queueFlush();
    await emitTail;
  }

  async function append(type: string, key: string, base: Record<string, unknown>, delta: string) {
    if (buffer && (buffer.type !== type || buffer.key !== key)) await flush();
    buffer ??= { type, key, base, delta: '' };
    buffer.delta += delta;
    if (buffer.delta.length >= DELTA_FLUSH_CHARS) await flush();
    else if (timer === undefined) timer = scheduler.setTimeout(queueFlush, DELTA_FLUSH_AGE_MS);
  }

  return { append, flush };
}
