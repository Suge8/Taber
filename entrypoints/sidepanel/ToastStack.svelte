<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import CheckCircle from 'phosphor-svelte/lib/CheckCircle';
  import Database from 'phosphor-svelte/lib/Database';
  import GlobeSimple from 'phosphor-svelte/lib/GlobeSimple';
  import Info from 'phosphor-svelte/lib/Info';
  import Robot from 'phosphor-svelte/lib/Robot';
  import Sparkle from 'phosphor-svelte/lib/Sparkle';
  import Warning from 'phosphor-svelte/lib/Warning';
  import XCircle from 'phosphor-svelte/lib/XCircle';
  import type { ToastNotice, ToastTone } from './toast.ts';

  interface Props {
    items: ToastNotice[];
  }

  let { items }: Props = $props();

  function iconFor(item: ToastNotice) {
    const icon = item.icon ?? item.tone;
    if (icon === 'browser') return GlobeSimple;
    if (icon === 'database') return Database;
    if (icon === 'model') return Robot;
    if (icon === 'task') return Sparkle;
    if (icon === 'success') return CheckCircle;
    if (icon === 'error') return XCircle;
    if (icon === 'warning') return Warning;
    return Info;
  }

  function toneIconClass(tone: ToastTone) {
    if (tone === 'success') return 'bg-[var(--permission-success-badge)] text-[var(--permission-success-ink)]';
    if (tone === 'error') return 'bg-[color-mix(in_oklch,var(--danger-bg)_76%,var(--surface))] text-danger';
    if (tone === 'warning') return 'bg-[color-mix(in_oklch,var(--warn-bg)_76%,var(--surface))] text-warn';
    return 'bg-[color-mix(in_oklch,var(--accent)_10%,var(--surface-2))] text-foreground';
  }

  function toneSurfaceClass(tone: ToastTone) {
    if (tone === 'success') return 'bg-[var(--permission-success-card)] ring-[var(--permission-success-border)]';
    if (tone === 'error') return 'bg-[color-mix(in_oklch,var(--surface)_72%,var(--danger-bg))] ring-[color-mix(in_oklch,var(--danger-ink)_36%,transparent)]';
    if (tone === 'warning') return 'bg-[color-mix(in_oklch,var(--surface)_72%,var(--warn-bg))] ring-[color-mix(in_oklch,var(--warn-ink)_36%,transparent)]';
    return 'bg-[color-mix(in_oklch,var(--surface)_88%,var(--accent))] ring-[color-mix(in_oklch,var(--accent)_16%,transparent)]';
  }
</script>

<div class="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col items-end gap-2" aria-live="polite" aria-atomic="false">
  {#each items as item (item.id)}
    {@const Icon = iconFor(item)}
    <div
      role={item.tone === 'error' || item.tone === 'warning' ? 'alert' : 'status'}
      class="text-foreground pointer-events-auto flex max-w-[min(22rem,calc(100vw-1.5rem))] items-start gap-2.5 rounded-2xl px-3 py-2.5 text-[12.5px] shadow-[0_18px_50px_oklch(0_0_0_/_0.14)] ring-1 backdrop-blur-md {toneSurfaceClass(item.tone)}"
      transition:fly={{ y: -8, duration: 180, easing: cubicOut }}
    >
      <span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full {toneIconClass(item.tone)}">
        <Icon class="size-3.5" weight="duotone" />
      </span>
      <span class="min-w-0 flex-1 text-pretty leading-relaxed">{item.text}</span>
    </div>
  {/each}
</div>
