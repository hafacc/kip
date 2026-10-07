<script lang="ts">
  import { isExpired } from "../format";
  import { roomList, toPortalRoom } from "../rooms";
  import { kip } from "../store.svelte";
  import type { AvailabilityWindow, Booking, Listing } from "../types";
  import Avatar from "./avatar.svelte";
  import OfferHeading from "./offer-heading.svelte";
  import RoomDetail from "./room-detail.svelte";
  import { groupByOffer, hasRooms } from "./rooms";
  import SlotRow from "./slot-row.svelte";
  import Group from "./ui/group.svelte";
  import Section from "./ui/section.svelte";
  import { visibleStays } from "./visible-stays.svelte";

  // A friend's place, with the dates that can be asked for.
  let {
    listing,
    windows,
  }: {
    listing: Listing;
    windows: readonly AvailabilityWindow[];
  } = $props();

  const host = $derived(
    kip.friends.find((friend) => friend.uid === listing.ownerId),
  );
  const stays = visibleStays(() => windows);
  // A taken range is listed only when its stay is readable — which happens for
  // your own, and for a friend who shares theirs. Everyone else's simply isn't
  // here, so an unexplained "Booked" never appears.
  const dates = $derived(
    windows
      .filter(
        (window) =>
          !isExpired(window.end) &&
          (window.status === "OPEN" ||
            (window.bookingId != null && stays.held.has(window.bookingId))),
      )
      .sort((left, right) => left.start.localeCompare(right.start)),
  );
  const anyHeld = $derived(dates.some((window) => window.status !== "OPEN"));
  const groups = $derived(
    hasRooms(listing)
      ? groupByOffer(roomList(listing).map(toPortalRoom), dates)
      : null,
  );

  function stayOn(window: AvailabilityWindow): Booking | null {
    return window.bookingId ? (stays.held.get(window.bookingId) ?? null) : null;
  }
</script>

<div
  class="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-8"
>
  <div class="flex min-w-0 flex-col gap-5">
    {#if host}
      <button
        type="button"
        onclick={() => kip.navigate({ kind: "person", id: host.uid })}
        class="bg-accent-soft flex items-center gap-3 rounded-2xl p-3.5 text-left"
      >
        <Avatar
          name={host.displayName}
          photoURL={host.photoURL}
          class="h-12 w-12 text-base"
          ring
        />
        <span class="min-w-0">
          <span class="block truncate font-bold text-accent-ink">
            {host.displayName}'s place
          </span>
          <span class="block text-sm text-accent-ink/80">You're friends</span>
        </span>
      </button>
    {/if}
    <RoomDetail {listing} thumbnails />
  </div>

  <aside class="md:sticky md:top-24">
    <!-- Named for what's in it: "Open dates" would be a lie the moment a taken
         one is listed alongside. -->
    <Section title={anyHeld ? "Dates" : "Open dates"}>
      {#if dates.length === 0 || groups?.length === 0}
        <p class="px-1 text-sm text-muted">No open dates right now.</p>
      {:else if groups}
        <div class="flex flex-col gap-5">
          {#each groups as group (group.room?.id ?? "whole")}
            <div class="flex flex-col gap-2">
              <OfferHeading type={listing.type} room={group.room} />
              <Group>
                {#each group.windows as window (window.id)}
                  <!-- The house's picture beside a room's dates would pass for
                       the room; its own cover is in the heading. -->
                  <SlotRow
                    {listing}
                    {window}
                    stay={stayOn(window)}
                    thumbnail={group.room === null}
                  />
                {/each}
              </Group>
            </div>
          {/each}
        </div>
      {:else}
        <Group>
          {#each dates as window (window.id)}
            <SlotRow {listing} {window} stay={stayOn(window)} />
          {/each}
        </Group>
      {/if}
    </Section>
  </aside>
</div>
