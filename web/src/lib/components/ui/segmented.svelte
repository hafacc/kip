<script lang="ts" module>
  // An inline segmented control: two or more equal-width options in a tonal pill
  // track, the active one raised as a white thumb. Each option is flex-1 so it
  // fits narrow screens — drives the listing type toggle and the theme picker.
  export type SegmentedOption<T extends string> = {
    readonly value: T;
    readonly label: string;
  };
</script>

<script lang="ts" generics="T extends string">
  let {
    options,
    value,
    onchange,
    ariaLabel,
  }: {
    options: readonly SegmentedOption<T>[];
    value: T;
    onchange: (next: T) => void;
    ariaLabel?: string;
  } = $props();
</script>

<fieldset
  aria-label={ariaLabel}
  class="flex min-w-0 gap-1 rounded-full border-0 bg-surface-muted p-1"
>
  {#each options as option (option.value)}
    {@const active = option.value === value}
    <button
      type="button"
      aria-pressed={active}
      onclick={() => onchange(option.value)}
      class="h-9 flex-1 rounded-full px-3 text-sm font-semibold transition {active
        ? "bg-surface text-text shadow-soft"
        : "text-muted hover:text-text"}"
    >
      {option.label}
    </button>
  {/each}
</fieldset>
