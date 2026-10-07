"use client";

import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { LuPlus } from "react-icons/lu";
import { isExpired } from "../utils/format";
import { type NewRoom, newRoomId } from "../utils/listings";
import { deleteListingPhoto } from "../utils/photos";
import { useKip } from "../utils/store";
import type {
  AvailabilityWindow,
  Booking,
  Listing,
  ListingPhoto,
} from "../utils/types";
import AddDatesSheet from "./add-dates-sheet";
import CheckoutField from "./checkout-field";
import { useAction, useDialog, useFailure } from "./dialog";
import PhotoStrip from "./photo-strip";
import ShareLink from "./share-link";
import Button from "./ui/button";
import Input from "./ui/input";
import Sheet from "./ui/sheet";

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
  const stays = live.filter((booking) => booking.status === "CONFIRMED").length;
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

// Photos upload before a new room is saved, so closing the sheet without saving
// strands them — the same leak the new-place form cleans up after itself.
function useAbandonedPhotos(
  ownerId: string,
  listingId: string,
  photos: readonly ListingPhoto[],
): () => void {
  const kept = useRef(false);
  const uploaded = useRef<readonly ListingPhoto[]>([]);
  uploaded.current = photos;
  useEffect(
    () => () => {
      if (kept.current) return;
      for (const photo of uploaded.current) {
        deleteListingPhoto(ownerId, listingId, photo.id).catch((error) =>
          console.warn("abandoned room photo", error),
        );
      }
    },
    [ownerId, listingId],
  );
  return () => {
    kept.current = true;
  };
}

