<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import LuZap from "~icons/lucide/zap";
  import { formatDateRange, nights } from "../format";
  import { offerLabel, roomOf } from "../rooms";
  import type { AvailabilityWindow, Listing } from "../types";
  import Offer from "./offer.svelte";
  import { hasRooms } from "./rooms";
  import Chip from "./ui/chip.svelte";
  import Row from "./ui/row.svelte";

  // One set of current dates in the host's Availability list; opens its sheet.
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

  // Only a place with rooms has to say what a set of dates offers.
  const offered = $derived(hasRooms(listing));
  const chips = $derived(
    offered || window.status === "BOOKED" || window.autoAccept || asked > 0,
  );
</script>

<Row onclick={onopen} ariaLabel={formatDateRange(window.start, window.end)}>
  <div class="min-w-0 flex-1">
    <span class="block text-[0.9375rem] font-semibold">
      {formatDateRange(window.start, window.end)}
      <span class="font-normal text-muted">
        {` · ${nights(window.start, window.end)} nights`}
      </span>
    </span>
    {#if chips}
      <span class="mt-1 flex flex-wrap items-center gap-2">
        {#if offered}
          <Offer
            type={listing.type}
            room={roomOf(listing, window.roomId) !== null}
            label={offerLabel(listing, window.roomId)}
          />
        {/if}
        {#if window.status === "BOOKED"}
          <Chip tone="booked">Booked</Chip>
        {:else if window.autoAccept}
          <Chip tone="instant">
            {#snippet icon()}
              <LuZap width="12" height="12" />
            {/snippet}
            Instant
          </Chip>
        {/if}
        <!-- What makes the requests inside the sheet findable: without it a
             slot two people are waiting on looks exactly like one nobody has
             asked about, and the host has to open every slot to find out. -->
        {#if asked > 0}
          <Chip tone="pending">
            {asked === 1 ? "1 asked" : `${asked} asked`}
          </Chip>
        {/if}
        {#if window.details}
          <span class="text-sm text-muted">{window.details}</span>
        {/if}
      </span>
    {:else if window.details}
      <span class="block text-sm text-muted">{window.details}</span>
    {/if}
  </div>
  <LuChevronRight class="shrink-0 text-faint" />
</Row>
