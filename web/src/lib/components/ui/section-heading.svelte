<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    action,
  }: {
    children: Snippet;
    action?: Snippet;
  } = $props();
</script>

<div class="flex items-center justify-between gap-2 px-1">
  <!-- Never wraps to make room for its action — the action truncates instead,
       since titles here are short and fixed while an action can carry a
       user-chosen name. -->
  <h2 class="shrink-0 text-sm font-semibold text-muted">
    {@render children()}
  </h2>
  {@render action?.()}
</div>
