<script lang="ts" module>
  // A soft tonal status chip: a small pill with a low-contrast fill and a semibold
  // label, so it reads as a passive label — never as a button, even beside one.
  // Tones map to the app's states: pending (amber), confirmed (green), open and
  // instant (accent), booked (dimmed neutral), type (neutral fill for
  // ROOM/FLAT/HOUSE), neutral (cancelled / muted). Colour carries the meaning
  // and adapts to dark mode through the semantic tokens.
  export type ChipTone =
    | "pending"
    | "confirmed"
    | "open"
    | "booked"
    | "instant"
    | "type"
    | "neutral";

  const TONES: Record<ChipTone, string> = {
    pending: "bg-pending-soft text-pending",
    confirmed: "bg-success-soft text-success-ink",
    open: "bg-accent-soft text-accent-ink",
    booked: "bg-surface-muted text-muted",
    // The gradient belongs to controls, and this chip sits right beside the
    // gradient Book button on a slot row — two identical pills, one of which does
    // nothing. Tonal instead; the bolt carries the meaning.
    instant: "bg-accent-soft text-accent-ink",
    type: "bg-surface-muted text-muted uppercase tracking-[0.04em]",
    neutral: "bg-surface-muted text-muted",
  };
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    tone = "neutral",
    icon,
    class: className = "",
    children,
  }: {
    tone?: ChipTone;
    icon?: Snippet;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<span
  class="inline-flex w-fit shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6875rem] font-bold leading-none tracking-[0.02em] {TONES[
    tone
  ]} {className}"
>
  {@render icon?.()}{@render children()}
</span>
