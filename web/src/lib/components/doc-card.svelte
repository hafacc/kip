<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="mt-6 rounded-3xl bg-surface p-5 shadow-card">
  {@render children()}
</div>
