import { fetchWindow } from "../listings";
import { roomOf } from "../rooms";
import { kip } from "../store.svelte";
import type { Booking, Listing, Room } from "../types";

// Which room a set of dates offers never changes, so a found answer holds for
// the session. A miss is not kept: the read may be allowed a moment later.
const roomIds = new Map<string, string | null>();

/**
 * Where a stay is: the place when it can be read, and the room when the dates
 * are a room's.
 *
 * A booking names its dates, not its room, so the room comes off the slot —
 * from the store when it is already loaded, otherwise with one read, and only
 * for a place that has rooms. `room` stays null when the slot is gone or can't
 * be read, which callers render as the place alone.
 *
 * Call while a component initializes, passing the booking as a function so a
 * change is followed; read `listing` and `room` off the result where they are
 * used.
 */
export function useStayPlace(booking: () => Booking | undefined): {
  readonly listing: Listing | undefined;
  readonly room: Room | null;
} {
  const listingId = $derived(booking()?.listingId ?? "");
  const windowId = $derived(booking()?.windowId ?? "");
  const listing = $derived(
    listingId
      ? [...kip.friendListings, ...kip.myListings, ...kip.tripListings].find(
          (candidate) => candidate.id === listingId,
        )
      : undefined,
  );
  const key = $derived(`${listingId}/${windowId}`);
  const loaded = $derived(
    [
      ...(kip.myWindows[listingId] ?? []),
      ...(kip.friendWindows[listingId] ?? []),
    ].find((window) => window.id === windowId),
  );
  let fetched = $state.raw<{ key: string; roomId: string | null } | null>(null);
  const known = $derived.by(() => {
    if (loaded) {
      return loaded.roomId;
    } else if (roomIds.has(key)) {
      return roomIds.get(key);
    } else {
      return fetched?.key === key ? fetched.roomId : undefined;
    }
  });
  const wanted = $derived(
    known === undefined &&
      listing !== undefined &&
      Object.keys(listing.rooms).length > 0,
  );

  $effect(() => {
    if (!wanted) return;
    const asked = key;
    let live = true;
    fetchWindow(listingId, windowId)
      .then((window) => {
        if (!window) return;
        roomIds.set(asked, window.roomId);
        if (live) fetched = { key: asked, roomId: window.roomId };
      })
      .catch((error) => console.error("stayPlace", error));
    return () => {
      live = false;
    };
  });

  return {
    get listing() {
      return listing;
    },
    get room() {
      return listing ? roomOf(listing, known ?? null) : null;
    },
  };
}
