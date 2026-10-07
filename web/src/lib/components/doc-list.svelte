<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<ul class="mt-4 list-disc space-y-2 pl-5 marker:text-faint">
  {@render children()}
</ul>
