<script lang="ts">
  import { formatDateRange, isExpired, todayIso } from "../format";
  import { findOverlap, offerLabel, roomOf } from "../rooms";
  import { kip } from "../store.svelte";
  import type { AvailabilityWindow, Listing } from "../types";
  import { DATE_FIELD } from "./add-dates-sheet.svelte";
  import BookingRow from "./booking-row.svelte";
  import CoverPhoto from "./cover-photo.svelte";
  import { dialog, reportFailure, runAction } from "./dialog.svelte";
  import Offer from "./offer.svelte";
  import { clashNote, hasRooms } from "./rooms";
  import ShareLink from "./share-link.svelte";
  import Button from "./ui/button.svelte";
  import FieldNote from "./ui/field-note.svelte";
  import Group from "./ui/group.svelte";
  import Sheet from "./ui/sheet.svelte";
  import Switch from "./ui/switch.svelte";

  // The host's sheet for one set of dates: who asked, the dates and notes while
  // they can still change, instant booking, its link, and removing it. Key it
  // on the slot, so its fields start from the slot it is showing.
  let {
    listing,
    window,
    existing,
    onclose,
  }: {
    listing: Listing;
    window: AvailabilityWindow;
    existing: readonly AvailabilityWindow[];
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let start = $state(window.start);
  // svelte-ignore state_referenced_locally
  let end = $state(window.end);
  // svelte-ignore state_referenced_locally
  let details = $state(window.details);

  const booked = $derived(window.status === "BOOKED");
  // Reviving these would be a new set of dates wearing an old slot's history —
  // its share link, and whatever was asked of it — so they can only be cleared.
  const expired = $derived(isExpired(window.end));
  // Listed in the sheet AND consulted by Save: a pending ask can never be
  // confirmed onto different nights, so moving the dates cancels it.
  const pending = $derived(
    kip.incomingBookings
      .filter(
        (booking) =>
          booking.windowId === window.id && booking.status === "REQUESTED",
      )
      // Oldest first: these are queueing for one slot, and who asked first is
      // the only ordering the host has any reason to read.
      .sort((left, right) => left.createdAt - right.createdAt),
  );
  // By id, not by "the first live booking on this slot". A slot that lost a race
  // keeps the losers' asks alongside the winner, so a `find` on status-not-
  // cancelled returned whichever the array happened to hold first — naming a
  // pending asker as the person staying, and offering their booking as the stay
  // to cancel. The slot itself names its holder; nothing else has to be guessed.
  const guestBooking = $derived(
    window.bookingId
      ? kip.incomingBookings.find((booking) => booking.id === window.bookingId)
      : undefined,
  );

  const dirty = $derived(
    start !== window.start || end !== window.end || details !== window.details,
  );
  const clash = $derived(
    start && end && end > start
      ? findOverlap(existing, { start, end, roomId: window.roomId }, window.id)
      : null,
  );
  const room = $derived(roomOf(listing, window.roomId));
  const gone = $derived(Boolean(end) && isExpired(end));
  const valid = $derived(
    Boolean(start && end && end > start) && !clash && !gone,
  );

  const datesMoved = $derived(start !== window.start || end !== window.end);

  async function save(): Promise<void> {
    if (!valid) return;
    const listingId = listing.id;
    const windowId = window.id;
    const fields = { start, end, details: details.trim() };
    if (datesMoved && pending.length > 0) {
      const ok = await dialog.confirm({
        title:
          pending.length === 1
            ? "Cancel the pending request?"
            : `Cancel ${pending.length} pending requests?`,
        body: "They asked for the dates as they are now, so moving them cancels what they asked for. They'll be told, and can ask again.",
        confirmLabel: "Move dates",
        cancelLabel: "Keep dates",
        tone: "danger",
      });
      if (!ok) return;
    }
    try {
      await kip.updateWindow(listingId, windowId, fields);
      onclose();
    } catch (error) {
      reportFailure(error, "Couldn't save those dates. Please try again.");
    }
  }

  function cancelBody(): string {
    if (expired) {
      return "They've already passed, so this only clears them off your calendar — a stay that already happened isn't affected.";
    } else if (booked) {
      return "The guest's booking will be cancelled and they'll be notified.";
    } else {
      return "This removes these open dates.";
    }
  }

  async function cancelSlot(): Promise<void> {
    const listingId = listing.id;
    const windowId = window.id;
    const ok = await dialog.confirm({
      title: expired ? "Remove these dates?" : "Cancel this slot?",
      body: cancelBody(),
      confirmLabel: expired ? "Remove" : "Cancel slot",
      cancelLabel: "Keep",
      tone: "danger",
    });
    if (!ok) return;
    runAction(() => kip.cancelWindow(listingId, windowId));
    onclose();
  }
</script>

<!-- Who has asked for these nights, which is the thing that decides what to do
     with them: moving the dates cancels every one of these, and the confirm
     that says so should not be the first the host hears of it.

     Placed per branch rather than above all three, because the right position
     differs. On an OPEN slot it belongs over the date fields, for the reason
     just given. On a BOOKED one the stay that actually holds the nights
     outranks the asks that missed them. It appears in both, and in expired,
     deliberately: confirming does not cancel the losers and nothing ages an ask
     out, so those are still sitting in someone's list waiting for an answer,
     and this is the only surface that reaches them from the dates they are
     about. -->
{#snippet asks()}
  {#if pending.length > 0}
    <div class="flex flex-col gap-2">
      <span class="text-sm font-semibold text-muted">
        {pending.length === 1
          ? "1 person asked"
          : `${pending.length} people asked`}
      </span>
      <Group>
        {#each pending as booking (booking.id)}
          <BookingRow {booking} lead="person" showDates={false} />
        {/each}
      </Group>
      <!-- Only where it is a dead end. On an open slot the rows lead to a page
           that can answer them, which needs no caption. -->
      {#if booked || expired}
        <!-- Expired wins: a slot that is both has a stay that already happened,
             and "went to someone else" is present-tense race language for a
             race that finished long ago. -->
        <p class="px-1 text-sm text-muted">
          {expired
            ? "These dates have passed, so these can only be declined."
            : "These dates went to someone else, so these can only be declined."}
        </p>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet link()}
  <ShareLink
    portalId={window.publicPortalId}
    createLabel="Create link for these dates"
    oncreate={async () => {
      await kip.publishSlotPortal(listing.id, window);
    }}
    onrevoke={() => kip.revokeSlotPortal(listing.id, window)}
  />
{/snippet}

<Sheet open {onclose} title={formatDateRange(window.start, window.end)}>
  <div class="flex flex-col gap-5">
    <!-- The place these dates belong to, so a slot opened from a link or a
         deep URL isn't just a pair of dates with no context. A room's dates
         show the room or nothing: the house's picture over them would pass for
         the room. -->
    <CoverPhoto
      photo={room ? room.photos[0] : listing.photos[0]}
      class="aspect-[16/9] max-h-44 w-full"
    />
    <!-- Plain text, not a control: which room a set of dates offers is fixed
         once it exists, since every ask on it is an ask for that room. -->
    {#if hasRooms(listing)}
      <div class="flex flex-col gap-1.5">
        <span class="text-sm text-muted">What's free</span>
        <Offer
          type={listing.type}
          room={room !== null}
          label={offerLabel(listing, window.roomId)}
        />
      </div>
    {/if}

    {#if expired}
      <p class="text-[0.9375rem] text-muted">
        These dates have passed —
        {booked ? "someone stayed" : "nobody booked them"}. There's nothing left
        to change about the dates; new availability means new dates. You can
        still clear these off your calendar.
      </p>
      {#if window.details}
        <p class="text-sm text-muted">{window.details}</p>
      {/if}
      {@render asks()}
      <!-- A link minted while these dates were live is still live. Removing
           the slot deletes it, but turning it off must not require that. -->
      {#if window.publicPortalId}
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold text-muted">
            Link to these dates
          </span>
          {@render link()}
        </div>
      {/if}
    {:else if booked}
      <!-- A sentence naming the guest led nowhere: owner-cancel and everything
           else about the stay live on its own page, reachable from here only
           by closing the sheet and finding the Guests list. The row names them
           now, so the sentence keeps only what the row cannot say. -->
      {#if guestBooking}
        <Group>
          <BookingRow booking={guestBooking} lead="person" showDates={false} />
        </Group>
      {/if}
      <!-- Nameless on purpose in the second case: a slot reads BOOKED for a
           beat before the booking holding it reaches this client, and there is
           nobody to name until it does. -->
      <p class="text-[0.9375rem] text-muted">
        {guestBooking
          ? "Cancelling frees these dates and notifies your guest."
          : "Cancelling frees these dates and notifies whoever booked them."}
      </p>
      {@render asks()}
    {:else}
      {@render asks()}
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1.5 text-sm text-muted">
          From
          <input
            type="date"
            class={DATE_FIELD}
            min={todayIso()}
            bind:value={start}
          >
        </label>
        <label class="flex flex-col gap-1.5 text-sm text-muted">
          To
          <input
            type="date"
            class={DATE_FIELD}
            min={start || todayIso()}
            bind:value={end}
          >
        </label>
      </div>
      <label class="flex flex-col gap-1.5 text-sm text-muted">
        Notes for these dates
        <input
          class={DATE_FIELD}
          placeholder="e.g. flexible check-in, I'll be away"
          bind:value={details}
        >
      </label>
      {#if clash}
        <FieldNote tone="danger">
          {clashNote(listing, window.roomId, clash)}
        </FieldNote>
      {:else if gone}
        <FieldNote tone="danger">Those dates have already passed.</FieldNote>
      {/if}
      <Button onclick={save} disabled={!valid || !dirty}>Save changes</Button>

      <div class="rounded-2xl bg-surface-muted">
        <Switch
          checked={window.autoAccept}
          onchange={(next) =>
            runAction(() =>
              kip.setWindowAutoAccept(listing.id, window.id, next),
            )}
          label="Instant book"
          description="Friends book these dates instantly (first come, first served)."
        />
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-muted">Share these dates</span>
        {@render link()}
      </div>
    {/if}

    <Button variant="danger" onclick={cancelSlot}>
      {expired ? "Remove dates" : "Cancel slot"}
    </Button>
  </div>
</Sheet>
