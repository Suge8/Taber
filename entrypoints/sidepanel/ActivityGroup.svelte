<script lang="ts">
  import { Response } from '$lib/components/ai-elements/response/index.js';
  import * as Tool from '$lib/components/ai-elements/tool/index.js';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '$lib/components/ui/collapsible/index.js';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Bug from '@lucide/svelte/icons/bug';
  import Clipboard from '@lucide/svelte/icons/clipboard';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import FileScan from '@lucide/svelte/icons/file-scan';
  import FolderCode from '@lucide/svelte/icons/folder-code';
  import IdCard from '@lucide/svelte/icons/id-card';
  import ImageDown from '@lucide/svelte/icons/image-down';
  import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
  import Navigation2 from '@lucide/svelte/icons/navigation-2';
  import PanelTopClose from '@lucide/svelte/icons/panel-top-close';
  import PanelsTopLeft from '@lucide/svelte/icons/panels-top-left';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import { cubicOut, quintOut } from 'svelte/easing';
  import { flip } from 'svelte/animate';
  import { rawToolDetails, toolHeaderSummary } from '$lib/sidepanel-tool-presentation.ts';
  import { activePart, activityEndedAt, activityStartedAt, type ActivityGroupStatus, type ActivityPart, type ToolTimelineItem } from '$lib/sidepanel-view.ts';
  import { messages, type Locale } from '$lib/sidepanel-i18n.ts';
  import type { Notify } from './toast.ts';

  interface Props {
    locale: Locale;
    parts: ActivityPart[];
    status: ActivityGroupStatus;
    notify?: Notify;
  }

  let { locale, parts, status, notify }: Props = $props();
  let live = $derived(status === 'running');
  let t = $derived(messages[locale]);
  let open = $state(false);
  const toolLabels = $derived({ pending: t.tool.pending, running: t.tool.running, completed: t.tool.completed, error: t.tool.error, warning: t.tool.warning });
  const stateClasses: Record<ActivityGroupStatus, { card: string; label: string }> = {
    running: { card: 'fx-beam ring-primary/15', label: 'fx-shimmer-text' },
    completed: { card: 'ring-success/30', label: 'text-success' },
    failed: { card: 'ring-danger/30', label: 'text-danger' },
    stopped: { card: 'ring-line/55', label: 'text-muted-foreground' },
    warning: { card: 'ring-warn/30', label: 'text-warn' },
  };
  let stateClass = $derived(stateClasses[status]);

  // Elapsed clock while live: timer display is the business semantics here.
  let now = $state(Date.now());
  $effect(() => {
    if (!live) return;
    const interval = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(interval);
  });

  // Opening jumps to the newest step and keeps following it; pause when the
  // user scrolls up, resume once they return near the bottom.
  let scrollElement = $state<HTMLDivElement | null>(null);
  let followLatest = $state(true);

  function handleActivityScroll() {
    if (!scrollElement) return;
    followLatest = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 56;
  }

  $effect(() => {
    if (open) followLatest = true;
  });

  $effect(() => {
    parts.length;
    if (open && followLatest && scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
  });

  async function copyToolDetails(tool: ToolTimelineItem) {
    await navigator.clipboard?.writeText(rawToolDetails(tool)).catch(() => undefined);
    notify?.({ tone: 'success', text: t.tool.copied });
  }

  // One-shot card pulse when a step lands.
  let pulse = $state(false);
  let knownCount = $state(0);
  $effect(() => {
    if (parts.length === knownCount) return;
    if (knownCount > 0) pulse = true;
    knownCount = parts.length;
  });

  let current = $derived(activePart(parts));
  let label = $derived(
    live ? partSummary(current)
      : status === 'failed' ? t.activity.failed(parts.length)
        : status === 'stopped' ? t.activity.stopped(parts.length)
          : status === 'warning' ? t.activity.warning(parts.length)
            : t.activity.completed(parts.length),
  );
  let stack = $derived(parts.slice(-3));
  let elapsedMs = $derived(live ? Math.max(0, now - activityStartedAt(parts)) : Math.max(0, activityEndedAt(parts) - activityStartedAt(parts)));
  let duration = $derived(formatDuration(elapsedMs));

  function partSummary(part: ActivityPart) {
    if (part.kind === 'reasoning') return part.reasoning.status === 'running' ? t.reasoning.thinking : t.reasoning.summary;
    return toolHeaderSummary(part.tool, t, locale);
  }

  function partIcon(part: ActivityPart) {
    return part.kind === 'reasoning' ? BrainCircuit : actionIcon(part.tool);
  }

  function partActive(part: ActivityPart) {
    const status = part.kind === 'tool' ? part.tool.status : part.reasoning.status;
    return status === 'running' || status === 'pending';
  }

  function partIconClass(part: ActivityPart) {
    if (status === 'stopped' && partActive(part)) return 'text-muted-foreground';
    if (part.kind === 'reasoning') return partActive(part) ? 'text-primary' : 'text-muted-foreground';
    return statusClass(part.tool);
  }

  function formatDuration(ms: number) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  /** 3D drum roll: new label rides the cylinder up from below, old one tips over the top edge. */
  function rollIn(_node: Element, { delay = 0 } = {}) {
    return {
      delay,
      duration: 560,
      easing: quintOut,
      css: (progress: number, remaining: number) =>
        `opacity:${Math.min(1, progress * 1.5)};transform-origin:50% 140%;transform:perspective(150px) translateY(${remaining * 130}%) rotateX(${remaining * -85}deg) scale(${0.75 + progress * 0.25});filter:blur(${remaining * 5}px)`,
    };
  }

  function rollOut(_node: Element) {
    return {
      duration: 300,
      easing: cubicOut,
      css: (progress: number, remaining: number) =>
        `opacity:${progress};transform-origin:50% -40%;transform:perspective(150px) translateY(${remaining * -115}%) rotateX(${remaining * 80}deg) scale(${0.85 + progress * 0.15});filter:blur(${remaining * 4}px)`,
    };
  }

  /** Odometer digit: rolls in from below its own cell. */
  function digitIn(_node: Element, { delay = 0 } = {}) {
    return { delay, duration: 360, easing: quintOut, css: (progress: number, remaining: number) => `transform:translateY(${remaining * 100}%)` };
  }

  function digitOut(_node: Element) {
    return { duration: 240, easing: cubicOut, css: (_progress: number, remaining: number) => `transform:translateY(${remaining * -100}%)` };
  }

  function chipIn(_node: Element, { delay = 0 } = {}) {
    return { delay, duration: 340, easing: quintOut, css: (progress: number, remaining: number) => `opacity:${progress};transform:scale(${0.25 + progress * 0.75});filter:blur(${remaining * 4}px)` };
  }

  /** Exit out of flow immediately so siblings flip into place without a second jump. */
  function chipOut(_node: Element) {
    return { duration: 150, easing: cubicOut, css: (progress: number, remaining: number) => `position:absolute;left:0;opacity:${progress};transform:scale(${0.25 + progress * 0.75});filter:blur(${remaining * 4}px)` };
  }

  type RecoverableOutput = Record<string, unknown> & { ok: false };

  function actionKey(tool: ToolTimelineItem) {
    const input = readRecord(tool.input);
    const output = readRecord(tool.output);
    if (tool.toolName === 'navigate') return readString(input?.action) || readString(output?.action) || 'open';
    if (tool.toolName === 'getDocument') return readString(input?.source) || readString(output?.source) || 'currentPage';
    if (tool.toolName === 'extractImage') return readString(input?.source) || readString(output?.source) || 'viewport';
    if (tool.toolName === 'browser') return readString(input?.action) || readString(output?.action) || 'browser';
    if (tool.toolName === 'debugger') return 'debugger';
    if (tool.toolName === 'browserRepl') return 'browserRepl';
    return 'tool';
  }

  function actionIcon(tool: ToolTimelineItem) {
    const key = actionKey(tool);
    if (key === 'back') return ArrowLeft;
    if (key === 'forward') return ArrowRight;
    if (key === 'reload') return RefreshCw;
    if (key === 'listTabs' || key === 'switchTab' || key === 'currentTab') return PanelsTopLeft;
    if (key === 'closeTab') return PanelTopClose;
    if (tool.toolName === 'navigate') return Navigation2;
    if (tool.toolName === 'getDocument') return FileScan;
    if (tool.toolName === 'extractImage') return ImageDown;
    if (tool.toolName === 'browser' || tool.toolName === 'browserRepl') return MousePointerClick;
    if (tool.toolName === 'debugger') return Bug;
    if (tool.toolName === 'fs') return readString(readRecord(tool.input)?.path) === '/profile.md' ? IdCard : FolderCode;
    return SquareTerminal;
  }

  function statusClass(tool: ToolTimelineItem) {
    if (tool.status === 'failed') return 'text-danger';
    if (status === 'stopped' && (tool.status === 'pending' || tool.status === 'running')) return 'text-muted-foreground';
    if (tool.status === 'pending' || tool.status === 'running') return 'text-primary fx-breathe';
    if (isRecoverableOutput(readRecord(tool.output))) return 'text-warn';
    return 'text-success';
  }

  function toolState(tool: ToolTimelineItem) {
    if (tool.status === 'failed') return 'output-error';
    if (tool.status === 'pending') return 'input-streaming';
    if (tool.status === 'running') return 'input-available';
    if (isRecoverableOutput(readRecord(tool.output))) return 'output-warning';
    return 'output-available';
  }

  function reasoningDetail(text: string) {
    return text.trim() || t.reasoning.empty;
  }

  function readRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  }

  function readString(value: unknown) {
    return typeof value === 'string' ? value : undefined;
  }

  function isRecoverableOutput(output: Record<string, unknown> | undefined): output is RecoverableOutput {
    return output?.ok === false;
  }
