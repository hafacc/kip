<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";

  // text-base (≥16px) so iOS Safari doesn't zoom on focus. A suffix holding WORDS
  // rather than a glyph needs the text kept further clear of it, which is what
  // `wideSuffix` is for — the gutter can't just be widened for everyone, or the
  // handle field's tick sits in a hole.
  let {
    prefix,
    suffix,
    wideSuffix = false,
    invalid = false,
    class: className = "",
    value = $bindable(),
    element = $bindable(),
    ...rest
  }: Omit<HTMLInputAttributes, "class" | "prefix"> & {
    prefix?: string | Snippet;
    suffix?: Snippet;
    wideSuffix?: boolean;
    invalid?: boolean;
    class?: string;
    // Bind to hold the input itself.
    element?: HTMLInputElement;
  } = $props();

  const base =
    "h-11 w-full rounded-xl border border-border bg-surface text-base outline-none transition focus:ring-2";
  const tone = $derived(
    invalid
      ? "border-danger focus:border-danger focus:ring-danger/20"
      : "border-border focus:border-accent focus:ring-accent/20",
  );
  const leading = $derived(prefix ? "pl-8" : "pl-3.5");
  const wide = $derived(wideSuffix ? "pr-24" : "pr-10");
  const trailing = $derived(suffix ? wide : "pr-3.5");
</script>

<!-- Always the same tree, adorned or not: an adornment that comes and goes —
     one shown only while the field is empty, say — must never move the input,
     or the first keystroke drops focus and a phone closes its keyboard. -->
<div class="relative w-full">
  {#if prefix}
    <span
      class="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted"
    >
      {#if typeof prefix === "string"}
        {prefix}
      {:else}
        {@render prefix()}
      {/if}
    </span>
  {/if}
  <input
    bind:this={element}
    bind:value
    aria-invalid={invalid || undefined}
    class="{base} {tone} {leading} {trailing} {className}"
    {...rest}
  >
  {#if suffix}
    <span class="absolute inset-y-0 right-3.5 flex items-center">
      {@render suffix()}
    </span>
  {/if}
</div>
