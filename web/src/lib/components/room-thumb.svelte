<script lang="ts">
  import LuBed from "~icons/lucide/bed";
  import type { ListingPhoto } from "../types";
  import CoverPhoto from "./cover-photo.svelte";

  // A room's cover, or a bed in a disc, so rows share one left edge either way.
  let { photos }: { photos: readonly ListingPhoto[] } = $props();
</script>

<CoverPhoto photo={photos[0]} class="h-10 w-10 shrink-0">
  {#snippet fallback()}
    <span
      class="bg-accent-soft grid h-10 w-10 shrink-0 place-items-center rounded-full text-accent-ink"
    >
      <LuBed width="18" height="18" />
    </span>
  {/snippet}
</CoverPhoto>
