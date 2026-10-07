<script lang="ts" module>
  type GeoState = "idle" | "searching" | "found" | "notfound";

  // The one control `Input` can't be: a textarea grows, so it can't sit at the
  // shared 44px height. Everything else about it is the same white surface, border
  // and focus ring, kept in step by hand.
  const TEXTAREA =
    "w-full rounded-xl border border-border bg-surface px-3.5 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

  const ROOMS_BLOCK_TYPE =
    "Remove this place's rooms before changing it to a room.";
</script>

<script lang="ts">
  import LuLoaderCircle from "~icons/lucide/loader-circle";
  import LuMapPin from "~icons/lucide/map-pin";
  import LuPlus from "~icons/lucide/plus";
  import { type GeocodeResult, geocodeMatches } from "../geocode";
  import {
    type ListingInput,
    type NewRoom,
    RoomsNotAllowedError,
  } from "../listings";
  import { canHaveRooms, roomList, wholePlaceLabel } from "../rooms";
  import type { Listing, ListingPhoto, ListingType } from "../types";
  import CheckoutField from "./checkout-field.svelte";
  import DraftRoomSheet from "./draft-room-sheet.svelte";
  import PhotoStrip from "./photo-strip.svelte";
  import RoomRow from "./room-row.svelte";
  import RoomSheet from "./room-sheet.svelte";
  import Button from "./ui/button.svelte";
  import FieldNote from "./ui/field-note.svelte";
  import Group from "./ui/group.svelte";
  import Input from "./ui/input.svelte";
  import Segmented from "./ui/segmented.svelte";

  // The listing editor, laid out as a full-screen stacked screen. The parent
  // (ListingFormScreen) wires submit/cancel to the nav stack.
  let {
    initial,
    ownerId,
    listingId,
    photos,
    checkout,
    draftRooms,
    onsubmit,
    onphotos,
    ondraftroom,
    ondropdraftroom,
  }: {
    initial?: Listing;
    ownerId: string;
    listingId: string;
    photos: readonly ListingPhoto[];
    // The place's stored check-out instructions; undefined until they are known.
    checkout: string | undefined;
    // The rooms of a place not yet created. An existing place's are read off
    // `initial` and edited in place, since they already exist.
    draftRooms: readonly NewRoom[];
    // `checkout` is null when the instructions were left untouched.
    onsubmit: (input: ListingInput, checkout: string | null) => Promise<void>;
    onphotos: (photos: ListingPhoto[]) => Promise<void>;
    ondraftroom: (room: NewRoom) => void;
    ondropdraftroom: (room: NewRoom) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const start = initial;
  const hasInitialCoords = Boolean(
    start && (start.location.lat || start.location.lng),
  );
  let title = $state(start?.title ?? "");
  let type = $state<ListingType>(start?.type ?? "ROOM");
  let description = $state(start?.description ?? "");
  let label = $state(start?.location.label ?? "");
  let coords = $state.raw<{ lat: number; lng: number } | null>(
    hasInitialCoords && start
      ? { lat: start.location.lat, lng: start.location.lng }
      : null,
  );
  let geo = $state<GeoState>(hasInitialCoords ? "found" : "idle");
  let matches = $state.raw<GeocodeResult[]>([]);
  let busy = $state(false);
  let uploading = $state(false);
  // `roomId` null is the sheet that adds one.
  let openRoom = $state.raw<{ roomId: string | null } | null>(null);
  let typeRefused = $state(false);
  // Null until typed in, so instructions that load after the form opens still
  // show rather than being overwritten by an empty field.
  let checkoutDraft = $state<string | null>(null);
  const rooms = $derived<readonly NewRoom[]>(
    initial ? roomList(initial) : draftRooms,
  );

  function chooseType(next: ListingType): void {
    // Refused here rather than at Save, where the reason would arrive late.
    const refused = !canHaveRooms(next) && rooms.length > 0;
    typeRefused = refused;
    if (!refused) type = next;
  }

  async function lookup(): Promise<void> {
    if (!label.trim()) return;
    geo = "searching";
    matches = [];
    const results = await geocodeMatches(label);
    matches = results;
    geo = results.length === 0 ? "notfound" : "idle";
  }

  function selectMatch(match: GeocodeResult): void {
    label = match.label;
    coords = { lat: match.lat, lng: match.lng };
    geo = "found";
    matches = [];
  }

  async function submit(): Promise<void> {
    if (!title.trim() || !label.trim()) return;
    busy = true;
    try {
      // Resolve coordinates from the address if the owner didn't pick a match.
      let resolved = coords;
      if (!resolved) {
        const result = (await geocodeMatches(label))[0];
        if (result) resolved = { lat: result.lat, lng: result.lng };
      }
      await onsubmit(
        {
          title: title.trim(),
          type,
          description: description.trim(),
          location: {
            label: label.trim(),
            lat: resolved?.lat ?? 0,
            lng: resolved?.lng ?? 0,
          },
        },
        checkoutDraft === null ? null : checkoutDraft.trim(),
      );
    } catch (error) {
      // A room added in another tab since this form opened.
      if (error instanceof RoomsNotAllowedError) typeRefused = true;
      else throw error;
    } finally {
      busy = false;
    }
  }

  function closeRoom(): void {
    openRoom = null;
  }
</script>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-5">
  <label for="listing-title" class="flex flex-col gap-1.5 text-sm text-muted">
    Title
    <Input
      id="listing-title"
      placeholder="e.g. Sunny guest room"
      bind:value={title}
    />
  </label>

  <div class="flex flex-col gap-1.5">
    <span class="text-sm text-muted">Type</span>
    <Segmented
      ariaLabel="Place type"
      value={type}
      onchange={chooseType}
      options={[
        { value: "ROOM", label: "Room" },
        { value: "FLAT", label: "Flat" },
        { value: "HOUSE", label: "House" },
      ]}
    />
    {#if typeRefused}
      <FieldNote tone="danger">{ROOMS_BLOCK_TYPE}</FieldNote>
    {/if}
  </div>

  <label class="flex flex-col gap-1.5 text-sm text-muted">
    Description
    <textarea
      class="{TEXTAREA} min-h-24 resize-y py-2"
      placeholder="What it's like, apartment/unit number, house rules…"
      bind:value={description}
    ></textarea>
    <!-- On the field, not in a `title=` tooltip: a touch device never shows
         one, and this is the only place a guest learns which door is yours. -->
    <FieldNote>
      The address lookup only finds the building — put the apartment or unit
      number here.
    </FieldNote>
  </label>

  <div class="flex flex-col gap-1.5">
    <span class="text-sm text-muted">Address</span>
    <div class="flex gap-2">
      <Input
        class="min-w-0 flex-1"
        placeholder="Address or area (e.g. Brooklyn, NY)"
        aria-label="Address"
        bind:value={label}
        oninput={() => {
          coords = null;
          matches = [];
          geo = "idle";
        }}
        onkeydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            lookup();
          }
        }}
      />
      <Button
        variant="secondary"
        onclick={lookup}
        disabled={!label.trim() || geo === "searching"}
        class="shrink-0"
      >
        {#if geo === "searching"}
          <LuLoaderCircle class="animate-spin" />
        {:else}
          <LuMapPin />
        {/if}
        Find
      </Button>
    </div>
    {#if matches.length > 0}
      <ul
        class="flex flex-col overflow-hidden rounded-2xl bg-surface shadow-card divide-y divide-border"
      >
        {#each matches as match (`${match.lat},${match.lng},${match.label}`)}
          <li>
            <button
              type="button"
              onclick={() => selectMatch(match)}
              class="flex min-h-11 w-full items-center px-3.5 py-2 text-left text-sm hover:bg-surface-hover"
            >
              {match.label}
            </button>
          </li>
        {/each}
      </ul>
    {:else if geo === "found"}
      <p class="text-sm text-success-ink">📍 Located — coordinates saved.</p>
    {:else if geo === "notfound"}
      <p class="text-sm text-danger">
        Couldn't find that address. You can still save it as-is.
      </p>
    {:else}
      <p class="text-sm text-muted">
        Type an address and press Enter (or Find) to pin it on the map.
      </p>
    {/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <span class="text-sm text-muted">Photos</span>
    <PhotoStrip
      {ownerId}
      {listingId}
      {photos}
      editable
      onchange={onphotos}
      onbusychange={(now) => {
        uploading = now;
      }}
    />
  </div>

  <CheckoutField
    value={checkoutDraft ?? checkout ?? ""}
    onchange={(next) => {
      checkoutDraft = next;
    }}
    disabled={checkout === undefined}
  />

  {#if canHaveRooms(type)}
    <div class="flex flex-col gap-1.5">
      <span class="text-sm text-muted">Rooms</span>
      <Group>
        {#each rooms as room (room.id)}
          <RoomRow
            name={room.name}
            note={room.note}
            photos={room.photos}
            onopen={() => {
              openRoom = { roomId: room.id };
            }}
          />
        {/each}
        <button
          type="button"
          onclick={() => {
            openRoom = { roomId: null };
          }}
          class="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-[0.9375rem] font-semibold text-accent-ink transition-colors hover:bg-surface-hover"
        >
          <LuPlus width="18" height="18" />
          Add a room
        </button>
      </Group>
      <FieldNote>
        Rooms are optional. Add them if friends can stay in one without taking
        the {wholePlaceLabel(type).toLowerCase()}.
      </FieldNote>
    </div>
  {/if}

  <Button
    size="lg"
    onclick={submit}
    disabled={busy || uploading || !title.trim() || !label.trim()}
    class="w-full"
  >
    {initial ? "Save changes" : "Add place"}
  </Button>
  {#if uploading}
    <p class="-mt-3 text-center text-sm text-muted">
      Waiting for photos to finish uploading…
    </p>
  {/if}

  {#if openRoom}
    {@const roomId = openRoom.roomId}
    {#key roomId ?? "new"}
      {#if initial}
        <RoomSheet listing={initial} {roomId} onclose={closeRoom} />
      {:else}
        <DraftRoomSheet
          {ownerId}
          {listingId}
          room={rooms.find((room) => room.id === roomId) ?? null}
          onsave={ondraftroom}
          onremove={ondropdraftroom}
          onclose={closeRoom}
        />
      {/if}
    {/key}
  {/if}
</div>
