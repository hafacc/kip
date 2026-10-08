<script lang="ts">
  import { fetchRoom } from "../listings";
  import { kip } from "../store.svelte";
  import type { AvailabilityWindow, Listing } from "../types";
  import RoomFriendView from "./room-friend-view.svelte";
  import RoomOwnerView from "./room-owner-view.svelte";

  // The single place surface: owner console, or the bookable friend view.
  let { id }: { id: string } = $props();

  let fetched = $state.raw<{
    listing: Listing;
    windows: readonly AvailabilityWindow[];
  } | null>(null);
  let looked = $state(false);

  // A guest pointer opens the place and not its calendar, so dates come back
  // empty for a stay at a non-friend's.
  const loaded = $derived(
    kip.myListings.find((listing) => listing.id === id) ??
      kip.friendListings.find((listing) => listing.id === id) ??
      kip.tripListings.find((listing) => listing.id === id),
  );
  const haveLoaded = $derived(loaded !== undefined);

  // Arriving straight here finds nothing loaded, so ask for THIS place rather
  // than every friend's — and don't call it missing until the answer is in.
  $effect(() => {
    if (haveLoaded) return;
    let live = true;
    looked = false;
    fetchRoom(id)
      .then((room) => {
        if (live) fetched = room;
      })
      .catch((error) => console.error("fetchRoom", error))
      .finally(() => {
        if (live) looked = true;
      });
    return () => {
      live = false;
    };
  });

  // The state outlives a move to another room, so only this room's fetch counts.
  const local = $derived(fetched?.listing.id === id ? fetched : null);
  const room = $derived(loaded ?? local?.listing);
</script>

{#if !room}
  {#if looked}
    <p class="text-muted">This place isn't available right now.</p>
  {:else}
    <p class="text-muted">Loading…</p>
  {/if}
{:else if room.ownerId === kip.user?.uid}
  <RoomOwnerView listing={room} />
{:else}
  <RoomFriendView
    listing={room}
    windows={kip.friendWindows[id] ?? local?.windows ?? []}
  />
{/if}
