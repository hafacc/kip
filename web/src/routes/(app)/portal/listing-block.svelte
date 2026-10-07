<script lang="ts">
  import OfferHeading from "#lib/components/offer-heading.svelte";
  import PhotoGallery from "#lib/components/photo-gallery.svelte";
  import { groupByOffer } from "#lib/components/rooms.ts";
  import Busy from "#lib/components/ui/busy.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import Chip from "#lib/components/ui/chip.svelte";
  import { formatDateRange, nights } from "#lib/format.ts";
  import { listingTypeIcon } from "#lib/listing-icons.ts";
  import { listingTypeLabel, placeTypeLabel } from "#lib/listings.ts";
  import type { PortalListing, PortalWindow } from "#lib/types.ts";
  import LuBed from "~icons/lucide/bed";
  import LuMapPin from "~icons/lucide/map-pin";
  import type { OnAsk } from "./ask.ts";

  let {
    listing,
    roomLink,
    windows,
    canAsk,
    requestedWindowIds,
    busy,
    onask,
  }: {
    listing: PortalListing;
    // A link to one room: the card is that room, and the place is only where it is.
    roomLink: boolean;
    windows: readonly PortalWindow[];
    canAsk: boolean;
    requestedWindowIds: readonly string[];
    busy: string | null;
    onask: OnAsk;
  } = $props();

  const only = $derived(roomLink ? (listing.rooms[0] ?? null) : null);
  const TypeIcon = $derived(only ? LuBed : listingTypeIcon(listing.type));
  const note = $derived(only ? only.note : listing.description);
  // Under a room link every date is that room's, so there is nothing to group.
  const groups = $derived(
    !only && listing.rooms.length > 0
      ? groupByOffer(listing.rooms, windows)
      : null,
  );
  // A slot link carries only the room its dates are in, so a count off it would
  // say "1 room" of a house that has three.
  const typeLabel = $derived(
    only
      ? listingTypeLabel("ROOM")
      : placeTypeLabel(
          listing.type,
          listing.windowIds ? 0 : listing.rooms.length,
        ),
  );
</script>

{#snippet dates(
  shown: readonly PortalWindow[],
)}
  <ul class="flex flex-col divide-y divide-border border-t border-border">
    {#each shown as slot (slot.id)}
      <li class="flex items-center gap-3 py-3">
        <div class="min-w-0 flex-1">
          <span class="block text-[0.9375rem] font-semibold">
            {formatDateRange(slot.start, slot.end)}
          </span>
          <p class="text-sm text-muted">
            {`${nights(slot.start, slot.end)} nights${slot.details ? ` · ${slot.details}` : ""}`}
          </p>
        </div>
        <!-- A range the visitor holds is listed only because it's theirs, so a
             stranger's grey chip would tell them nothing. -->
        {#if slot.bookedByMe}
          <Chip tone="confirmed">Booked by you</Chip>
        {:else if slot.booked}
          <Chip tone="booked">Booked</Chip>
        {:else if requestedWindowIds.includes(slot.id)}
          <Chip tone="pending">Requested</Chip>
        {:else if canAsk}
          <Button
            onclick={() => onask(listing.listingId, slot)}
            disabled={busy !== null}
          >
            {#if busy === slot.id}
              <Busy label="Request" />
            {:else}
              Request
            {/if}
          </Button>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div class="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card">
  <!-- The token in each URL is what opens the object, so a link-holder
       browses the same photos a friend would. -->
  <PhotoGallery
    photos={only ? only.photos : listing.photos}
    heroClass="h-44 w-full"
  />
  <div class="flex items-start gap-3">
    <span
      class="bg-accent-soft grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-accent-ink"
    >
      <TypeIcon width="18" height="18" />
    </span>
    <div class="min-w-0 flex-1">
      <h2 class="font-bold tracking-[-0.01em]">
        {only ? only.name : listing.title}
      </h2>
      <p class="flex items-center gap-1 text-sm text-muted">
        <LuMapPin class="shrink-0" width="14" height="14" />
        <span class="truncate">
          {`${only ? `In ${listing.title} · ` : ""}${listing.locationLabel}`}
        </span>
      </p>
    </div>
    <Chip tone="type" class="mt-0.5">{typeLabel}</Chip>
  </div>
  {#if note}
    <p class="text-[0.9375rem] leading-relaxed text-text/90">{note}</p>
  {/if}

  {#if windows.length === 0 || groups?.length === 0}
    <p class="border-t border-border pt-3 text-sm text-muted">
      No open dates right now.
    </p>
  {:else if groups}
    {#each groups as group (group.room?.id ?? "whole")}
      <div class="flex flex-col gap-2 pt-1">
        <OfferHeading type={listing.type} room={group.room} />
        {@render dates(group.windows)}
      </div>
    {/each}
  {:else}
    {@render dates(windows)}
  {/if}
</div>
