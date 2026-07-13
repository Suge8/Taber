<script lang="ts">
  import { onMount } from 'svelte';
  import { MAX_PERSONAL_PROFILE_CHARS, readPersonalProfile, setPersonalProfile } from '$lib/personal-profile.ts';
  import { messages, type Locale } from '$lib/sidepanel-i18n.ts';
  import type { Notify } from './toast.ts';

  interface Props {
    locale: Locale;
    onChanged?: () => void;
    notify?: Notify;
  }

  let { locale, onChanged, notify }: Props = $props();

  let t = $derived(messages[locale].profile);
  let saved = $state('');
  let draft = $state('');
  let loading = $state(true);
  let saving = $state(false);
  const dirty = $derived(!loading && draft.trim() !== saved);

  onMount(() => {
    void load();
  });

  async function load() {
    try {
      saved = await readPersonalProfile();
      draft = saved;
    } catch (error) {
      notify?.({ tone: 'error', icon: 'database', text: error instanceof Error ? error.message : String(error) });
    } finally {
      loading = false;
    }
  }

  async function save() {
    // Snapshot before the await: keystrokes typed while saving must survive
    // (they stay in draft and keep the dirty state) instead of being overwritten.
    const value = draft;
    saving = true;
    try {
      await setPersonalProfile(value);
      saved = value.trim();
      if (draft === value) draft = saved;
      onChanged?.();
      notify?.({ tone: 'success', text: t.saved });
    } catch (error) {
      notify?.({ tone: 'error', icon: 'database', text: error instanceof Error ? error.message : String(error) });
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-2">
  <p class="text-muted-foreground text-[11px] font-medium tracking-[0.04em] uppercase">{t.title}</p>
  <textarea
    bind:value={draft}
    rows="6"
    maxlength={MAX_PERSONAL_PROFILE_CHARS}
    placeholder={t.placeholder}
    disabled={loading}
    class="bg-surface-2 ring-line/60 placeholder:text-muted-foreground/60 focus:ring-primary/40 w-full resize-y rounded-xl px-3 py-2.5 text-[13px] leading-relaxed text-foreground ring-1 transition-shadow duration-150 ease-[var(--ease-out)] focus:outline-none focus:ring-2 disabled:opacity-45"
  ></textarea>
  <div class="flex items-start justify-between gap-3">
    <p class="text-muted-foreground min-w-0 flex-1 text-[11.5px] leading-relaxed">{t.hint}</p>
    {#if dirty}
      <button
        type="button"
        class="bg-primary text-primary-foreground shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium shadow-[0_1px_2px_oklch(0_0_0_/_0.08)] transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-primary/90 active:scale-[0.96] disabled:opacity-45"
        disabled={saving}
        onclick={() => void save()}
      >
        {t.save}
      </button>
    {/if}
  </div>
</div>
