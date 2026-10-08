<script lang="ts">
  import LuRotateCw from "~icons/lucide/rotate-cw";
  import LuSlidersHorizontal from "~icons/lucide/sliders-horizontal";
  import { describeCriteria, searchListings } from "../search";
  import { kip } from "../store.svelte";
  import FilterSheet from "./filter-sheet.svelte";
  import PlaceCard from "./place-card.svelte";
  import IconButton from "./ui/icon-button.svelte";

  let filtersOpen = $state(false);
  let refreshing = $state(false);

  const matches = $derived(
    searchListings(kip.friendListings, kip.friendWindows, kip.criteria),
  );

  async function refresh(): Promise<void> {
    refreshing = true;
    try {
      await kip.refreshBrowse();
    } finally {
      refreshing = false;
    }
  }
</script>

{#if kip.user}
  <div class="flex flex-col gap-5">
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={() => (filtersOpen = true)}
        class="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface px-4 text-left text-sm font-medium shadow-soft transition hover:shadow-card"
      >
        <LuSlidersHorizontal class="shrink-0 text-accent-ink" />
        <span class="truncate">{describeCriteria(kip.criteria)}</span>
      </button>
      <IconButton label="Refresh" variant="surface" onclick={refresh}>
        <LuRotateCw class={refreshing ? "animate-spin" : ""} />
      </IconButton>
    </div>

    {#if kip.friends.length === 0}
      <p class="px-1 text-sm text-muted">
        Add some friends first — when they share a place, you'll see it here.
      </p>
    {:else if matches.length === 0}
      <p class="px-1 text-sm text-muted">
        {kip.criteria.near
          ? "No friends' places match — try a wider radius or dates."
          : "No friends' places free right now. Try widening your dates."}
      </p>
    {:else}
      <div class="gap-3 md:columns-2 lg:columns-3">
        {#each matches as match (match.listing.id)}
          <div class="mb-3 break-inside-avoid">
            <PlaceCard
              listing={match.listing}
              windows={match.windows}
              distanceKm={match.distanceKm}
            />
          </div>
        {/each}
      </div>
    {/if}

    <FilterSheet
      open={filtersOpen}
      onclose={() => (filtersOpen = false)}
      criteria={kip.criteria}
      setCriteria={kip.setCriteria}
      resultCount={matches.length}
    />
  </div>
{/if}
