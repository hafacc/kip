import {
  addDoc,
  collection,
  type DocumentData,
  type DocumentReference,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  type QueryDocumentSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type WriteBatch,
  where,
  writeBatch,
} from "firebase/firestore";
import { geohashForLocation } from "geofire-common";
import { claimGuestAccess } from "./bookings";
import { type CheckoutMap, PLACE_KEY, type StayCheckout } from "./checkout";
import { db, onSnapshotError } from "./firebase";
import { isExpired } from "./format";
import { deleteListingPhoto } from "./photos";
import { canHaveRooms, nextRoomOrder, toRooms } from "./rooms";
import type {
  AvailabilityWindow,
  Booking,
  GeoLocation,
  Listing,
  ListingPhoto,
  ListingType,
} from "./types";

export { findOverlap, toRooms } from "./rooms";

export function listingTypeLabel(type: ListingType): string {
  switch (type) {
    case "ROOM":
      return "Room";
    case "FLAT":
      return "Flat";
    case "HOUSE":
      return "House";
  }
}

/** A place's type for a chip, with its room count when it has any: "House · 3 rooms". */
export function placeTypeLabel(type: ListingType, roomCount: number): string {
  const label = listingTypeLabel(type);
  if (roomCount === 0 || !canHaveRooms(type)) {
    return label;
  } else {
    return `${label} · ${roomCount} ${roomCount === 1 ? "room" : "rooms"}`;
  }
}

// "WHOLE_PLACE" is the legacy name for "HOUSE".
function normalizeType(raw: unknown): ListingType {
  if (raw === "WHOLE_PLACE" || raw === "HOUSE") return "HOUSE";
  else if (raw === "FLAT") return "FLAT";
  else return "ROOM";
}

function epoch(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function toListing(snap: QueryDocumentSnapshot<DocumentData>): Listing {
  const data = snap.data();
  return {
    id: snap.id,
    ownerId: data.ownerId,
    title: data.title ?? "",
    type: normalizeType(data.type),
    description: data.description ?? "",
    location: data.location as GeoLocation,
    photos: (data.photos as ListingPhoto[]) ?? [],
    rooms: toRooms(data.rooms),
    publicPortalId: data.publicPortalId ?? null,
    createdAt: epoch(data.createdAt),
  };
}

function toWindow(
  listingId: string,
  snap: QueryDocumentSnapshot<DocumentData>,
): AvailabilityWindow {
  const data = snap.data();
  return {
    id: snap.id,
    listingId,
    start: data.start,
    end: data.end,
    status: data.status ?? "OPEN",
    autoAccept: data.autoAccept ?? false,
    details: data.details ?? "",
    roomId: data.roomId ?? null,
    bookingId: data.bookingId ?? null,
    publicPortalId: data.publicPortalId ?? null,
    createdAt: epoch(data.createdAt),
  };
}

export type ListingInput = {
  readonly title: string;
  readonly type: ListingType;
  readonly description: string;
  readonly location: Omit<GeoLocation, "geohash">;
};

function withGeohash(location: Omit<GeoLocation, "geohash">): GeoLocation {
  return {
    ...location,
    geohash: geohashForLocation([location.lat, location.lng]),
  };
}

export function watchMyListings(
  uid: string,
  onChange: (listings: Listing[]) => void,
): () => void {
  const ref = query(collection(db(), "listings"), where("ownerId", "==", uid));
  return onSnapshot(
    ref,
    (snap) => onChange(snap.docs.map(toListing)),
    onSnapshotError("myListings"),
  );
}

// An id with no document, so the form can upload photos to
// `listings/{ownerId}/{id}/…` before the place exists: Storage checks only the
// owner in the path, and Firestore pins only `ownerId` on create.
export function newListingId(): string {
  return doc(collection(db(), "listings")).id;
}

/** A room drawn up before its place exists, with an id from {@link newRoomId}. */
export type NewRoom = {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly photos: readonly ListingPhoto[];
  // Check-out instructions, kept apart from the room itself.
  readonly checkout?: string;
};

/**
 * Create a place, with any rooms drawn up alongside it, in the order given.
 *
 * `checkout` is the place's check-out instructions; each room carries its own.
 * They are written in the same commit as the place.
 */
export async function createListing(
  ownerId: string,
  listingId: string,
  input: ListingInput,
  photos: readonly ListingPhoto[],
  rooms: readonly NewRoom[] = [],
  checkout = "",
): Promise<void> {
  if (rooms.length > 0 && !canHaveRooms(input.type)) {
    throw new RoomsNotAllowedError();
  }
  const batch = writeBatch(db());
  batch.set(doc(db(), "listings", listingId), {
    ownerId,
    title: input.title,
    type: input.type,
    description: input.description,
    location: withGeohash(input.location),
    photos: [...photos],
    ...(rooms.length > 0
      ? {
          rooms: Object.fromEntries(
            rooms.map((room, order) => [
              room.id,
              {
                name: room.name,
                note: room.note,
                photos: [...room.photos],
                publicPortalId: null,
                order,
              },
            ]),
          ),
        }
      : {}),
    createdAt: serverTimestamp(),
  });
  const instructions: [string, string][] = [
    [PLACE_KEY, checkout.trim()],
    ...rooms.map((room): [string, string] => [
      room.id,
      (room.checkout ?? "").trim(),
    ]),
  ];
  for (const [key, text] of instructions) {
    if (text) batch.set(checkoutRef(listingId, key), { text });
  }
  await batch.commit();
}

/** Thrown when a place that is itself a room would hold rooms. */
export class RoomsNotAllowedError extends Error {
  constructor() {
    super("a place of type ROOM cannot have rooms");
    this.name = "RoomsNotAllowedError";
  }
}

/**
 * Save a place's details.
 *
 * Throws {@link RoomsNotAllowedError} when the type would become ROOM while
 * the place still has rooms; remove them first with {@link removeRoom}.
 */
export async function updateListing(
  listingId: string,
  input: ListingInput,
): Promise<void> {
  const ref = doc(db(), "listings", listingId);
  const fields = {
    title: input.title,
    type: input.type,
    description: input.description,
    location: withGeohash(input.location),
  };
  if (canHaveRooms(input.type)) {
    await updateDoc(ref, fields);
  } else {
    // Read in the same commit, so a room added from another tab can't slip in.
    await runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      if (Object.keys(toRooms(snap.data()?.rooms)).length > 0) {
        throw new RoomsNotAllowedError();
      }
      tx.update(ref, fields);
    });
  }
}

