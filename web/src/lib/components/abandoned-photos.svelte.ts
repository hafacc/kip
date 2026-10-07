import { deleteListingPhoto } from "../photos";
import type { ListingPhoto } from "../types";

/**
 * Delete photos uploaded for a room that was never saved.
 *
 * Photos upload before a new room is saved, so closing the sheet without saving
 * strands them — the same leak the new-place form cleans up after itself. Call
 * while a component initializes, passing the photos as a function so the ones
 * held when it goes away are the ones deleted; call the returned function once
 * they have been saved, to keep them.
 */
export function abandonedPhotos(
  ownerId: string,
  listingId: string,
  photos: () => readonly ListingPhoto[],
): () => void {
  let kept = false;
  $effect(() => () => {
    if (kept) return;
    for (const photo of photos()) {
      deleteListingPhoto(ownerId, listingId, photo.id).catch((error) =>
        console.warn("abandoned room photo", error),
      );
    }
  });
  return () => {
    kept = true;
  };
}