function RoomFields({
  ownerId,
  listingId,
  name,
  note,
  checkout,
  checkoutKnown = true,
  onName,
  onNote,
  onCheckout,
  photos,
  onPhotos,
  saveLabel,
  dirty,
  onSave,
  children,
}: {
  ownerId: string;
  listingId: string;
  name: string;
  note: string;
  checkout: string;
  // False while a saved room's instructions are still loading.
  checkoutKnown?: boolean;
  onName: (name: string) => void;
  onNote: (note: string) => void;
  onCheckout: (checkout: string) => void;
  photos: readonly ListingPhoto[];
  onPhotos: (photos: ListingPhoto[]) => Promise<void>;
  saveLabel: string;
  dirty: boolean;
  onSave: () => Promise<void>;
  children?: ReactNode;
}): ReactElement {
  const fail = useFailure();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const nameId = useId();
  const noteId = useId();

  async function save(): Promise<void> {
    setBusy(true);
    try {
      await onSave();
    } catch (error) {
      fail(error, "Couldn't save that room. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <label
        htmlFor={nameId}
        className="flex flex-col gap-1.5 text-sm text-muted"
      >
        Name
        <Input
          id={nameId}
          placeholder="e.g. Back bedroom"
          value={name}
          onChange={(event) => onName(event.target.value)}
        />
      </label>
      <label
        htmlFor={noteId}
        className="flex flex-col gap-1.5 text-sm text-muted"
      >
        Note
        <Input
          id={noteId}
          placeholder="e.g. Ground floor, double bed"
          value={note}
          onChange={(event) => onNote(event.target.value)}
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">Photos</span>
        <PhotoStrip
          ownerId={ownerId}
          listingId={listingId}
          photos={photos}
          editable
          onChange={onPhotos}
          onBusyChange={setUploading}
        />
      </div>
      <CheckoutField
        value={checkout}
        onChange={onCheckout}
        disabled={!checkoutKnown}
      />
      <Button
        onClick={save}
        disabled={busy || uploading || !dirty || !name.trim()}
      >
        {saveLabel}
      </Button>
      {children}
    </div>
  );
}

/**
 * A room of a place that exists: its name, note, photos, check-out
 * instructions, link and dates.
 *
 * With `roomId` null it adds a room instead, and shows only what a room needs
 * to exist. Edits to an existing room's photos land at once; its name, note
 * and instructions wait for Save.
 */
export function RoomSheet({
  listing,
  roomId,
  onClose,
}: {
  listing: Listing;
  roomId: string | null;
  onClose: () => void;
}): ReactElement | null {
  const {
    myWindows,
    myCheckout,
    incomingBookings,
    addRoom,
    updateRoom,
    setCheckout,
    setRoomPhotos,
    removeRoom,
    publishRoomPortal,
    revokeRoomPortal,
  } = useKip();
  const { confirm } = useDialog();
  const run = useAction();
  const room = roomId ? listing.rooms[roomId] : undefined;
  const [draftId] = useState(newRoomId);
  const [name, setName] = useState(room?.name ?? "");
  const [note, setNote] = useState(room?.note ?? "");
  const [draftPhotos, setDraftPhotos] = useState<readonly ListingPhoto[]>([]);
  const [addingDates, setAddingDates] = useState(false);
  // Null until typed in, so instructions that load after the sheet opens still
  // show rather than being overwritten by an empty field.
  const [checkoutDraft, setCheckoutDraft] = useState<string | null>(null);
  const keep = useAbandonedPhotos(listing.ownerId, listing.id, draftPhotos);
  const windows = myWindows[listing.id] ?? [];
  const placeCheckout = myCheckout[listing.id];
  const storedCheckout = room ? (placeCheckout?.[room.id] ?? "") : "";
  const checkout = checkoutDraft ?? storedCheckout;
  const detailsChanged =
    !room || name.trim() !== room.name || note.trim() !== room.note;
  const checkoutChanged = checkout.trim() !== storedCheckout;

  // Removed from under the sheet, here or in another tab.
  const gone = roomId !== null && !room;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  if (gone) return null;

  async function save(): Promise<void> {
    const input = { name: name.trim(), note: note.trim() };
    if (room) {
      if (detailsChanged) await updateRoom(listing.id, room.id, input);
      if (checkoutChanged) await setCheckout(listing.id, room.id, checkout);
      setCheckoutDraft(null);
    } else {
      await addRoom(listing, input, draftId, draftPhotos, checkout);
      keep();
      onClose();
    }
  }

  async function remove(): Promise<void> {
    if (!room) return;
    const ok = await confirm({
      title: `Remove ${room.name}?`,
      body: removalNote(room.id, windows, incomingBookings),
      confirmLabel: "Remove room",
      cancelLabel: "Keep",
      tone: "danger",
    });
    if (!ok) return;
    run(() => removeRoom(listing, room.id));
    onClose();
  }

  if (room && addingDates) {
    return (
      <AddDatesSheet
        listing={listing}
        existing={windows}
        roomId={room.id}
        onClose={() => setAddingDates(false)}
      />
    );
  }

  return (
    <Sheet open onClose={onClose} title={room ? room.name : "Add a room"}>
      <RoomFields
        ownerId={listing.ownerId}
        listingId={listing.id}
        name={name}
        note={note}
        checkout={checkout}
        checkoutKnown={!room || placeCheckout !== undefined}
        onName={setName}
        onNote={setNote}
        onCheckout={setCheckoutDraft}
        photos={room ? room.photos : draftPhotos}
        onPhotos={
          room
            ? (photos) => setRoomPhotos(listing.id, room.id, photos)
            : async (photos) => setDraftPhotos(photos)
        }
        saveLabel={room ? "Save changes" : "Add room"}
        dirty={detailsChanged || checkoutChanged}
        onSave={save}
      >
        {room ? (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted">
                Share this room
              </span>
              {/* Wrapped so the create button keeps its own width. */}
              <div>
                <ShareLink
                  portalId={room.publicPortalId}
                  createLabel="Create link for this room"
                  onCreate={async () => {
                    await publishRoomPortal(listing, room.id);
                  }}
                  onRevoke={() => revokeRoomPortal(listing, room.id)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAddingDates(true)}>
                <LuPlus />
                Add dates
              </Button>
              <Button variant="danger" onClick={remove}>
                Remove room
              </Button>
            </div>
          </>
        ) : null}
      </RoomFields>
    </Sheet>
  );
}

/**
 * A room of a place that doesn't exist yet: name, note, photos and check-out
 * instructions only.
 *
 * Nothing is written; the room is handed back to the form, which creates it
 * with the place. With `room` null it draws up a new one.
 */
export function DraftRoomSheet({
  ownerId,
  listingId,
  room,
  onSave,
  onRemove,
  onClose,
}: {
  ownerId: string;
  listingId: string;
  room: NewRoom | null;
  onSave: (room: NewRoom) => void;
  onRemove: (room: NewRoom) => void;
  onClose: () => void;
}): ReactElement {
  const { confirm } = useDialog();
  const [draftId] = useState(newRoomId);
  const [name, setName] = useState(room?.name ?? "");
  const [note, setNote] = useState(room?.note ?? "");
  const [checkout, setCheckout] = useState(room?.checkout ?? "");
  const [draftPhotos, setDraftPhotos] = useState<readonly ListingPhoto[]>([]);
  const keep = useAbandonedPhotos(ownerId, listingId, draftPhotos);

  async function save(): Promise<void> {
    const input = {
      name: name.trim(),
      note: note.trim(),
      checkout: checkout.trim(),
    };
    if (room) {
      onSave({ ...room, ...input });
    } else {
      onSave({ id: draftId, ...input, photos: draftPhotos });
      keep();
    }
    onClose();
  }

  async function remove(): Promise<void> {
    if (!room) return;
    const ok = await confirm({
      title: `Remove ${room.name}?`,
      body: "This removes the room and its photos.",
      confirmLabel: "Remove room",
      cancelLabel: "Keep",
      tone: "danger",
    });
    if (!ok) return;
    onRemove(room);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={room ? room.name : "Add a room"}>
      <RoomFields
        ownerId={ownerId}
        listingId={listingId}
        name={name}
        note={note}
        checkout={checkout}
        onName={setName}
        onNote={setNote}
        onCheckout={setCheckout}
        photos={room ? room.photos : draftPhotos}
        onPhotos={async (photos) => {
          if (room) onSave({ ...room, photos });
          else setDraftPhotos(photos);
        }}
        saveLabel={room ? "Save changes" : "Add room"}
        dirty={
          !room ||
          name.trim() !== room.name ||
          note.trim() !== room.note ||
          checkout.trim() !== (room.checkout ?? "")
        }
        onSave={save}
      >
        {room ? (
          <div>
            <Button variant="danger" onClick={remove}>
              Remove room
            </Button>
          </div>
        ) : null}
      </RoomFields>
    </Sheet>
  );
}
