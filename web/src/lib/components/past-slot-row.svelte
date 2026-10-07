<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import { formatDateRange } from "../format";
  import { offerLabel, roomOf } from "../rooms";
  import type { AvailabilityWindow, Listing } from "../types";
  import Offer from "./offer.svelte";
  import { hasRooms } from "./rooms";
  import Chip from "./ui/chip.svelte";
  import Row from "./ui/row.svelte";

  // One set of dates that has gone, in the host's Past dates list; opens its
  // sheet.
  let {
    listing,
    window,
    asked,
    onopen,
  }: {
    listing: Listing;
    window: AvailabilityWindow;
    asked: number;
    onopen: () => void;
  } = $props();
</script>

<Row onclick={onopen} ariaLabel={formatDateRange(window.start, window.end)}>
  <div class="min-w-0 flex-1">
    <span class="block text-[0.9375rem] font-semibold">
      {formatDateRange(window.start, window.end)}
    </span>
    <span class="mt-0.5 flex flex-wrap items-center gap-2">
      {#if hasRooms(listing)}
        <Offer
          type={listing.type}
          room={roomOf(listing, window.roomId) !== null}
          label={offerLabel(listing, window.roomId)}
        />
      {/if}
      <span class="text-sm text-muted">
        {window.status === "BOOKED" ? "Someone stayed" : "Nobody booked these"}
      </span>
      <!-- Here too, and this is where it matters most: nothing ages an ask
           out, so a request for dates that have gone sits in someone's list
           until it is declined, and a past slot is the last place a host would
           think to look for one. -->
      {#if asked > 0}
        <Chip tone="pending">
          {asked === 1 ? "1 asked" : `${asked} asked`}
        </Chip>
      {/if}
    </span>
  </div>
  <LuChevronRight class="shrink-0 text-faint" />
</Row>
