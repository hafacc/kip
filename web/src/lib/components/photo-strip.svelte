<script lang="ts" module>
  import type { ListingPhoto } from "../types";

  // A drag exposes its `types` but not its data until the drop, so a reorder needs
  // a type of its own to be told apart from a file drop.
  const PHOTO_DRAG_TYPE = "application/x-kip-photo";

  function isPhotoDrag(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes(PHOTO_DRAG_TYPE) ?? false;
  }

  // On top of a photo, so it carries its own contrast rather than a surface token.
  const OVERLAY_CONTROL =
    "grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75 disabled:opacity-50";

  // Removing first is what makes a rightward move land after its target.
  function reordered(
    photos: readonly ListingPhoto[],
    photoId: string,
    to: number,
  ): ListingPhoto[] {
    const moved = photos.filter((photo) => photo.id === photoId);
    const rest = photos.filter((photo) => photo.id !== photoId);
    return [...rest.slice(0, to), ...moved, ...rest.slice(to)];
  }
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import LuCamera from "~icons/lucide/camera";
  import LuChevronLeft from "~icons/lucide/chevron-left";
  import LuChevronRight from "~icons/lucide/chevron-right";
  import LuLoaderCircle from "~icons/lucide/loader-circle";
  import LuTrash2 from "~icons/lucide/trash-2";
  import {
    deleteListingPhoto,
    MAX_PHOTOS,
    PhotoEncodeError,
    photoSrc,
    uploadListingPhoto,
  } from "../photos";
  import { RailFade } from "./rail-fade.svelte";

  // Order is user-visible: the first photo is the cover everywhere it appears.
  let {
    ownerId,
    listingId,
    photos,
    editable = false,
    onchange,
    onbusychange,
  }: {
    ownerId: string;
    listingId: string;
    photos: readonly ListingPhoto[];
    editable?: boolean;
    onchange?: (photos: ListingPhoto[]) => Promise<void>;
    // Lets a form refuse to submit mid-upload, which would drop the photo in
    // flight with nothing on screen to say so.
    onbusychange?: (busy: boolean) => void;
  } = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);
  let dropping = $state(false);
  // Shown before it's stored, so the strip moves under the finger rather than
  // after the round trip.
  let pendingOrder = $state.raw<readonly ListingPhoto[] | null>(null);
  let draggingId = $state<string | null>(null);
  let overId = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement>();
  // A full strip runs past a phone's width, and a hard edge would read as
  // "that's all of them".
  const rail = new RailFade(() => photos.length);

  const order = $derived(pendingOrder ?? photos);

  // A file dropped outside a drop target navigates the browser to it, replacing
  // the app. The strip's own handlers still see their drop first, by bubbling.
  $effect(() => {
    if (!editable) return;
    function swallow(event: DragEvent): void {
      event.preventDefault();
    }
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  });

  $effect(() => {
    const now = busy;
    untrack(() => onbusychange?.(now));
  });

  const full = $derived(photos.length >= MAX_PHOTOS);
  const accepting = $derived(editable && !full && !busy);
  // A write in flight takes the affordances out of service, not off the screen.
  const sortable = $derived(
    editable && onchange !== undefined && order.length > 1,
  );

  // Both the picker and a drop land here, so the cap and the image filter are
  // applied once — `accept` is only a hint, and pickers let anything through.
  async function add(files: readonly File[]): Promise<void> {
    const images = files.filter((file) => file.type.startsWith("image/"));
    const store = onchange;
    if (images.length === 0 || !store) return;
    const owner = ownerId;
    const place = listingId;
    busy = true;
    error = null;
    try {
      const room = MAX_PHOTOS - photos.length;
      const added: ListingPhoto[] = [];
      for (const file of images.slice(0, room)) {
        // Upload first: a listing pointing at a missing object renders a
        // permanent gap, where an orphaned object is merely invisible.
        added.push(await uploadListingPhoto(owner, place, file));
      }
      if (added.length > 0) await store([...photos, ...added]);
    } catch (caught) {
      console.error(caught);
      error =
        caught instanceof PhotoEncodeError
          ? "kip couldn't read that image. Try a different photo."
          : "That didn't upload. Check your connection and try again.";
    } finally {
      busy = false;
      if (fileInput) fileInput.value = "";
    }
  }

  async function remove(photoId: string): Promise<void> {
    if (!onchange) return;
    const owner = ownerId;
    const place = listingId;
    busy = true;
    error = null;
    try {
      // Drop the photo first here — the reverse of adding. If deleting the object
      // then fails, the photo is already invisible, which is what was asked for.
      await onchange(photos.filter((photo) => photo.id !== photoId));
      await deleteListingPhoto(owner, place, photoId);
    } catch (caught) {
      console.error(caught);
      error = "Couldn't remove that photo. Try again.";
    } finally {
      busy = false;
    }
  }

  // Both routes to a new order — a drop and the arrows — land here. The strip
  // shows the result immediately and hands `pendingOrder` back afterwards: on
  // success the listener already carries the same order, and on failure the
  // stored one is still the truth, so either way the prop is what to render.
  async function reorder(next: readonly ListingPhoto[]): Promise<void> {
    if (!onchange) return;
    pendingOrder = next;
    busy = true;
    error = null;
    try {
      await onchange([...next]);
    } catch (caught) {
      console.error(caught);
      error = "Couldn't save that order. Try again.";
    } finally {
      pendingOrder = null;
      busy = false;
    }
  }

  function move(photoId: string, delta: number): void {
    const to = order.findIndex((photo) => photo.id === photoId) + delta;
    if (to < 0 || to >= order.length) return;
    reorder(reordered(order, photoId, to)).catch((caught) =>
      console.error("reorder", caught),
    );
  }

  function ondrop(event: DragEvent): void {
    event.preventDefault();
    dropping = false;
    if (!accepting) return;
    add(Array.from(event.dataTransfer?.files ?? [])).catch((caught) =>
      console.error("add", caught),
    );
  }
