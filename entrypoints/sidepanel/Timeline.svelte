<script lang="ts">
  import {
    Conversation,
    ConversationContent,
    ConversationEmptyState,
    ConversationScrollButton,
  } from '$lib/components/ai-elements/conversation/index.js';
  import { Message, MessageContent } from '$lib/components/ai-elements/message/index.js';
  import { Response } from '$lib/components/ai-elements/response/index.js';
  import Check from '@lucide/svelte/icons/check';
  import Clipboard from '@lucide/svelte/icons/clipboard';
  import ActivityGroup from './ActivityGroup.svelte';
  import { activityGroupStatus, groupTurnParts, type AssistantTimelineTurn, type TimelineEntry } from '$lib/sidepanel-view.ts';
  import { formatTime, messages, type Locale } from '$lib/sidepanel-i18n.ts';
  import type { Notify } from './toast.ts';

  interface Props {
    locale: Locale;
    entries: TimelineEntry[];
    notify?: Notify;
  }

  let { locale, entries, notify }: Props = $props();
  let t = $derived(messages[locale]);
  let copiedMessageId = $state<string | null>(null);

  async function copyMessage(id: string, text: string) {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    copiedMessageId = id;
    window.setTimeout(() => {
      if (copiedMessageId === id) copiedMessageId = null;
    }, 1200);
  }

  function assistantTurnText(turn: AssistantTimelineTurn) {
    return turn.parts.filter((part) => part.kind === 'text').map((part) => part.message.text).join('\n\n').trim();
  }

</script>

<Conversation class="bg-bg h-full">
  <ConversationContent class="gap-4 px-4 pb-4 pt-2">
    {#if entries.length === 0}
      <ConversationEmptyState class="fx-enter relative overflow-hidden text-muted-foreground">
        <div aria-hidden="true" class="taber-logo-image taber-logo-watermark pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"></div>
      </ConversationEmptyState>
    {:else}
      {#each entries as entry, index (entry.id)}
        <div class="fx-enter" style="--fx-index: {Math.min(index, 6)}">
          {#if entry.kind === 'message'}
            <Message from={entry.message.role === 'user' ? 'user' : 'assistant'} class="group/message max-w-full gap-0">
              <MessageContent class={entry.message.role === 'user'
                ? 'bg-surface text-foreground ring-line/55 rounded-3xl rounded-tr-lg px-4 py-3 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.06),0_1px_2px_oklch(0_0_0_/_0.04),0_10px_28px_oklch(0_0_0_/_0.05)] ring-1'
                : 'text-foreground'}>
                {#if entry.message.role === 'assistant'}
                  <Response content={entry.message.text} class="text-[14.5px] leading-[1.7]" />
                {:else}
                  <div class="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">{entry.message.text}</div>
                {/if}
              </MessageContent>
              {#if entry.message.role === 'assistant'}
                <div class="mt-1 flex h-7 items-center gap-2 pl-1 text-[10.5px] text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-within:opacity-100 tabular">
                  <button
                    type="button"
                    class="hover:bg-surface hover:text-foreground inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96]"
                    aria-label={t.tool.copy}
                    onclick={() => void copyMessage(entry.id, entry.message.text)}
                  >
                    {#if copiedMessageId === entry.id}<Check class="size-3" strokeWidth={2.2} />{t.tool.copied}{:else}<Clipboard class="size-3" />{t.tool.copy}{/if}
                  </button>
                  <span aria-hidden="true">·</span>
                  <span>{formatTime(locale, entry.message.createdAt)}</span>
                </div>
              {/if}
            </Message>
          {:else}
            {@const copyText = assistantTurnText(entry.turn)}
            {@const blocks = groupTurnParts(entry.turn.parts)}
            <Message from="assistant" class="group/message max-w-full gap-0">
              <MessageContent class="w-full text-foreground">
                <div class="w-full space-y-3.5 py-0.5">
                  {#each blocks as block, blockIndex (block.id)}
                    {#if block.kind === 'activity'}
                      <ActivityGroup {locale} parts={block.parts} status={activityGroupStatus(block.parts, entry.turn.status, blockIndex === blocks.length - 1)} {notify} />
                    {:else}
                      <Response content={block.message.text} class="text-[14.5px] leading-[1.7]" />
                    {/if}
                  {/each}
                </div>
              </MessageContent>
              {#if entry.turn.status !== 'running'}
                <div class="mt-1 flex h-7 items-center gap-2 pl-1 text-[10.5px] text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-within:opacity-100 tabular">
                  {#if copyText}
                    <button
                      type="button"
                      class="hover:bg-surface hover:text-foreground inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96]"
                      aria-label={t.tool.copy}
                      onclick={() => void copyMessage(entry.id, copyText)}
                    >
                      {#if copiedMessageId === entry.id}<Check class="size-3" strokeWidth={2.2} />{t.tool.copied}{:else}<Clipboard class="size-3" />{t.tool.copy}{/if}
                    </button>
                    <span aria-hidden="true">·</span>
                  {/if}
                  <span>{formatTime(locale, entry.turn.updatedAt)}</span>
                </div>
              {/if}
            </Message>
          {/if}
        </div>
      {/each}
    {/if}
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
