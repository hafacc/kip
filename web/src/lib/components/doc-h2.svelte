<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<h2 class="mt-10 text-xl font-bold tracking-[-0.02em]">{@render children()}</h2>
