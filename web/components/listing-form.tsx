"use client";

import { type ReactElement, useState } from "react";
import { LuLoaderCircle, LuMapPin, LuPlus } from "react-icons/lu";
import { type GeocodeResult, geocodeMatches } from "../utils/geocode";
import {
  type ListingInput,
  type NewRoom,
  RoomsNotAllowedError,
} from "../utils/listings";
import { canHaveRooms, roomList, wholePlaceLabel } from "../utils/rooms";
import type { Listing, ListingPhoto, ListingType } from "../utils/types";
import PhotoStrip from "./photo-strip";
import { DraftRoomSheet, RoomSheet } from "./room-sheet";
import { RoomRow } from "./rooms";
import Button from "./ui/button";
import FieldNote from "./ui/field-note";
import Input from "./ui/input";
import { Group } from "./ui/list";
import Segmented from "./ui/segmented";

type GeoState = "idle" | "searching" | "found" | "notfound";

// The one control `Input` can't be: a textarea grows, so it can't sit at the
// shared 44px height. Everything else about it is the same white surface, border
// and focus ring, kept in step by hand.
const TEXTAREA =
  "w-full rounded-xl border border-border bg-surface px-3.5 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

const ROOMS_BLOCK_TYPE =
  "Remove this place's rooms before changing it to a room.";

