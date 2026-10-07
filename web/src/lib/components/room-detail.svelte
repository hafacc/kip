<script lang="ts">
  import LuMapPin from "~icons/lucide/map-pin";
  import { placeTypeLabel } from "../listings";
  import { roomList } from "../rooms";
  import type { Listing } from "../types";
  import PhotoGallery from "./photo-gallery.svelte";
  import Chip from "./ui/chip.svelte";

  // A place's photos, title, type, location and description. `thumbnails` is the
  // one difference between the views: the owner already has a rail further down
  // that reorders, so a second one would mean two things at once.
  let {
    listing,
    thumbnails,
  }: {
    listing: Listing;
    thumbnails: boolean;
  } = $props();
</script>

<div class="flex flex-col gap-3">
  <PhotoGallery
    photos={listing.photos}
    {thumbnails}
    heroClass="aspect-[3/2] max-h-[26rem] w-full sm:aspect-[16/9]"
  />
  <h2 class="text-2xl font-extrabold tracking-[-0.03em]">{listing.title}</h2>
  <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
    <Chip tone="type">
      {placeTypeLabel(listing.type, roomList(listing).length)}
    </Chip>
    <span class="flex min-w-0 items-center gap-1.5">
      <LuMapPin width="14" height="14" class="shrink-0" />
      <span class="truncate">{listing.location.label}</span>
    </span>
  </div>
  {#if listing.description}
    <p class="text-[0.9375rem] leading-relaxed text-text/90">
      {listing.description}
    </p>
  {/if}
</div>
