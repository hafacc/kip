<script lang="ts">
  import { photoSrc } from "../photos";

  // Pass sizing via `class` (e.g. "h-9 w-9 text-sm") — Tailwind needs literal
  // classes, so size can't be a number prop. `ring` wraps the avatar in a 2px
  // terracotta→amber gradient ring, used to feature a host.
  let {
    name,
    photoURL,
    class: className = "h-9 w-9 text-sm",
    ring = false,
  }: {
    name: string;
    photoURL: string | null;
    class?: string;
    ring?: boolean;
  } = $props();

  // Almost every avatar drawn here comes from a copy the person it describes
  // wrote — a friend edge, a booking, a share link — so the address is theirs to
  // choose and `photoSrc` is what keeps it from being an arbitrary one. A URL
  // that fails the check falls back to the initial, same as no photo at all.
  const src = $derived(photoURL === null ? null : photoSrc(photoURL));
</script>

{#snippet inner()}
  {#if src}
    <img
      {src}
      alt=""
      class="{className} shrink-0 rounded-full object-cover"
      referrerpolicy="no-referrer"
    >
  {:else}
    <span
      class="{className} grid shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-ink"
    >
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  {/if}
{/snippet}

{#if ring}
  <span
    class="bg-gradient-accent inline-flex shrink-0 rounded-full p-[2px] shadow-soft"
  >
    <span class="rounded-full border-2 border-surface">{@render inner()}</span>
  </span>
{:else}
  {@render inner()}
{/if}