// Its own write, not part of the details form: a strip edit has to land even if
// the form is never submitted.
export async function setListingPhotos(
  listingId: string,
  photos: readonly ListingPhoto[],
): Promise<void> {
  await updateDoc(doc(db(), "listings", listingId), {
    photos: [...photos],
  });
}

// Firestore refuses a batch past 500 writes.
const BATCH_LIMIT = 500;

// Takes the listing, its windows, their portals, its check-out instructions and
// its live bookings. A portal
// left behind would keep serving the place to anyone with the old link, with
// nothing left to revoke it by.
//
// One batch while it fits; past 500 writes it goes in order — stays, then
// slots and links, then the listing LAST, since the slot rules read the
// listing's owner and rules see committed state. A retry after a partial
// failure re-derives everything: cancelled stays are skipped and the windows
// are re-read.
export async function deleteListing(
  listing: Listing,
  bookings: readonly Booking[],
): Promise<void> {
  const [windows, checkout] = await Promise.all([
    getDocs(collection(db(), "listings", listing.id, "windows")),
    getDocs(collection(db(), "listings", listing.id, "checkout")),
  ]);
  const writes: ((batch: WriteBatch) => void)[] = [];
  // Future stays only. A stay that already happened is a record, not an
  // obligation — cancelling it would tell a guest their completed visit was
  // called off, and stamp the host as having done it.
  for (const booking of bookings) {
    if (
      booking.listingId === listing.id &&
      booking.status !== "CANCELLED" &&
      !isExpired(booking.end)
    ) {
      writes.push((batch) =>
        batch.update(doc(db(), "bookings", booking.id), {
          status: "CANCELLED",
          cancelledBy: booking.ownerId,
          cancelReason: "SLOT_CANCELLED",
        }),
      );
    }
  }
  for (const window of windows.docs) {
    const slotPortalId = window.data().publicPortalId as string | null;
    if (slotPortalId) {
      writes.push((batch) => batch.delete(doc(db(), "portals", slotPortalId)));
    }
    writes.push((batch) => batch.delete(window.ref));
  }
  const listingPortalId = listing.publicPortalId;
  if (listingPortalId) {
    writes.push((batch) => batch.delete(doc(db(), "portals", listingPortalId)));
  }
  for (const room of Object.values(listing.rooms)) {
    const roomPortalId = room.publicPortalId;
    if (roomPortalId) {
      writes.push((batch) => batch.delete(doc(db(), "portals", roomPortalId)));
    }
  }
  for (const entry of checkout.docs) {
    writes.push((batch) => batch.delete(entry.ref));
  }
  writes.push((batch) => batch.delete(doc(db(), "listings", listing.id)));
  await commitInOrder(writes);
}

