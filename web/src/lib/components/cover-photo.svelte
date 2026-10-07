<script lang="ts">
  import type { Snippet } from "svelte";
  import { photoSrc } from "../photos";
  import type { ListingPhoto } from "../types";

  // No photo is the ordinary case, so `fallback` differs by context: nothing on a
  // card, where a grey gap would be worse, but an icon in a row, which needs its
  // leading slot filled either way.
  let {
    photo,
    fallback,
    class: className = "",
  }: {
    photo: ListingPhoto | undefined;
    fallback?: Snippet;
    class?: string;
  } = $props();

  const src = $derived(photo ? photoSrc(photo.url) : null);
</script>

{#if src}
  <div
    class={`overflow-hidden rounded-2xl bg-surface-muted ${className}`.trim()}
  >
    <img {src} alt="" class="h-full w-full object-cover">
  </div>
{:else}
  {@render fallback?.()}
{/if}