// The listing editor, laid out as a full-screen stacked screen. The parent
// (ListingFormScreen) wires submit/cancel to the nav stack.
export default function ListingForm({
  initial,
  ownerId,
  listingId,
  photos,
  draftRooms,
  onSubmit,
  onPhotos,
  onDraftRoom,
  onDropDraftRoom,
}: {
  initial?: Listing;
  ownerId: string;
  listingId: string;
  photos: readonly ListingPhoto[];
  // The rooms of a place not yet created. An existing place's are read off
  // `initial` and edited in place, since they already exist.
  draftRooms: readonly NewRoom[];
  onSubmit: (input: ListingInput) => Promise<void>;
  onPhotos: (photos: ListingPhoto[]) => Promise<void>;
  onDraftRoom: (room: NewRoom) => void;
  onDropDraftRoom: (room: NewRoom) => void;
}): ReactElement {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<ListingType>(initial?.type ?? "ROOM");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [label, setLabel] = useState(initial?.location.label ?? "");
  const hasInitialCoords = Boolean(
    initial && (initial.location.lat || initial.location.lng),
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    hasInitialCoords && initial
      ? { lat: initial.location.lat, lng: initial.location.lng }
      : null,
  );
  const [geo, setGeo] = useState<GeoState>(hasInitialCoords ? "found" : "idle");
  const [matches, setMatches] = useState<GeocodeResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  // `roomId` null is the sheet that adds one.
  const [openRoom, setOpenRoom] = useState<{ roomId: string | null } | null>(
    null,
  );
  const [typeRefused, setTypeRefused] = useState(false);
  const rooms: readonly NewRoom[] = initial ? roomList(initial) : draftRooms;

  function chooseType(next: ListingType): void {
    // Refused here rather than at Save, where the reason would arrive late.
    const refused = !canHaveRooms(next) && rooms.length > 0;
    setTypeRefused(refused);
    if (!refused) setType(next);
  }

  async function lookup(): Promise<void> {
    if (!label.trim()) return;
    setGeo("searching");
    setMatches([]);
    const results = await geocodeMatches(label);
    setMatches(results);
    setGeo(results.length === 0 ? "notfound" : "idle");
  }

  function selectMatch(match: GeocodeResult): void {
    setLabel(match.label);
    setCoords({ lat: match.lat, lng: match.lng });
    setGeo("found");
    setMatches([]);
  }

  async function submit(): Promise<void> {
    if (!title.trim() || !label.trim()) return;
    setBusy(true);
    try {
      // Resolve coordinates from the address if the owner didn't pick a match.
      let resolved = coords;
      if (!resolved) {
        const result = (await geocodeMatches(label))[0];
        if (result) resolved = { lat: result.lat, lng: result.lng };
      }
      await onSubmit({
        title: title.trim(),
        type,
        description: description.trim(),
        location: {
          label: label.trim(),
          lat: resolved?.lat ?? 0,
          lng: resolved?.lng ?? 0,
        },
      });
    } catch (error) {
      // A room added in another tab since this form opened.
      if (error instanceof RoomsNotAllowedError) setTypeRefused(true);
      else throw error;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <label
        htmlFor="listing-title"
        className="flex flex-col gap-1.5 text-sm text-muted"
      >
        Title
        <Input
          id="listing-title"
          placeholder="e.g. Sunny guest room"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">Type</span>
        <Segmented
          ariaLabel="Place type"
          value={type}
          onChange={chooseType}
          options={[
            { value: "ROOM", label: "Room" },
            { value: "FLAT", label: "Flat" },
            { value: "HOUSE", label: "House" },
          ]}
        />
        {typeRefused ? (
          <FieldNote tone="danger">{ROOMS_BLOCK_TYPE}</FieldNote>
        ) : null}
      </div>

      <label className="flex flex-col gap-1.5 text-sm text-muted">
        Description
        <textarea
          className={`${TEXTAREA} min-h-24 resize-y py-2`}
          placeholder="What it's like, apartment/unit number, house rules…"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {/* On the field, not in a `title=` tooltip: a touch device never shows
            one, and this is the only place a guest learns which door is yours. */}
        <FieldNote>
          The address lookup only finds the building — put the apartment or unit
          number here.
        </FieldNote>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">Address</span>
        <div className="flex gap-2">
          <Input
            className="min-w-0 flex-1"
            placeholder="Address or area (e.g. Brooklyn, NY)"
            aria-label="Address"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              setCoords(null);
              setMatches([]);
              setGeo("idle");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                lookup();
              }
            }}
          />
          <Button
            variant="secondary"
            onClick={lookup}
            disabled={!label.trim() || geo === "searching"}
            className="shrink-0"
          >
            {geo === "searching" ? (
              <LuLoaderCircle className="animate-spin" />
            ) : (
              <LuMapPin />
            )}
            Find
          </Button>
        </div>
        {matches.length > 0 ? (
          <ul className="flex flex-col overflow-hidden rounded-2xl bg-surface shadow-card divide-y divide-border">
            {matches.map((match) => (
              <li key={`${match.lat},${match.lng},${match.label}`}>
                <button
                  type="button"
                  onClick={() => selectMatch(match)}
                  className="flex min-h-11 w-full items-center px-3.5 py-2 text-left text-sm hover:bg-surface-hover"
                >
                  {match.label}
                </button>
              </li>
            ))}
          </ul>
        ) : geo === "found" ? (
          <p className="text-sm text-success-ink">
            📍 Located — coordinates saved.
          </p>
        ) : geo === "notfound" ? (
          <p className="text-sm text-danger">
            Couldn't find that address. You can still save it as-is.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Type an address and press Enter (or Find) to pin it on the map.
          </p>
        )}
      </div>

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

      {canHaveRooms(type) ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Rooms</span>
          <Group>
            {rooms.map((room) => (
              <RoomRow
                key={room.id}
                name={room.name}
                note={room.note}
                photos={room.photos}
                onOpen={() => setOpenRoom({ roomId: room.id })}
              />
            ))}
            <button
              type="button"
              onClick={() => setOpenRoom({ roomId: null })}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-[0.9375rem] font-semibold text-accent-ink transition-colors hover:bg-surface-hover"
            >
              <LuPlus size={18} />
              Add a room
            </button>
          </Group>
          <FieldNote>
            Rooms are optional. Add them if friends can stay in one without
            taking the {wholePlaceLabel(type).toLowerCase()}.
          </FieldNote>
        </div>
      ) : null}

      <Button
        size="lg"
        onClick={submit}
        disabled={busy || uploading || !title.trim() || !label.trim()}
        className="w-full"
      >
        {initial ? "Save changes" : "Add place"}
      </Button>
      {uploading ? (
        <p className="-mt-3 text-center text-sm text-muted">
          Waiting for photos to finish uploading…
        </p>
      ) : null}

      {!openRoom ? null : initial ? (
        <RoomSheet
          key={openRoom.roomId ?? "new"}
          listing={initial}
          roomId={openRoom.roomId}
          onClose={() => setOpenRoom(null)}
        />
      ) : (
        <DraftRoomSheet
          key={openRoom.roomId ?? "new"}
          ownerId={ownerId}
          listingId={listingId}
          room={rooms.find((room) => room.id === openRoom.roomId) ?? null}
          onSave={onDraftRoom}
          onRemove={onDropDraftRoom}
          onClose={() => setOpenRoom(null)}
        />
      )}
    </div>
  );
}
