<script lang="ts">
  import { type NewRoom, newRoomId } from "../listings";
  import type { ListingPhoto } from "../types";
  import { abandonedPhotos } from "./abandoned-photos.svelte";
  import { dialog } from "./dialog.svelte";
  import RoomFields from "./room-fields.svelte";
  import Button from "./ui/button.svelte";
  import Sheet from "./ui/sheet.svelte";

  // A room of a place that doesn't exist yet: name, note, photos and check-out
  // instructions only.
  //
  // Nothing is written; the room is handed back to the form, which creates it
  // with the place. With `room` null it draws up a new one. Key it on the room,
  // so moving from one to another starts its fields afresh.
  let {
    ownerId,
    listingId,
    room,
    onsave,
    onremove,
    onclose,
  }: {
    ownerId: string;
    listingId: string;
    room: NewRoom | null;
    onsave: (room: NewRoom) => void;
    onremove: (room: NewRoom) => void;
    onclose: () => void;
  } = $props();

  const draftId = newRoomId();
  // svelte-ignore state_referenced_locally
  let name = $state(room?.name ?? "");
  // svelte-ignore state_referenced_locally
  let note = $state(room?.note ?? "");
  // svelte-ignore state_referenced_locally
  let checkout = $state(room?.checkout ?? "");
  let draftPhotos = $state.raw<readonly ListingPhoto[]>([]);
  // svelte-ignore state_referenced_locally
  const keep = abandonedPhotos(ownerId, listingId, () => draftPhotos);

  async function save(): Promise<void> {
    const input = {
      name: name.trim(),
      note: note.trim(),
      checkout: checkout.trim(),
    };
    if (room) {
      onsave({ ...room, ...input });
    } else {
      onsave({ id: draftId, ...input, photos: draftPhotos });
      keep();
    }
    onclose();
  }

  async function remove(): Promise<void> {
    const leaving = room;
    if (!leaving) return;
    const ok = await dialog.confirm({
      title: `Remove ${leaving.name}?`,
      body: "This removes the room and its photos.",
      confirmLabel: "Remove room",
      cancelLabel: "Keep",
      tone: "danger",
    });
    if (!ok) return;
    onremove(leaving);
    onclose();
  }
</script>

<Sheet open {onclose} title={room ? room.name : "Add a room"}>
  <RoomFields
    {ownerId}
    {listingId}
    bind:name
    bind:note
    {checkout}
    oncheckout={(next) => {
      checkout = next;
    }}
    photos={room ? room.photos : draftPhotos}
    onphotos={async (photos) => {
      if (room) onsave({ ...room, photos });
      else draftPhotos = photos;
    }}
    saveLabel={room ? "Save changes" : "Add room"}
    dirty={!room ||
      name.trim() !== room.name ||
      note.trim() !== room.note ||
      checkout.trim() !== (room.checkout ?? "")}
    onsave={save}
  >
    {#if room}
      <div>
        <Button variant="danger" onclick={remove}>Remove room</Button>
      </div>
    {/if}
  </RoomFields>
</Sheet>
