<script lang="ts">
  import type { Snippet } from "svelte";

  // Inner text blocks should carry `min-w-0` + `truncate` so nothing overflows.
  let {
    onclick,
    children,
    class: className = "",
    ariaLabel,
  }: {
    onclick?: () => void;
    children: Snippet;
    class?: string;
    ariaLabel?: string;
  } = $props();

  const base = "flex w-full items-center gap-3 px-4 min-h-14 py-3 text-left";
</script>

{#if onclick}
  <button
    type="button"
    aria-label={ariaLabel}
    {onclick}
    class="{base} transition-colors hover:bg-surface-hover {className}"
  >
    {@render children()}
  </button>
{:else}
  <div class="{base} {className}">{@render children()}</div>
{/if}
