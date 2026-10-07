<script lang="ts">
  let {
    checked,
    onchange,
    label,
    description,
    srSuffix,
    disabled = false,
    unavailable,
  }: {
    checked: boolean;
    onchange: (next: boolean) => void;
    label: string;
    description?: string;
    // Read aloud after the label, for a list where the same labels appear once
    // per channel and the heading that tells them apart is not part of any name.
    srSuffix?: string;
    disabled?: boolean;
    // Words in place of the toggle, for a row this channel cannot carry at all.
    // A row rather than an omission, so two channels' lists line up label for
    // label — a missing row reads as an oversight, and the footnote that used to
    // explain the gap sat several rows away from the gap it was about. Not a
    // button: there is nothing here to press.
    unavailable?: string;
  } = $props();
</script>

{#if unavailable}
  <div class="flex w-full items-center gap-3 px-4 py-3 text-left">
    <span class="min-w-0 flex-1 text-[0.9375rem] font-semibold text-muted">
      {label}
    </span>
    <span class="shrink-0 text-sm text-muted">{unavailable}</span>
  </div>
{:else}
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    {disabled}
    onclick={() => onchange(!checked)}
    class="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-50"
  >
    <span class="min-w-0 flex-1">
      <span class="block text-[0.9375rem] font-semibold">
        {label}
        {#if srSuffix}
          <span class="sr-only">{` ${srSuffix}`}</span>
        {/if}
      </span>
      {#if description}
        <span class="mt-0.5 block text-sm text-muted">{description}</span>
      {/if}
    </span>
    <span
      class="relative h-[1.625rem] w-11 shrink-0 rounded-full transition {checked
        ? "bg-gradient-accent shadow-glow"
        : "bg-surface-hover"}"
    >
      <span
        class="absolute top-0.5 left-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-white shadow-soft transition-transform {checked
          ? "translate-x-[1.125rem]"
          : ""}"
      ></span>
    </span>
  </button>
{/if}