async function commitInOrder(
  writes: readonly ((batch: WriteBatch) => void)[],
): Promise<void> {
  for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db());
    for (const write of writes.slice(start, start + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

export type RoomInput = {
  readonly name: string;
  readonly note: string;
};

/** Mint a room id with no round trip, so photos can upload before the room exists. */
export function newRoomId(): string {
  return doc(collection(db(), "listings")).id;
}

/**
 * Add a named room to a flat or house, last in order, and return its id.
 *
 * `checkout` is the room's check-out instructions, written in the same commit.
 * Throws {@link RoomsNotAllowedError} for a place of type ROOM.
 */
export async function addRoom(
  listing: Listing,
  input: RoomInput,
  roomId: string = newRoomId(),
  photos: readonly ListingPhoto[] = [],
  checkout = "",
): Promise<string> {
  if (!canHaveRooms(listing.type)) throw new RoomsNotAllowedError();
  const batch = writeBatch(db());
  batch.update(doc(db(), "listings", listing.id), {
    [`rooms.${roomId}`]: {
      name: input.name,
      note: input.note,
      photos: [...photos],
      publicPortalId: null,
      order: nextRoomOrder(listing.rooms),
    },
  });
  const text = checkout.trim();
  if (text) batch.set(checkoutRef(listing.id, roomId), { text });
  await batch.commit();
  return roomId;
}

/** Rename a room or change its note. */
export async function updateRoom(
  listingId: string,
  roomId: string,
  input: RoomInput,
): Promise<void> {
  await updateDoc(doc(db(), "listings", listingId), {
    [`rooms.${roomId}.name`]: input.name,
    [`rooms.${roomId}.note`]: input.note,
  });
}

/** Set a room's photos; the first is its cover. */
export async function setRoomPhotos(
  listingId: string,
  roomId: string,
  photos: readonly ListingPhoto[],
): Promise<void> {
  await updateDoc(doc(db(), "listings", listingId), {
    [`rooms.${roomId}.photos`]: [...photos],
  });
}

/** Put a place's rooms in the given order; ids left out keep their place after them. */
export async function reorderRooms(
  listingId: string,
  orderedRoomIds: readonly string[],
): Promise<void> {
  if (orderedRoomIds.length === 0) return;
  await updateDoc(
    doc(db(), "listings", listingId),
    Object.fromEntries(
      orderedRoomIds.map((roomId, index) => [`rooms.${roomId}.order`, index]),
    ),
  );
}

/**
 * Remove a room and everything that hangs off it.
 *
 * Cancels every future live booking on the room's dates (stamped as the owner
 * calling the dates off), deletes those dates and their links, the room's own
 * link, check-out instructions and photos, then the room. One batch while it fits; past 500 writes
 * it goes in that order, the room last, and a retry re-derives everything.
 * `bookings` is the owner's incoming bookings.
 */
export async function removeRoom(
  listing: Listing,
  roomId: string,
  bookings: readonly Booking[],
): Promise<void> {
  const windows = await getDocs(
    query(
      collection(db(), "listings", listing.id, "windows"),
      where("roomId", "==", roomId),
    ),
  );
  const windowIds = new Set(windows.docs.map((window) => window.id));
  const writes: ((batch: WriteBatch) => void)[] = [];
  for (const booking of bookings) {
    if (
      booking.listingId === listing.id &&
      windowIds.has(booking.windowId) &&
      booking.status !== "CANCELLED" &&
      !isExpired(booking.end)
    ) {
      writes.push((batch) =>
        batch.update(doc(db(), "bookings", booking.id), {
          status: "CANCELLED",
          cancelledBy: booking.ownerId,
          cancelReason: "SLOT_CANCELLED",
        }),
      );
    }
  }
  for (const window of windows.docs) {
    const slotPortalId = window.data().publicPortalId as string | null;
    if (slotPortalId) {
      writes.push((batch) => batch.delete(doc(db(), "portals", slotPortalId)));
    }
    writes.push((batch) => batch.delete(window.ref));
  }
  const room = listing.rooms[roomId];
  const roomPortalId = room?.publicPortalId ?? null;
  if (roomPortalId) {
    writes.push((batch) => batch.delete(doc(db(), "portals", roomPortalId)));
  }
  writes.push((batch) => batch.delete(checkoutRef(listing.id, roomId)));
  writes.push((batch) =>
    batch.update(doc(db(), "listings", listing.id), {
      [`rooms.${roomId}`]: deleteField(),
    }),
  );
  await commitInOrder(writes);

  // After the commit: an object nothing names any more is the harmless leftover.
  await Promise.all(
    (room?.photos ?? []).map((photo) =>
      deleteListingPhoto(listing.ownerId, listing.id, photo.id),
    ),
  );
}

export function watchWindows(
  listingId: string,
  onChange: (windows: AvailabilityWindow[]) => void,
): () => void {
  return onSnapshot(
    collection(db(), "listings", listingId, "windows"),
    (snap) =>
      onChange(snap.docs.map((snapshot) => toWindow(listingId, snapshot))),
    onSnapshotError("windows"),
  );
}

export type WindowInput = {
  readonly start: string;
  readonly end: string;
  readonly autoAccept: boolean;
  readonly details: string;
  // Null or absent offers the whole place.
  readonly roomId?: string | null;
};

function newWindowFields(window: WindowInput, roomId: string | null) {
  return {
    start: window.start,
    end: window.end,
    status: "OPEN",
    autoAccept: window.autoAccept,
    details: window.details,
    roomId,
    // What makes a saved search able to say "2 new" without asking a server.
    createdAt: serverTimestamp(),
  };
}

/** Offer one set of dates: a room's when `roomId` is set, else the whole place's. */
export async function addWindow(
  listingId: string,
  window: WindowInput,
): Promise<void> {
  await addDoc(
    collection(db(), "listings", listingId, "windows"),
    newWindowFields(window, window.roomId ?? null),
  );
}

/** Offer the same dates in each of several rooms, in one commit. */
export async function addRoomWindows(
  listingId: string,
  roomIds: readonly string[],
  window: Omit<WindowInput, "roomId">,
): Promise<void> {
  if (roomIds.length === 0) return;
  const windowsRef = collection(db(), "listings", listingId, "windows");
  const batch = writeBatch(db());
  for (const roomId of roomIds) {
    batch.set(doc(windowsRef), newWindowFields(window, roomId));
  }
  await batch.commit();
}

export async function setWindowAutoAccept(
  listingId: string,
  windowId: string,
  autoAccept: boolean,
): Promise<void> {
  await updateDoc(doc(db(), "listings", listingId, "windows", windowId), {
    autoAccept,
  });
}

// A slot with pending asks stays editable — locking on request would let anyone
// freeze a host's calendar just by asking — so moving it cancels those asks
// rather than silently redefining what was asked for.
export async function updateWindow(
  listingId: string,
  windowId: string,
  fields: { start: string; end: string; details: string },
  pending: readonly Booking[] = [],
): Promise<void> {
  const voided = pending.filter(
    (booking) =>
      booking.windowId === windowId &&
      booking.status === "REQUESTED" &&
      (booking.start !== fields.start || booking.end !== fields.end),
  );

  const batch = writeBatch(db());
  batch.update(doc(db(), "listings", listingId, "windows", windowId), {
    start: fields.start,
    end: fields.end,
    details: fields.details,
  });
  for (const booking of voided) {
    batch.update(doc(db(), "bookings", booking.id), {
      status: "CANCELLED",
      cancelledBy: booking.ownerId,
      cancelReason: "SLOT_MOVED",
    });
  }
  await batch.commit();
}

// Set by the RULES' 20-lookup budget, not the `in` filter's 30: each distinct
// friend costs one exists() on their edge. The rules tests pin both sides, so
// adding a lookup fails a test rather than silently emptying Browse.
const BROWSE_CHUNK = 20;

export async function fetchFriendListings(
  friendUids: readonly string[],
): Promise<Listing[]> {
  const chunks: string[][] = [];
  for (let index = 0; index < friendUids.length; index += BROWSE_CHUNK) {
    chunks.push(friendUids.slice(index, index + BROWSE_CHUNK));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const snap = await getDocs(
        query(collection(db(), "listings"), where("ownerId", "in", chunk)),
      );
      return snap.docs.map(toListing);
    }),
  );
  return results.flat();
}