</script>

{#snippet odometer(text: string)}
  <span class="inline-flex">
    {#each text.split('') as char, charIndex (charIndex)}
      <span class="inline-grid overflow-hidden">
        {#key char}
          <span in:digitIn={{ delay: charIndex * 28 }} out:digitOut class="col-start-1 row-start-1 whitespace-pre">{char}</span>
        {/key}
      </span>
    {/each}
  </span>
{/snippet}

<div class={pulse ? 'fx-card-pulse' : ''} onanimationend={() => (pulse = false)}>
<Collapsible
  bind:open
  data-activity-status={status}
  class="not-prose w-full rounded-3xl bg-surface shadow-[inset_0_1px_0_oklch(1_0_0_/_0.06),0_1px_2px_oklch(0_0_0_/_0.04),0_16px_40px_oklch(0_0_0_/_0.08)] ring-1 transition-[box-shadow] duration-300 {stateClass.card}"
>
  <CollapsibleTrigger data-activity-trigger class="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
    <span class="relative flex shrink-0 items-center -space-x-3">
      {#each stack as part, chipIndex (part.id)}
        {@const PartIcon = partIcon(part)}
        {@const spread = chipIndex - (stack.length - 1) / 2}
        {@const lift = (Math.abs(spread) - (stack.length - 1) / 2) * 3}
        <span animate:flip={{ duration: 360, easing: quintOut }} in:chipIn out:chipOut class="relative">
          <span
            class="fx-fan flex size-9 items-center justify-center rounded-full bg-surface-2 shadow-[0_0_0_3px_var(--surface),inset_0_1px_0_oklch(1_0_0_/_0.08),0_2px_6px_oklch(0_0_0_/_0.1)] ring-1 ring-line/55"
            style="--fan-angle: {spread * 7}deg; --fan-shift: {chipIndex * 5}px; --fan-lift: {lift}px"
          >
            <PartIcon class="size-5.5 {partIconClass(part)}" strokeWidth={1.9} />
          </span>
        </span>
      {/each}
    </span>
    <span class="fx-roll-mask relative grid h-9 min-w-0 flex-1 items-center overflow-hidden">
      {#key label}
        <span data-activity-label in:rollIn out:rollOut class="col-start-1 row-start-1 min-w-0 truncate text-[14.5px] font-semibold leading-9 tracking-[-0.01em] {stateClass.label}">{label}</span>
      {/key}
    </span>
    <span class="flex shrink-0 items-center gap-2 leading-none tabular">
      {#key parts.length}
        <span class="fx-pop bg-surface-2 text-foreground/85 ring-line/45 inline-flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-semibold ring-1">{@render odometer(t.activity.steps(parts.length))}</span>
      {/key}
      <span class="text-[12.5px] font-semibold {live ? 'text-primary' : 'text-muted-foreground'}">{@render odometer(duration)}</span>
      <ChevronDown class="text-muted-foreground size-4 transition-transform duration-200 ease-[var(--ease-out)] group-data-[state=open]:rotate-180" />
    </span>
  </CollapsibleTrigger>
  <CollapsibleContent class="fx-tool-content rounded-b-3xl bg-surface/40">
    <div bind:this={scrollElement} onscroll={handleActivityScroll} class="max-h-[min(48vh,20rem)] space-y-2 overflow-y-auto overscroll-contain px-2 pb-2 pt-1 [scrollbar-gutter:stable]">
      {#each parts as part, index (part.id)}
        <div class="fx-enter" style="--fx-index: {Math.min(index, 4)}">
          {#if part.kind === 'tool'}
            {@const tool = part.tool}
            {@const ActionIcon = actionIcon(tool)}
            <Tool.Root class="rounded-lg border-0 bg-surface/85 shadow-none ring-1 ring-line/45">
              <Tool.Header type={toolHeaderSummary(tool, t, locale)} state={toolState(tool)} labels={toolLabels} icon={ActionIcon} iconClass={statusClass(tool)} class="px-2.5 py-2" />
              <Tool.Content class="rounded-b-lg bg-surface/40">
                <div class="relative px-3 pb-3 pt-1">
                  <button
                    type="button"
                    class="bg-surface/90 text-muted-foreground hover:text-foreground ring-line/50 absolute right-4 top-2 z-10 flex size-7 items-center justify-center rounded-lg ring-1 backdrop-blur-sm transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] hover:bg-surface active:scale-[0.94]"
                    aria-label={t.tool.copy}
                    title={t.tool.copy}
                    onclick={() => void copyToolDetails(tool)}
                  >
                    <Clipboard class="size-3.5" strokeWidth={1.9} />
                  </button>
                  <pre class="bg-muted/40 text-foreground/85 max-h-56 overflow-auto rounded-lg p-2 pr-10 font-mono text-[10.5px] leading-relaxed ring-1 ring-line/35">{rawToolDetails(tool)}</pre>
                </div>
              </Tool.Content>
            </Tool.Root>
          {:else}
            <Collapsible class="not-prose w-full rounded-lg bg-surface/85 shadow-none ring-1 ring-line/45">
              <CollapsibleTrigger class="group flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-primary/15 {part.reasoning.status === 'running' ? 'fx-breathe' : ''}"><BrainCircuit class="size-5" strokeWidth={1.9} /></span>
                  <span class="min-w-0 truncate text-[12px] font-medium leading-5">{t.reasoning.summary}</span>
                </span>
                <ChevronDown class="text-muted-foreground size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent class="fx-tool-content rounded-b-lg bg-surface/40 text-muted-foreground">
                <div class="px-3 pb-3 pt-2">
                  <Response content={reasoningDetail(part.reasoning.text)} class="text-[11.5px] leading-[1.65]" />
                </div>
              </CollapsibleContent>
            </Collapsible>
          {/if}
        </div>
      {/each}
    </div>
  </CollapsibleContent>
</Collapsible>
</div>
