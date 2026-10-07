<script lang="ts" module>
  import { isExpired } from "../format";
  import type { AvailabilityWindow, Booking } from "../types";

  function count(amount: number, one: string, many: string): string {
    return `${amount} ${amount === 1 ? one : many}`;
  }

  /**
   * What removing a room costs, for the confirm that guards it.
   *
   * Counts the upcoming stays and asks on the room's own dates — the same set
   * `removeRoom` cancels.
   */
  export function removalNote(
    roomId: string,
    windows: readonly AvailabilityWindow[],
    bookings: readonly Booking[],
  ): string {
    const windowIds = new Set(
      windows
        .filter((window) => window.roomId === roomId)
        .map((window) => window.id),
    );
    const live = bookings.filter(
      (booking) =>
        windowIds.has(booking.windowId) &&
        booking.status !== "CANCELLED" &&
        !isExpired(booking.end),
    );
    const stays = live.filter(
      (booking) => booking.status === "CONFIRMED",
    ).length;
    const asks = live.length - stays;
    const base = "This removes the room with its photos, dates and link.";
    if (stays === 0 && asks === 0) {
      return `${base} Nobody has booked or asked for its dates.`;
    } else {
      const parts = [
        stays > 0 ? count(stays, "upcoming stay", "upcoming stays") : null,
        asks > 0 ? count(asks, "ask", "asks") : null,
      ].filter((part): part is string => part !== null);
      const told =
        live.length === 1 ? "that guest is told" : "those guests are told";
      return `${base} It cancels ${parts.join(" and ")}, and ${told}.`;
    }
  }
</script>

<script lang="ts">
  import LuPlus from "~icons/lucide/plus";
  import { newRoomId } from "../listings";
  import { kip } from "../store.svelte";
  import type { Listing, ListingPhoto } from "../types";
  import { abandonedPhotos } from "./abandoned-photos.svelte";
  import AddDatesSheet from "./add-dates-sheet.svelte";
  import { dialog, runAction } from "./dialog.svelte";
  import RoomFields from "./room-fields.svelte";
  import ShareLink from "./share-link.svelte";
  import Button from "./ui/button.svelte";
  import Sheet from "./ui/sheet.svelte";

  // A room of a place that exists: its name, note, photos, check-out
  // instructions, link and dates.
  //
  // With `roomId` null it adds a room instead, and shows only what a room needs
  // to exist. Edits to an existing room's photos land at once; its name, note
  // and instructions wait for Save. Key it on the room, so moving from one to
  // another starts its fields afresh.
  let {
    listing,
    roomId,
    onclose,
  }: {
    listing: Listing;
    roomId: string | null;
    onclose: () => void;
  } = $props();

  const room = $derived(roomId ? listing.rooms[roomId] : undefined);
  const draftId = newRoomId();
  // svelte-ignore state_referenced_locally
  let name = $state(room?.name ?? "");
  // svelte-ignore state_referenced_locally
  let note = $state(room?.note ?? "");
  let draftPhotos = $state.raw<readonly ListingPhoto[]>([]);
  let addingDates = $state(false);
  // Null until typed in, so instructions that load after the sheet opens still
  // show rather than being overwritten by an empty field.
  let checkoutDraft = $state<string | null>(null);
  // svelte-ignore state_referenced_locally
  const keep = abandonedPhotos(listing.ownerId, listing.id, () => draftPhotos);
  const windows = $derived(kip.myWindows[listing.id] ?? []);
  const placeCheckout = $derived(kip.myCheckout[listing.id]);
  const storedCheckout = $derived(room ? (placeCheckout?.[room.id] ?? "") : "");
  const checkout = $derived(checkoutDraft ?? storedCheckout);
  const detailsChanged = $derived(
    !room || name.trim() !== room.name || note.trim() !== room.note,
  );
  const checkoutChanged = $derived(checkout.trim() !== storedCheckout);

  // Removed from under the sheet, here or in another tab.
  const gone = $derived(roomId !== null && !room);
  $effect(() => {
    if (gone) onclose();
  });

  async function save(): Promise<void> {
    const place = listing;
    const saved = room;
    const text = checkout;
    const input = { name: name.trim(), note: note.trim() };
    if (saved) {
      const instructions = checkoutChanged;
      if (detailsChanged) await kip.updateRoom(place.id, saved.id, input);
      if (instructions) await kip.setCheckout(place.id, saved.id, text);
      checkoutDraft = null;
    } else {
      await kip.addRoom(place, input, draftId, draftPhotos, text);
      keep();
      onclose();
    }
  }

  async function remove(): Promise<void> {
    const place = listing;
    const leaving = room;
    if (!leaving) return;
    const ok = await dialog.confirm({
      title: `Remove ${leaving.name}?`,
      body: removalNote(leaving.id, windows, kip.incomingBookings),
      confirmLabel: "Remove room",
      cancelLabel: "Keep",
      tone: "danger",
    });
    if (!ok) return;
    runAction(() => kip.removeRoom(place, leaving.id));
    onclose();
  }
</script>

{#if gone}
  <!-- Nothing to draw: the effect above is closing the sheet. -->
{:else if room && addingDates}
  <AddDatesSheet
    {listing}
    existing={windows}
    roomId={room.id}
    onclose={() => {
      addingDates = false;
    }}
  />
{:else}
  <Sheet open {onclose} title={room ? room.name : "Add a room"}>
    <RoomFields
      ownerId={listing.ownerId}
      listingId={listing.id}
      bind:name
      bind:note
      {checkout}
      checkoutKnown={!room || placeCheckout !== undefined}
      oncheckout={(next) => {
        checkoutDraft = next;
      }}
      photos={room ? room.photos : draftPhotos}
      onphotos={async (photos) => {
        if (roomId) {
          await kip.setRoomPhotos(listing.id, roomId, photos);
        } else {
          draftPhotos = photos;
        }
      }}
      saveLabel={room ? "Save changes" : "Add room"}
      dirty={detailsChanged || checkoutChanged}
      onsave={save}
    >
      {#if room}
        {@const shared = room}
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold text-muted">Share this room</span>
          <!-- Wrapped so the create button keeps its own width. -->
          <div>
            <ShareLink
              portalId={shared.publicPortalId}
              createLabel="Create link for this room"
              oncreate={async () => {
                await kip.publishRoomPortal(listing, shared.id);
              }}
              onrevoke={() => kip.revokeRoomPortal(listing, shared.id)}
            />
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onclick={() => {
              addingDates = true;
            }}
          >
            <LuPlus />
            Add dates
          </Button>
          <Button variant="danger" onclick={remove}>Remove room</Button>
        </div>
      {/if}
    </RoomFields>
  </Sheet>
{/if}
