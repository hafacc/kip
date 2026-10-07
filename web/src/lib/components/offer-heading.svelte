<script lang="ts">
  import { wholePlaceLabel } from "../rooms";
  import type { ListingType, PortalRoom } from "../types";
  import CoverPhoto from "./cover-photo.svelte";

  // The heading over one group of dates: a room with its cover and note, or the
  // whole place.
  let {
    type,
    room,
  }: {
    type: ListingType;
    room: PortalRoom | null;
  } = $props();
</script>

<div class="flex items-center gap-3 px-1">
  {#if room}
    <CoverPhoto
      photo={room.photos[0]}
      class="h-14 w-14 shrink-0 rounded-[1.125rem]!"
    />
  {/if}
  <span class="min-w-0 flex-1">
    <span class="block text-[0.9375rem] font-bold">
      {room ? room.name : wholePlaceLabel(type)}
    </span>
    {#if room?.note}
      <span class="block text-sm text-muted">{room.note}</span>
    {/if}
  </span>
</div>
