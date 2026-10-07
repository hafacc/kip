<script lang="ts">
  import LuMapPin from "~icons/lucide/map-pin";
  import LuZap from "~icons/lucide/zap";
  import { formatDateRange, isExpired } from "../format";
  import { placeTypeLabel } from "../listings";
  import { offerLabel, roomList } from "../rooms";
  import { kip } from "../store.svelte";
  import type { AvailabilityWindow, Listing } from "../types";
  import Avatar from "./avatar.svelte";
  import CoverPhoto from "./cover-photo.svelte";
  import Chip from "./ui/chip.svelte";

  // A result card for a friend's place: the host featured up top (gradient ring),
  // a type chip, the bold title, a location/distance line, and a footer teasing
  // open windows with an Instant chip. The whole card taps through to the room
  // page; a nested host button (above a full-bleed overlay) taps to the host's
  // person page instead.
  let {
    listing,
    windows,
    distanceKm,
    showHost = true,
  }: {
    listing: Listing;
    windows: readonly AvailabilityWindow[];
    distanceKm?: number | null;
    showHost?: boolean;
  } = $props();

  const host = $derived(
    kip.friends.find((friend) => friend.uid === listing.ownerId),
  );
  const isMine = $derived(listing.ownerId === kip.user?.uid);

  const open = $derived(
    windows
      .filter((window) => window.status === "OPEN" && !isExpired(window.end))
      .sort((left, right) => left.start.localeCompare(right.start)),
  );
  const hasInstant = $derived(open.some((window) => window.autoAccept));
  const roomCount = $derived(roomList(listing).length);
</script>

<article
  class="relative rounded-3xl bg-surface p-4 shadow-card transition hover:shadow-panel"
>
  <button
    type="button"
    aria-label={listing.title}
    onclick={() => kip.navigate({ kind: "room", id: listing.id })}
    class="absolute inset-0 rounded-3xl"
  ></button>
  <div class="pointer-events-none relative flex flex-col gap-2.5">
    <!-- Just the cover here: the whole card is one tap target for the room,
         so anything browsable inside it would be a button fighting that. -->
    <CoverPhoto photo={listing.photos[0]} class="h-40 w-full" />
    <div class="flex items-center gap-2.5">
      {#if showHost && host && !isMine}
        <button
          type="button"
          onclick={() => kip.navigate({ kind: "person", id: host.uid })}
          class="pointer-events-auto -m-1 flex min-w-0 items-center gap-2.5 rounded-2xl p-1 text-left"
        >
          <Avatar
            name={host.displayName}
            photoURL={host.photoURL}
            class="h-9 w-9 text-sm"
            ring
          />
          <span class="min-w-0">
            <span class="block truncate text-sm font-bold">
              {host.displayName}
            </span>
            <span class="block text-xs text-muted">Hosting · your friend</span>
          </span>
        </button>
      {/if}
      <Chip tone="type" class="ml-auto">
        {placeTypeLabel(listing.type, roomCount)}
      </Chip>
    </div>

    <h3 class="text-lg font-bold tracking-[-0.02em]">{listing.title}</h3>

    <p class="flex items-center gap-1.5 text-sm text-muted">
      <LuMapPin width="14" height="14" class="shrink-0" />
      <span class="truncate">{listing.location.label}</span>
      {#if typeof distanceKm === "number"}
        <span class="shrink-0">· {Math.round(distanceKm)} km</span>
      {/if}
    </p>

    <div
      class="mt-1.5 flex items-center justify-between gap-2 border-t border-border pt-3"
    >
      {#if open.length === 0}
        <span class="text-sm text-muted">No open dates right now</span>
      {:else}
        <span class="flex min-w-0 flex-col">
          <span class="text-sm font-bold">
            {open.length}
            open {open.length === 1 ? "window" : "windows"}
          </span>
          <span class="truncate text-xs text-muted">
            next {formatDateRange(open[0].start, open[0].end)}{roomCount > 0
              ? ` · ${offerLabel(listing, open[0].roomId)}`
              : ""}
          </span>
        </span>
      {/if}
      {#if hasInstant}
        <Chip tone="instant">
          {#snippet icon()}
            <LuZap width="12" height="12" />
          {/snippet}
          Instant
        </Chip>
      {/if}
    </div>
  </div>
</article>
