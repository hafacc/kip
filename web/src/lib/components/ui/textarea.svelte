<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";

  // The same shell as `Input`, for prose. Not a variant of it: a textarea has no
  // adornments, and its height is the caller's business rather than the shared
  // 44px every control otherwise stands at.
  let {
    class: className = "",
    value = $bindable(),
    ...rest
  }: Omit<HTMLTextareaAttributes, "class"> & { class?: string } = $props();
</script>

<textarea
  bind:value
  class="w-full rounded-xl border border-border bg-surface p-3.5 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 {className}"
  {...rest}
></textarea>
