"use client";

import { useEffect, useState } from "react";
import { fetchWindow } from "../utils/listings";
import { roomOf } from "../utils/rooms";
import { useKip } from "../utils/store";
import type { Booking, Listing, Room } from "../utils/types";

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
 */
export function useStayPlace(booking: Booking | undefined): {
  listing: Listing | undefined;
  room: Room | null;
} {
  const { friendListings, myListings, tripListings, myWindows, friendWindows } =
    useKip();
  const listing = booking
    ? [...friendListings, ...myListings, ...tripListings].find(
        (candidate) => candidate.id === booking.listingId,
      )
    : undefined;
  const listingId = booking?.listingId ?? "";
  const windowId = booking?.windowId ?? "";
  const key = `${listingId}/${windowId}`;
  const loaded = [
    ...(myWindows[listingId] ?? []),
    ...(friendWindows[listingId] ?? []),
  ].find((window) => window.id === windowId);
  const [fetched, setFetched] = useState<{
    key: string;
    roomId: string | null;
  } | null>(null);
  const known = loaded
    ? loaded.roomId
    : roomIds.has(key)
      ? roomIds.get(key)
      : fetched?.key === key
        ? fetched.roomId
        : undefined;
  const wanted =
    known === undefined &&
    listing !== undefined &&
    Object.keys(listing.rooms).length > 0;

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    fetchWindow(listingId, windowId)
      .then((window) => {
        if (!window) return;
        roomIds.set(key, window.roomId);
        if (live) setFetched({ key, roomId: window.roomId });
      })
      .catch((error) => console.error("stayPlace", error));
    return () => {
      live = false;
    };
  }, [wanted, listingId, windowId, key]);

  return {
    listing,
    room: listing ? roomOf(listing, known ?? null) : null,
  };
}