// For a stay whose host isn't a friend — nothing else fetches those, since
// Browse only asks for friends' places. A deleted place, or one whose pointer
// has gone inert, reads as null rather than throwing.
export async function fetchListing(listingId: string): Promise<Listing | null> {
  const snap = await getDoc(doc(db(), "listings", listingId)).catch((error) => {
    if (error?.code !== "permission-denied") throw error;
    return null;
  });
  if (!snap?.exists()) return null;
  return toListing(snap as QueryDocumentSnapshot<DocumentData>);
}

/** One set of dates by id; null when it is gone or the reader may not see it. */
export async function fetchWindow(
  listingId: string,
  windowId: string,
): Promise<AvailabilityWindow | null> {
  const snap = await getDoc(
    doc(db(), "listings", listingId, "windows", windowId),
  ).catch((error) => {
    if (error?.code !== "permission-denied") throw error;
    return null;
  });
  if (!snap?.exists()) {
    return null;
  } else {
    return toWindow(listingId, snap as QueryDocumentSnapshot<DocumentData>);
  }
}

export async function fetchWindows(
  listingId: string,
): Promise<AvailabilityWindow[]> {
  const snap = await getDocs(
    collection(db(), "listings", listingId, "windows"),
  );
  return snap.docs.map((snapshot) => toWindow(listingId, snapshot));
}

