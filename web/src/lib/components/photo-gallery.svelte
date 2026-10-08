<script lang="ts">
  import LuChevronLeft from "~icons/lucide/chevron-left";
  import LuChevronRight from "~icons/lucide/chevron-right";
  import { photoSrc } from "../photos";
  import type { ListingPhoto } from "../types";
  import CoverPhoto from "./cover-photo.svelte";
  import { RailFade } from "./rail-fade.svelte";
  import IconButton from "./ui/icon-button.svelte";

  // Scroll-snap, so touch costs no gesture code. The rail is optional because the
  // owner already has one that reorders, and one target can't carry two gestures.
  let {
    photos,
    thumbnails = true,
    heroClass = "",
  }: {
    photos: readonly ListingPhoto[];
    thumbnails?: boolean;
    heroClass?: string;
  } = $props();

  let hero = $state<HTMLDivElement>();
  let index = $state(0);
  // A hole in the middle would put every arrow press one photo out.
  const shown = $derived(
    photos.filter((photo) => photoSrc(photo.url) !== null),
  );
  const rail = new RailFade(() => shown.length);

  // Scrolls the rail itself, not the thumbnail into view: the gallery can sit
  // below the fold, and scrollIntoView would drag the page up to it.
  $effect(() => {
    const node = rail.node;
    const thumb = node?.querySelector<HTMLElement>(
      `[data-photo-index="${index}"]`,
    );
    if (!node || !thumb) return;
    node.scrollTo({
      left: thumb.offsetLeft - (node.clientWidth - thumb.clientWidth) / 2,
      behavior: "smooth",
    });
  });

  function show(position: number): void {
    if (!hero) return;
    hero.scrollTo({ left: hero.clientWidth * position, behavior: "smooth" });
  }

  const many = $derived(shown.length > 1);
</script>

{#if shown.length > 0}
  <div class="flex flex-col gap-2">
    <div class={`relative ${heroClass}`.trim()}>
      <!-- The scroll position IS which photo shows, so there's one source. -->
      <div
        bind:this={hero}
        onscroll={(event) => {
          const node = event.currentTarget;
          const at = Math.round(node.scrollLeft / node.clientWidth);
          index = Math.max(0, Math.min(shown.length - 1, at));
        }}
        class="flex h-full w-full snap-x snap-mandatory overflow-x-auto rounded-2xl"
      >
        {#each shown as photo (photo.id)}
          <CoverPhoto {photo} class="h-full w-full shrink-0 snap-center" />
        {/each}
      </div>
      {#if many}
        <IconButton
          label="Previous photo"
          variant="surface"
          disabled={index === 0}
          onclick={() => show(index - 1)}
          class="absolute left-2 top-1/2 -translate-y-1/2"
        >
          <LuChevronLeft />
        </IconButton>
        <IconButton
          label="Next photo"
          variant="surface"
          disabled={index === shown.length - 1}
          onclick={() => show(index + 1)}
          class="absolute right-2 top-1/2 -translate-y-1/2"
        >
          <LuChevronRight />
        </IconButton>
        <span
          class="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold tabular-nums text-white"
        >
          {index + 1}
          / {shown.length}
        </span>
      {/if}
    </div>

    {#if thumbnails && many}
      <!-- `relative` so a thumbnail's offsetLeft is measured against the rail. -->
      <div
        bind:this={rail.node}
        style:mask-image={rail.maskImage}
        class="relative flex gap-2 overflow-x-auto px-1 py-1"
      >
        {#each shown as photo, position (photo.id)}
          <button
            type="button"
            data-photo-index={position}
            aria-label={`Show photo ${position + 1} of ${shown.length}`}
            aria-current={position === index}
            onclick={() => show(position)}
            class="shrink-0 rounded-2xl transition {position === index
              ? "ring-2 ring-accent"
              : "opacity-70 hover:opacity-100"}"
          >
            <!-- The same 96px the editing strip uses. -->
            <CoverPhoto {photo} class="h-24 w-24" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
