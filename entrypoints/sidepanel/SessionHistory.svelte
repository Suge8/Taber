<script lang="ts">
  import { tick } from 'svelte';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Plus from '@lucide/svelte/icons/plus';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import type { SessionListItem } from '$lib/db.ts';
  import { formatTime, messages, type Locale } from '$lib/sidepanel-i18n.ts';

  interface Props {
    locale: Locale;
    sessions: SessionListItem[];
    currentSessionId: number | null;
    onSelect: (sessionId: number) => void | Promise<void>;
    onNew: () => void | Promise<void>;
  }

  let { locale, sessions, currentSessionId, onSelect, onNew }: Props = $props();
  let t = $derived(messages[locale].history);
  let open = $state(false);
  let contentElement = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (open) void positionCurrentSession();
  });

  async function positionCurrentSession() {
    await tick();
    if (!open || !contentElement) return;

    const currentItem = contentElement.querySelector<HTMLElement>('[data-current-session]');
    if (!currentItem) {
      contentElement.scrollTop = 0;
      return;
    }

    const actions = contentElement.querySelector<HTMLElement>('[data-history-actions]');
    const offset = currentItem.getBoundingClientRect().top
      - contentElement.getBoundingClientRect().top
      - (actions?.offsetHeight ?? 0);
    contentElement.scrollTop = Math.max(0, contentElement.scrollTop + offset);
  }

  async function selectSession(sessionId: number) {
    open = false;
    await onSelect(sessionId);
  }

  async function newSession() {
    open = false;
    await onNew();
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="text-muted-foreground hover:text-foreground flex size-10 items-center justify-center rounded-full transition-[color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96]" aria-label={t.aria}>
    <MessageCircle class="fx-icon-draw size-[18px]" strokeWidth={1.9} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content bind:ref={contentElement} align="end" data-smoke="session-history" class="max-h-[400px] min-w-[280px] overflow-y-auto rounded-2xl p-2 pt-0">
    <div data-history-actions class="bg-popover sticky top-0 z-10 pb-1 pt-2">
      <DropdownMenu.Item
        class="group/new text-primary bg-primary/8 hover:bg-primary/12 data-highlighted:bg-primary/12 data-highlighted:text-primary w-full gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-out)] hover:shadow-[0_3px_10px_oklch(0_0_0_/_0.04)] active:scale-[0.98]"
        onclick={() => void newSession()}
      >
        <Plus class="size-4 transition-transform duration-[var(--d-base)] ease-[var(--ease-out)] group-hover/new:rotate-90 group-hover/new:scale-110" strokeWidth={2.1} />
        {t.newSession}
      </DropdownMenu.Item>
    </div>
    {#if sessions.length > 0}
      <div class="mt-0.5 space-y-0.5">
        {#each sessions as session (session.id)}
          {@const active = currentSessionId === session.id}
          <DropdownMenu.Item
            data-current-session={active ? '' : undefined}
            aria-current={active ? 'true' : undefined}
            onclick={() => void selectSession(session.id)}
            class="items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors duration-150 ease-[var(--ease-out)]"
          >
            <span class={active ? 'bg-primary size-1.5 shrink-0 scale-100 rounded-full transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out)]' : 'border-line size-1.5 shrink-0 scale-90 rounded-full border transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out)]'}></span>
            <span class="min-w-0 flex-1 truncate">{session.title}</span>
            <span class="text-muted-foreground/80 shrink-0 text-[11px] tabular">
              {session.pinned ? `${t.pinned} · ` : ''}{formatTime(locale, session.updatedAt)}
            </span>
          </DropdownMenu.Item>
        {/each}
      </div>
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>
