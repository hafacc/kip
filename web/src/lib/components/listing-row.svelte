<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import { todayIso } from "../format";
  import { listingTypeIcon } from "../listing-icons";
  import { listingTypeLabel } from "../listings";
  import { kip } from "../store.svelte";
  import type { Listing } from "../types";
  import CoverPhoto from "./cover-photo.svelte";
  import Chip from "./ui/chip.svelte";
  import Row from "./ui/row.svelte";

  // One of your own places in the Places list; opens it.
  let { listing }: { listing: Listing } = $props();

  const windows = $derived(kip.myWindows[listing.id] ?? []);
  const open = $derived(
    windows.filter((window) => window.status === "OPEN").length,
  );
  const booked = $derived(
    windows.filter((window) => window.status === "BOOKED").length,
  );
  // The same boundary the list below uses: an ask for dates that have gone can
  // never be confirmed, so counting it here would promise a request the section
  // no longer holds.
  const pending = $derived.by(() => {
    const today = todayIso();
    return kip.incomingBookings.filter(
      (booking) =>
        booking.listingId === listing.id &&
        booking.status === "REQUESTED" &&
        booking.end >= today,
    ).length;
  });

  const meta = $derived(
    [
      listingTypeLabel(listing.type),
      `${open} open`,
      booked > 0 ? `${booked} booked` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  const TypeIcon = $derived(listingTypeIcon(listing.type));
</script>

<Row
  onclick={() => kip.navigate({ kind: "room", id: listing.id })}
  ariaLabel={listing.title}
>
  <!-- A place you'd recognise on sight beats a bed icon, so the cover takes
       the leading slot when there is one. Same 40px square either way — the
       row keeps its rhythm whether or not a place has photos. -->
  <CoverPhoto photo={listing.photos[0]} class="h-10 w-10 shrink-0">
    {#snippet fallback()}
      <span
        class="bg-accent-soft grid h-10 w-10 shrink-0 place-items-center rounded-full text-accent-ink"
      >
        <TypeIcon width="18" height="18" />
      </span>
    {/snippet}
  </CoverPhoto>
  <div class="min-w-0 flex-1">
    <span class="block truncate text-[0.9375rem] font-semibold">
      {listing.title}
    </span>
    <span class="block truncate text-sm text-muted">{meta}</span>
  </div>
  {#if pending > 0}
    <Chip tone="pending">
      {pending}
      {pending === 1 ? "request" : "requests"}
    </Chip>
  {/if}
  <LuChevronRight class="shrink-0 text-faint" />
</Row>
