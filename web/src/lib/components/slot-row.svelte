<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import LuZap from "~icons/lucide/zap";
  import { formatDateRange, nights } from "../format";
  import { kip } from "../store.svelte";
  import type { AvailabilityWindow, Booking, Listing } from "../types";
  import CoverPhoto from "./cover-photo.svelte";
  import Button from "./ui/button.svelte";
  import Chip from "./ui/chip.svelte";
  import Row from "./ui/row.svelte";

  let {
    listing,
    window,
    stay = null,
    thumbnail = true,
  }: {
    listing: Listing;
    window: AvailabilityWindow;
    // Passing this is what makes a taken row worth showing: it's the route to who
    // is there, and having it at all is the permission to know.
    stay?: Booking | null;
    // Off under a room's own heading, where the place's cover would pass for the
    // room's.
    thumbnail?: boolean;
  } = $props();

  let busy = $state(false);
  let note = $state<string | null>(null);

  const myBooking = $derived(
    kip.trips.find(
      (booking) =>
        booking.windowId === window.id && booking.status !== "CANCELLED",
    ),
  );

  async function book(): Promise<void> {
    const place = listing;
    const slot = window;
    busy = true;
    note = null;
    try {
      const outcome = await kip.requestBooking(place, slot);
      // Friends' dates aren't live, so without this the row goes on offering a
      // slot that has just been taken.
      if (outcome === "unavailable") {
        note = "Just taken by someone else.";
        await kip.refreshWindows(place.id);
      } else if (outcome === "changed") {
        note = "These dates have changed — take another look.";
        await kip.refreshWindows(place.id);
      } else if (outcome === "confirmed") {
        await kip.refreshWindows(place.id);
      }
    } catch (error) {
      console.error(error);
      note = "Couldn't book — try again.";
    } finally {
      busy = false;
    }
  }

  // Holding the window, not merely having a booking on it: two friends can both
  // have REQUESTED one, and the loser must not see "Booked by you".
  const iHoldWindow = $derived(
    window.bookingId != null && window.bookingId === myBooking?.id,
  );
  const pendingRequest = $derived(myBooking?.status === "REQUESTED");
  const showInstant = $derived(window.autoAccept && window.status === "OPEN");
</script>

{#snippet summary()}
  <!-- Repeats down a list, but a date range with no picture reads as an
       abstraction. -->
  {#if thumbnail}
    <CoverPhoto photo={listing.photos[0]} class="h-10 w-10 shrink-0" />
  {/if}
  <div class="min-w-0 flex-1">
    <span class="block text-[0.9375rem] font-semibold">
      {formatDateRange(window.start, window.end)}
    </span>
    <span class="block text-sm text-muted">
      {nights(window.start, window.end)}
      nights{window.details ? ` · ${window.details}` : ""}
    </span>
  </div>
{/snippet}

{#snippet taken()}
  {@render summary()}
  <Chip tone="booked">Booked</Chip>
{/snippet}

{#if myBooking && (iHoldWindow || pendingRequest)}
  <!-- Booked-by-you or pending: the row is a link to my booking page. -->
  {@const mine = myBooking}
  <Row onclick={() => kip.navigate({ kind: "booking", id: mine.id })}>
    {@render summary()}
    {#if iHoldWindow}
      <Chip tone="confirmed">Booked by you</Chip>
    {:else}
      <Chip tone="pending">Pending</Chip>
    {/if}
    <LuChevronRight class="shrink-0 text-faint" />
  </Row>
{:else if window.status === "BOOKED"}
  <!-- Unattributed either way: the chip says a slot is taken, and who by is a
       deliberate second step through the stay. The non-interactive branch is a
       fallback — today's caller filters out any taken slot it can't hand a
       stay. -->
  {#if stay}
    {@const held = stay}
    <Row
      onclick={() => kip.navigate({ kind: "booking", id: held.id })}
      class="opacity-60"
    >
      {@render taken()}
      <LuChevronRight class="shrink-0 text-faint" />
    </Row>
  {:else}
    <div class="flex min-h-14 items-center gap-3 px-4 py-3 opacity-60">
      {@render taken()}
    </div>
  {/if}
{:else}
  <!-- Open and bookable: the one inline action. -->
  <div class="flex flex-col gap-1 px-4 py-3">
    <div class="flex items-center gap-3">
      {@render summary()}
      {#if showInstant}
        <Chip tone="instant">
          {#snippet icon()}
            <LuZap width="12" height="12" />
          {/snippet}
          Instant
        </Chip>
      {/if}
      <Button onclick={book} disabled={busy}>
        {window.autoAccept ? "Book" : "Request"}
      </Button>
    </div>
    {#if note}
      <p class="text-sm text-accent-ink">{note}</p>
    {/if}
  </div>
{/if}
