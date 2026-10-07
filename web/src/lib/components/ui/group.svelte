<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    class: className = "",
  }: {
    children: Snippet;
    class?: string;
  } = $props();
</script>

<div
  class="overflow-hidden rounded-3xl bg-surface shadow-card divide-y divide-border {className}"
>
  {@render children()}
</div>
