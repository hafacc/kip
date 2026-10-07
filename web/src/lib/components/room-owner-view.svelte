<script lang="ts">
  import LuPlus from "~icons/lucide/plus";
  import { PLACE_KEY } from "../checkout";
  import { isExpired } from "../format";
  import { canHaveRooms, roomList, wholePlaceLabel } from "../rooms";
  import { kip } from "../store.svelte";
  import type { Listing } from "../types";
  import AddDatesSheet from "./add-dates-sheet.svelte";
  import BookingRow from "./booking-row.svelte";
  import { dialog, runAction } from "./dialog.svelte";
  import PastSlotRow from "./past-slot-row.svelte";
  import PhotoStrip from "./photo-strip.svelte";
  import RoomDetail from "./room-detail.svelte";
  import RoomRow from "./room-row.svelte";
  import RoomSheet from "./room-sheet.svelte";
  import { sortForHost } from "./rooms";
  import ShareLink from "./share-link.svelte";
  import SlotSheet from "./slot-sheet.svelte";
  import SlotSummaryRow from "./slot-summary-row.svelte";
  import Button from "./ui/button.svelte";
  import Group from "./ui/group.svelte";
  import Section from "./ui/section.svelte";

  // The host's console for one of their own places.
  let { listing }: { listing: Listing } = $props();

  const placeCheckout = $derived(kip.myCheckout[listing.id]?.[PLACE_KEY]);
  // Owner-only, which is why the friend view can ignore it entirely.
  const focusedWindowId = $derived(
    kip.screen.kind === "room" && kip.screen.id === listing.id
      ? (kip.screen.windowId ?? null)
      : null,
  );
  // svelte-ignore state_referenced_locally
  let editingWindowId = $state<string | null>(focusedWindowId);
  let addingSlot = $state(false);
  // `roomId` null is the sheet that adds one.
  let openRoom = $state.raw<{ roomId: string | null } | null>(null);
  const rooms = $derived(roomList(listing));

  // Only ever OPENS — closing clears the argument, so the two never fight over
  // a sheet the user just dismissed.
  $effect(() => {
    if (focusedWindowId) editingWindowId = focusedWindowId;
  });

  // In place, not pushed: a pushed entry would make browser-back reopen the
  // sheet just closed.
  function closeSlotSheet(): void {
    editingWindowId = null;
    if (focusedWindowId) kip.replace({ kind: "room", id: listing.id });
  }

  // Opening it names it in the URL — in place, so it adds no entry to go back
  // through. Without this, tapping a request inside the sheet pushed the
  // booking on top of a room that had forgotten which slot was open, and back
  // returned to a bare room page. The deep-link variant already existed; this
  // just makes an ordinary tap arrive at the same address.
  function openSlotSheet(windowId: string): void {
    editingWindowId = windowId;
    kip.replace({ kind: "room", id: listing.id, windowId });
  }

  // Two rooms offering the same nights sit together, in the Rooms list's order.
  const allWindows = $derived(
    sortForHost(listing, kip.myWindows[listing.id] ?? []),
  );
  // The same boundary Trips uses, so a slot and a stay stop being current on the
  // same day.
  const windows = $derived(
    allWindows.filter((window) => !isExpired(window.end)),
  );
  // Newest first, so recent dates aren't buried under last year's.
  const expired = $derived(
    sortForHost(
      listing,
      allWindows.filter((window) => isExpired(window.end)),
      "latest",
    ),
  );
  const bookings = $derived(
    kip.incomingBookings
      .filter((booking) => booking.listingId === listing.id)
      .sort((left, right) => {
        if (left.status === right.status) {
          return left.start.localeCompare(right.start);
        } else {
          return left.status === "REQUESTED" ? -1 : 1;
        }
      }),
  );
  const activeBookings = $derived(
    bookings.filter((booking) => booking.status !== "CANCELLED"),
  );
  // How many are still waiting on an answer for one slot. The sheet filters
  // `incomingBookings` again for itself rather than being handed this — both
  // read the one subscription and both take `REQUESTED`, which is what keeps the
  // count and the rows behind it in step.
  function askedOn(windowId: string): number {
    return bookings.filter(
      (booking) =>
        booking.windowId === windowId && booking.status === "REQUESTED",
    ).length;
  }
  // Not a guest any more, but this is the only way in to it.
  const cancelledBookings = $derived(
    bookings
      .filter((booking) => booking.status === "CANCELLED")
      .sort((left, right) => right.start.localeCompare(left.start)),
  );

  async function remove(): Promise<void> {
    const place = listing;
    const ok = await dialog.confirm({
      title: `Delete "${place.title}"?`,
      body: "This removes the listing and all its availability. Cancel any booked slots first so guests are notified.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) runAction(() => kip.deleteListing(place));
  }

  // Per-party: the guest's own record of the cancellation is untouched.
  async function clearCancelled(): Promise<void> {
    const agreed = await dialog.confirm({
      title: "Clear cancelled bookings?",
      body: "They disappear from this place's list. Each guest still has their copy — nothing is deleted.",
      confirmLabel: "Clear all",
    });
    if (!agreed) return;
    await kip.hideBookingsById(cancelledBookings.map((booking) => booking.id));
  }

  // The id survives, so a sheet named before the listener catches up opens when
  // it does, and one naming a removed slot just leaves you on the room.
  const editingWindow = $derived(
    editingWindowId
      ? allWindows.find((window) => window.id === editingWindowId)
      : undefined,
  );
</script>

<div class="flex flex-col gap-6">
  <div>
    <p
      class="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-accent-ink"
    >
      Manage place
    </p>
    <RoomDetail {listing} thumbnails={false} />
    {#if placeCheckout}
      <div class="mt-4 flex flex-col gap-1">
        <h3 class="text-sm font-semibold text-muted">Check-out instructions</h3>
        <p
          class="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-text/90"
        >
          {placeCheckout}
        </p>
      </div>
    {/if}
  </div>

  <div
    class="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-8"
  >
    <aside
      class="flex flex-col gap-6 md:col-start-2 md:row-start-1 md:sticky md:top-24"
    >
      {#if canHaveRooms(listing.type)}
        <Section title="Rooms">
          {#snippet action()}
            <button
              type="button"
              onclick={() => {
                openRoom = { roomId: null };
              }}
              class="text-sm font-semibold text-accent-ink hover:opacity-80"
            >
              Add a room
            </button>
          {/snippet}
          {#if rooms.length === 0}
            <p class="px-1 text-sm text-muted">
              Rooms are optional. Add them if friends can stay in one without
              taking the {wholePlaceLabel(listing.type).toLowerCase()}.
            </p>
          {:else}
            <Group>
              {#each rooms as room (room.id)}
                <RoomRow
                  name={room.name}
                  note={room.note}
                  photos={room.photos}
                  onopen={() => {
                    openRoom = { roomId: room.id };
                  }}
                />
              {/each}
            </Group>
          {/if}
        </Section>
      {/if}

      <Section title="Availability">
        {#if windows.length === 0}
          <p class="px-1 text-sm text-muted">
            No open dates yet. Add some so friends can ask to stay.
          </p>
        {:else}
          <Group>
            {#each windows as window (window.id)}
              <SlotSummaryRow
                {listing}
                {window}
                asked={askedOn(window.id)}
                onopen={() => openSlotSheet(window.id)}
              />
            {/each}
          </Group>
        {/if}
        <div>
          <Button
            variant="secondary"
            onclick={() => {
              addingSlot = true;
            }}
          >
            <LuPlus />
            Add dates
          </Button>
        </div>
      </Section>

      {#if expired.length > 0}
        <Section title="Past dates">
          <Group class="opacity-70">
            {#each expired as window (window.id)}
              <PastSlotRow
                {listing}
                {window}
                asked={askedOn(window.id)}
                onopen={() => openSlotSheet(window.id)}
              />
            {/each}
          </Group>
        </Section>
      {/if}

      {#if cancelledBookings.length > 0}
        <Section title="Cancelled">
          {#snippet action()}
            <button
              type="button"
              onclick={() => runAction(clearCancelled)}
              class="text-sm font-semibold text-accent-ink hover:opacity-80"
            >
              Clear all
            </button>
          {/snippet}
          <Group class="opacity-70">
            {#each cancelledBookings as booking (booking.id)}
              <BookingRow {booking} lead="person" />
            {/each}
          </Group>
        </Section>
      {/if}
    </aside>

    <div class="flex min-w-0 flex-col gap-6 md:col-start-1 md:row-start-1">
      <Section title="Photos">
        <p class="px-1 text-sm text-muted">
          The first one leads the page — put another first to change that.
        </p>
        <PhotoStrip
          ownerId={listing.ownerId}
          listingId={listing.id}
          photos={listing.photos}
          editable
          onchange={(photos) => kip.setListingPhotos(listing.id, photos)}
        />
      </Section>

      <Section title="Sharing">
        <ShareLink
          portalId={listing.publicPortalId}
          createLabel="Create public link"
          oncreate={async () => {
            await kip.publishListingPortal(listing);
          }}
          onrevoke={() => kip.revokeListingPortal(listing)}
        />
      </Section>

      {#if activeBookings.length > 0}
        <Section title="Guests">
          <Group>
            {#each activeBookings as booking (booking.id)}
              <BookingRow {booking} lead="person" />
            {/each}
          </Group>
        </Section>
      {/if}

      <div class="flex flex-wrap items-center gap-2 pt-2">
        <Button
          variant="secondary"
          onclick={() => kip.navigate({ kind: "listing-form", id: listing.id })}
        >
          Edit details
        </Button>
        <Button variant="danger" onclick={remove}>Delete place</Button>
      </div>
    </div>
  </div>

  {#if editingWindow}
    {#key editingWindow.id}
      <SlotSheet
        {listing}
        window={editingWindow}
        existing={allWindows}
        onclose={closeSlotSheet}
      />
    {/key}
  {/if}
  {#if addingSlot}
    <AddDatesSheet
      {listing}
      existing={allWindows}
      onclose={() => {
        addingSlot = false;
      }}
    />
  {/if}
  {#if openRoom}
    <!-- Keyed so moving from one room to another starts its fields afresh. -->
    {#key openRoom.roomId ?? "new"}
      <RoomSheet
        {listing}
        roomId={openRoom.roomId}
        onclose={() => {
          openRoom = null;
        }}
      />
    {/key}
  {/if}
</div>