// For landing straight on a room with nothing loaded. The dates can be refused
// where the place is not — a guest's pointer opens the listing, deliberately not
// the host's calendar — so a denial still yields the room.
export async function fetchRoom(listingId: string): Promise<{
  listing: Listing;
  windows: AvailabilityWindow[];
} | null> {
  const listing = await fetchListing(listingId);
  if (!listing) return null;
  const windows = await fetchWindows(listingId).catch((error) => {
    if (error?.code !== "permission-denied") throw error;
    return [];
  });
  return { listing, windows };
}

function checkoutRef(listingId: string, key: string): DocumentReference {
  return doc(db(), "listings", listingId, "checkout", key);
}

/** Watch every set of instructions a place has. Owner only. */
export function watchCheckout(
  listingId: string,
  onChange: (checkout: CheckoutMap) => void,
): () => void {
  return onSnapshot(
    collection(db(), "listings", listingId, "checkout"),
    (snap) =>
      onChange(
        Object.fromEntries(
          snap.docs.map((entry) => [entry.id, String(entry.data().text ?? "")]),
        ),
      ),
    onSnapshotError("checkout"),
  );
}

/** Save the instructions for a place or one of its rooms; blank text removes them. */
export async function setCheckout(
  listingId: string,
  key: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (trimmed) {
    await setDoc(checkoutRef(listingId, key), { text: trimmed });
  } else {
    await deleteDoc(checkoutRef(listingId, key));
  }
}

type Answer = { readonly text: string | null; readonly refused: boolean };

async function readCheckout(listingId: string, key: string): Promise<Answer> {
  try {
    const snap = await getDoc(checkoutRef(listingId, key));
    const text = snap.exists() ? String(snap.data().text ?? "") : "";
    return { text: text || null, refused: false };
  } catch (error) {
    if ((error as { code?: string })?.code !== "permission-denied") throw error;
    return { text: null, refused: true };
  }
}

/**
 * Fetch the check-out instructions for a guest's own confirmed stay.
 *
 * The place's, plus the room's when the stay is in one. The guest pointer is
 * claimed for THIS stay first, since it is what the rules read and it holds
 * one stay per place — a guest with an earlier visit to another room would
 * otherwise be refused this one's.
 */
export async function fetchStayCheckout(
  booking: Pick<Booking, "id" | "listingId" | "windowId">,
  guestUid: string,
): Promise<StayCheckout> {
  const claim = (): Promise<void> =>
    claimGuestAccess(booking.listingId, guestUid, booking.id);
  const [window] = await Promise.all([
    fetchWindow(booking.listingId, booking.windowId),
    claim(),
  ]);
  const roomId = window?.roomId ?? null;
  const fetchBoth = (): Promise<[Answer, Answer]> =>
    Promise.all([
      readCheckout(booking.listingId, PLACE_KEY),
      roomId
        ? readCheckout(booking.listingId, roomId)
        : Promise.resolve({ text: null, refused: false }),
    ]);
  let [place, room] = await fetchBoth();
  if (place.refused || room.refused) {
    // The store claims every confirmed stay on load, and a claim for another
    // stay here may have landed after ours.
    await claim();
    [place, room] = await fetchBoth();
  }
  return { place: place.text, room: room.text, roomId };
}
