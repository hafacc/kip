<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import type { ListingPhoto } from "../types";
  import RoomThumb from "./room-thumb.svelte";
  import Row from "./ui/row.svelte";

  // One room in a host's list; opens that room.
  let {
    name,
    note,
    photos,
    onopen,
  }: {
    name: string;
    note: string;
    photos: readonly ListingPhoto[];
    onopen: () => void;
  } = $props();
</script>

<Row onclick={onopen} ariaLabel={name}>
  <RoomThumb {photos} />
  <span class="min-w-0 flex-1">
    <span class="block truncate text-[0.9375rem] font-semibold">{name}</span>
    {#if note}
      <span class="block truncate text-sm text-muted">{note}</span>
    {/if}
  </span>
  <LuChevronRight class="shrink-0 text-faint" />
</Row>
