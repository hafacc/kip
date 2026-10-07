"use client";

import { type ReactElement, useEffect, useRef, useState } from "react";
import {
  type ListingInput,
  type NewRoom,
  newListingId,
} from "../utils/listings";
import { deleteListingPhoto } from "../utils/photos";
import { useKip } from "../utils/store";
import type { ListingPhoto } from "../utils/types";
import ListingForm from "./listing-form";

// The listing editor as a stacked screen. `id` null mints a new listing (then
// replaces this screen with the new room page); an id edits in place (then pops
// back to wherever the editor was opened from).
export default function ListingFormScreen({
  id,
}: {
  id: string | null;
}): ReactElement {
  const {
    user,
    myListings,
    createListing,
    updateListing,
    setListingPhotos,
    replace,
    back,
  } = useKip();
  const initial = id
    ? myListings.find((listing) => listing.id === id)
    : undefined;

  // Held, not re-minted per render: photos upload against it before submit.
  const [draftId] = useState(newListingId);
  const [draftPhotos, setDraftPhotos] = useState<readonly ListingPhoto[]>([]);
  // Rooms drawn up alongside a new place, created with it. Their photos are
  // already uploaded under the same draft id, so they are abandoned with it too.
  const [draftRooms, setDraftRooms] = useState<readonly NewRoom[]>([]);
  // Read by the abandon cleanup, which must not re-run as either changes.
  const created = useRef(false);
  const uploaded = useRef<readonly ListingPhoto[]>([]);
  uploaded.current = [
    ...draftPhotos,
    ...draftRooms.flatMap((room) => room.photos),
  ];

  // Leaving without submitting strands whatever was uploaded, and nothing else
  // will ever collect it. A closed tab still leaks, which is owner-only and
  // invisible — not worth a beforeunload prompt.
  const ownerId = user?.uid;
  useEffect(() => {
    if (id || !ownerId) return;
    return () => {
      if (created.current) return;
      for (const photo of uploaded.current) {
        deleteListingPhoto(ownerId, draftId, photo.id).catch((error) =>
          console.warn("abandoned photo", error),
        );
      }
    };
  }, [id, ownerId, draftId]);

  if (!user) {
    return <p className="text-muted">You need to be signed in.</p>;
  }
  if (id && !initial) {
    return <p className="text-muted">This place isn't available right now.</p>;
  }

  async function submit(input: ListingInput): Promise<void> {
    if (id) {
      await updateListing(id, input);
      back();
    } else {
      await createListing(draftId, input, draftPhotos, draftRooms);
      created.current = true;
      replace({ kind: "room", id: draftId });
    }
  }

  return (
    <ListingForm
      initial={initial}
      ownerId={user.uid}
      listingId={initial?.id ?? draftId}
      photos={initial?.photos ?? draftPhotos}
      draftRooms={draftRooms}
      onDraftRoom={(room) =>
        setDraftRooms((current) =>
          current.some((candidate) => candidate.id === room.id)
            ? current.map((candidate) =>
                candidate.id === room.id ? room : candidate,
              )
            : [...current, room],
        )
      }
      onDropDraftRoom={(room) => {
        setDraftRooms((current) =>
          current.filter((candidate) => candidate.id !== room.id),
        );
        for (const photo of room.photos) {
          deleteListingPhoto(user.uid, draftId, photo.id).catch((error) =>
            console.warn("dropped room photo", error),
          );
        }
      }}
      onSubmit={submit}
      onPhotos={
        id
          ? (photos) => setListingPhotos(id, photos)
          : async (photos) => setDraftPhotos(photos)
      }
    />
  );
}