</script>

{#if editable || photos.length > 0}
  <div class="flex flex-col gap-2">
    <!-- The border is always there, transparent, so arming the target can't
         shift the row by a pixel. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- biome-ignore lint/a11y/noStaticElementInteractions: dropping is an addition to the picker button below, which stays keyboard-reachable -->
    <div
      bind:this={rail.node}
      style:mask-image={rail.maskImage}
      ondragenter={(event) => {
        // Only files: a photo being dragged within the strip, or text, or a
        // link, must not arm the target for an upload.
        if (accepting && event.dataTransfer?.types.includes("Files")) {
          dropping = true;
        }
      }}
      ondragover={(event) => {
        // Without cancelling the drag-over the browser never fires a drop here.
        // A photo drag is the thumbnails' business, so it is left alone: one
        // released between them carries no files and lands as a no-op rather
        // than being taken for an upload.
        if (!accepting || isPhotoDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }}
      ondragleave={(event) => {
        // Crossing a child fires dragleave for the one being left, so ignore
        // any whose destination is still inside the strip (null = left the
        // window).
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          dropping = false;
          overId = null;
        }
      }}
      {ondrop}
      class="flex gap-2 overflow-x-auto rounded-2xl border px-1 py-1 transition {dropping
        ? "border-accent bg-accent-soft"
        : "border-transparent"}"
    >
      {#each order as { id: photoId, url }, index (photoId)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- biome-ignore lint/a11y/noStaticElementInteractions: dragging is an addition to the arrow buttons below, which are keyboard-reachable -->
        <div
          draggable={sortable && !busy}
          ondragstart={(event) => {
            // The id rides in a type of our own so a drop anywhere else reads
            // as nothing, and so the file-drop handlers can ignore it.
            event.dataTransfer?.setData(PHOTO_DRAG_TYPE, photoId);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
            draggingId = photoId;
          }}
          ondragend={() => {
            draggingId = null;
            overId = null;
          }}
          ondragover={(event) => {
            if (!sortable || busy || !isPhotoDrag(event)) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            overId = photoId;
          }}
          ondrop={(event) => {
            if (!isPhotoDrag(event)) return;
            event.preventDefault();
            // The strip's own drop handler adds files; this one is already
            // dealt with, so don't let it get there.
            event.stopPropagation();
            overId = null;
            draggingId = null;
            const dragged = event.dataTransfer?.getData(PHOTO_DRAG_TYPE);
            if (dragged && dragged !== photoId) {
              reorder(reordered(order, dragged, index)).catch((caught) =>
                console.error("reorder", caught),
              );
            }
          }}
          class="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface-muted transition {draggingId ===
          photoId
            ? "opacity-40"
            : ""} {overId === photoId && draggingId !== photoId
            ? "ring-2 ring-accent"
            : ""}"
        >
          <!-- An image is draggable in its own right, and would start a drag of
               the picture instead of the one this thumbnail defines. -->
          <img
            src={photoSrc(url) ?? ""}
            alt=""
            draggable={false}
            class="h-full w-full object-cover"
          >
          {#if editable && index === 0}
            <span
              class="absolute left-1 top-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-white"
            >
              Cover
            </span>
          {/if}
          {#if editable}
            <button
              type="button"
              onclick={() => remove(photoId)}
              disabled={busy}
              aria-label="Remove photo"
              class="absolute right-1 top-1 {OVERLAY_CONTROL}"
            >
              <LuTrash2 width="13" height="13" />
            </button>
          {/if}
          {#if sortable && index > 0}
            <button
              type="button"
              onclick={() => move(photoId, -1)}
              disabled={busy}
              aria-label={`Move photo ${index + 1} left`}
              class="absolute bottom-1 left-1 {OVERLAY_CONTROL}"
            >
              <LuChevronLeft width="14" height="14" />
            </button>
          {/if}
          {#if sortable && index < order.length - 1}
            <button
              type="button"
              onclick={() => move(photoId, 1)}
              disabled={busy}
              aria-label={`Move photo ${index + 1} right`}
              class="absolute bottom-1 right-1 {OVERLAY_CONTROL}"
            >
              <LuChevronRight width="14" height="14" />
            </button>
          {/if}
        </div>
      {/each}

      {#if editable && !full}
        <button
          type="button"
          onclick={() => fileInput?.click()}
          disabled={busy}
          title="Add photos"
          aria-label="Add photos"
          aria-busy={busy || undefined}
          class="grid h-24 w-24 shrink-0 place-items-center rounded-2xl border border-dashed transition disabled:opacity-50 {dropping
            ? "border-accent bg-surface text-accent-ink"
            : "border-border text-muted hover:bg-surface-hover"}"
        >
          {#if busy}
            <LuLoaderCircle class="animate-spin" />
          {:else}
            <LuCamera />
          {/if}
        </button>
      {/if}
    </div>

    {#if editable}
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onchange={(event) => add(Array.from(event.currentTarget.files ?? []))}
      >
    {/if}

    {#if error}
      <p class="px-1 text-sm text-danger">{error}</p>
    {/if}
    {#if editable && !full}
      <p class="px-1 text-sm text-muted">
        Tap to choose photos, or drop them here.
      </p>
    {/if}
    {#if editable && full}
      <p class="px-1 text-sm text-muted">
        That's the maximum of {MAX_PHOTOS} photos.
      </p>
    {/if}
    {#if sortable}
      <p class="px-1 text-sm text-muted">
        Drag a photo, or use its arrows, to change the order.
      </p>
    {/if}
  </div>
{/if}
