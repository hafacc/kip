<script lang="ts">
  import { PLACE_KEY } from "../checkout";
  import { type ListingInput, type NewRoom, newListingId } from "../listings";
  import { deleteListingPhoto } from "../photos";
  import { kip } from "../store.svelte";
  import type { ListingPhoto } from "../types";
  import ListingForm from "./listing-form.svelte";

  // The listing editor as a stacked screen. `id` null mints a new listing (then
  // replaces this screen with the new room page); an id edits in place (then pops
  // back to wherever the editor was opened from).
  let { id }: { id: string | null } = $props();

  const ownerId = $derived(kip.user?.uid);
  const initial = $derived(
    id ? kip.myListings.find((listing) => listing.id === id) : undefined,
  );

  // Held for the life of the screen: photos upload against it before submit.
  const draftId = newListingId();
  let draftPhotos = $state.raw<readonly ListingPhoto[]>([]);
  // Rooms drawn up alongside a new place, created with it. Their photos are
  // already uploaded under the same draft id, so they are abandoned with it too.
  let draftRooms = $state.raw<readonly NewRoom[]>([]);
  let created = false;

  // Leaving without submitting strands whatever was uploaded, and nothing else
  // will ever collect it. A closed tab still leaks, which is owner-only and
  // invisible — not worth a beforeunload prompt.
  $effect(() => {
    const owner = ownerId;
    if (id || !owner) return;
    return () => {
      if (created) return;
      const uploaded = [
        ...draftPhotos,
        ...draftRooms.flatMap((room) => room.photos),
      ];
      for (const photo of uploaded) {
        deleteListingPhoto(owner, draftId, photo.id).catch((error) =>
          console.warn("abandoned photo", error),
        );
      }
    };
  });

  // A place being created has none stored; an existing one's arrive live.
  const storedCheckout = $derived(id ? kip.myCheckout[id]?.[PLACE_KEY] : "");
  const checkoutKnown = $derived(!id || kip.myCheckout[id] !== undefined);

  async function submit(
    input: ListingInput,
    checkout: string | null,
  ): Promise<void> {
    const editing = id;
    if (editing) {
      const stored = storedCheckout ?? "";
      await kip.updateListing(editing, input);
      if (checkout !== null && checkout !== stored) {
        await kip.setCheckout(editing, PLACE_KEY, checkout);
      }
      kip.back();
    } else {
      await kip.createListing(
        draftId,
        input,
        draftPhotos,
        draftRooms,
        checkout ?? "",
      );
      created = true;
      kip.replace({ kind: "room", id: draftId });
    }
  }

  function keepDraftRoom(room: NewRoom): void {
    draftRooms = draftRooms.some((candidate) => candidate.id === room.id)
      ? draftRooms.map((candidate) =>
          candidate.id === room.id ? room : candidate,
        )
      : [...draftRooms, room];
  }

  function dropDraftRoom(room: NewRoom): void {
    const owner = ownerId;
    draftRooms = draftRooms.filter((candidate) => candidate.id !== room.id);
    if (!owner) return;
    for (const photo of room.photos) {
      deleteListingPhoto(owner, draftId, photo.id).catch((error) =>
        console.warn("dropped room photo", error),
      );
    }
  }

  async function storePhotos(photos: ListingPhoto[]): Promise<void> {
    if (id) await kip.setListingPhotos(id, photos);
    else draftPhotos = photos;
  }
</script>

{#if !ownerId}
  <p class="text-muted">You need to be signed in.</p>
{:else if id && !initial}
  <p class="text-muted">This place isn't available right now.</p>
{:else}
  <ListingForm
    {initial}
    {ownerId}
    listingId={initial?.id ?? draftId}
    photos={initial?.photos ?? draftPhotos}
    checkout={checkoutKnown ? (storedCheckout ?? "") : undefined}
    {draftRooms}
    ondraftroom={keepDraftRoom}
    ondropdraftroom={dropDraftRoom}
    onsubmit={submit}
    onphotos={storePhotos}
  />
{/if}
