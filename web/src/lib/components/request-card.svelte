<script lang="ts" module>
  import { formatDateRange } from "../format";
  import type {
    AvailabilityWindow,
    ConnectRequest,
    Listing,
    Room,
  } from "../types";
  import type { ConfirmOptions } from "./dialog.svelte";

  // From your own live state, not the portal doc: you own every link that can
  // reach you, so a token you don't hold is one already revoked.
  type LinkTarget =
    | { readonly scope: "USER" }
    | { readonly scope: "LISTING"; readonly listing: Listing }
    | { readonly scope: "ROOM"; readonly listing: Listing; readonly room: Room }
    | {
        readonly scope: "SLOT";
        readonly listing: Listing;
        readonly window: AvailabilityWindow;
      };

  function findLink(
    portalId: string | null,
    profilePortalId: string | null,
    listings: readonly Listing[],
    windowsByListing: Readonly<Record<string, readonly AvailabilityWindow[]>>,
  ): LinkTarget | null {
    if (!portalId) return null;
    if (portalId === profilePortalId) return { scope: "USER" };
    const place = listings.find(
      (listing) => listing.publicPortalId === portalId,
    );
    if (place) return { scope: "LISTING", listing: place };
    for (const listing of listings) {
      const inside = Object.values(listing.rooms).find(
        (candidate) => candidate.publicPortalId === portalId,
      );
      if (inside) return { scope: "ROOM", listing, room: inside };
      const window = (windowsByListing[listing.id] ?? []).find(
        (candidate) => candidate.publicPortalId === portalId,
      );
      if (window) return { scope: "SLOT", listing, window };
    }
    return null;
  }

  // Declining leaves the link live, so this is the moment to say so. The prompt
  // names the scope, because a profile link and a date link are not the same
  // hammer at all.
  function revokePrompt(target: LinkTarget): ConfirmOptions {
    const closing =
      "Declining doesn't stop them asking again — turning the link off is what does.";
    if (target.scope === "USER") {
      return {
        title: "Turn off your profile link?",
        body: `This is the link you send to everyone, and it covers every place you share. Turning it off revokes it for all of them at once, not just for this person. ${closing}`,
        confirmLabel: "Turn off",
        tone: "danger",
      };
    } else if (target.scope === "LISTING") {
      return {
        title: `Turn off the link to ${target.listing.title}?`,
        body: `Everyone you've sent that room's link to loses it, along with every date you open there. ${closing}`,
        confirmLabel: "Turn off",
        tone: "danger",
      };
    } else if (target.scope === "ROOM") {
      return {
        title: `Turn off the link to ${target.room.name}?`,
        body: `Just ${target.room.name} at ${target.listing.title}: everyone you've sent that link to loses it, along with every date you open in that room. ${closing}`,
        confirmLabel: "Turn off",
        tone: "danger",
      };
    } else {
      return {
        title: "Turn off the link to those dates?",
        body: `Just ${formatDateRange(target.window.start, target.window.end)} at ${target.listing.title}: anyone else holding that link loses those nights and nothing else. ${closing}`,
        confirmLabel: "Turn off",
        tone: "danger",
      };
    }
  }
</script>

<script lang="ts">
  import { kip } from "../store.svelte";
  import Avatar from "./avatar.svelte";
  import { dialog, reportFailure, runAction } from "./dialog.svelte";
  import { runNamed } from "./name-gate.svelte";
  import Button from "./ui/button.svelte";
  import Chip from "./ui/chip.svelte";

  // Asking to STAY is a different thing and renders as a BookingRow. A
  // link-borne request says so, since how they reached you is the main thing you
  // need to answer — and the link is the only way to stop them asking again. The
  // person taps through, because for a stranger from a link this card is the
  // only place they appear at all.
  let { request }: { request: ConnectRequest } = $props();

  let busy = $state(false);
  const viaLink = $derived(request.portalId !== null);
  // This card also sits ON the requester's page, where linking through would
  // push a second copy of the screen it's already on.
  const onTheirPage = $derived(
    kip.screen.kind === "person" && kip.screen.id === request.from,
  );
  const link = $derived(
    findLink(
      request.portalId,
      kip.prefs.profilePortalId,
      kip.myListings,
      kip.myWindows,
    ),
  );

  // Accepting writes an edge into the REQUESTER's list, pinned by the rules to
  // the accepter's own profile — so a nameless accept would either be refused or
  // install a blank where a name belongs. The name is collected first.
  async function accept(): Promise<void> {
    // Held, since the name sheet may run this long after the tap.
    const asked = request;
    busy = true;
    try {
      await runNamed(() => kip.acceptRequest(asked), "Accept");
    } catch (error) {
      reportFailure(error, "Couldn't accept that request. Please try again.");
    } finally {
      busy = false;
    }
  }

  // Each link is controlled where it was made. A slot's sheet isn't a screen,
  // so the room screen names the slot and the page opens it.
  function openLink(target: LinkTarget): void {
    if (target.scope === "USER") {
      kip.navigate({ kind: "person", id: request.to });
    } else if (target.scope === "LISTING" || target.scope === "ROOM") {
      // A room's link is on its sheet, one tap in from the place's Rooms list.
      kip.navigate({ kind: "room", id: target.listing.id });
    } else {
      kip.navigate({
        kind: "room",
        id: target.listing.id,
        windowId: target.window.id,
      });
    }
  }

  function revokeLink(target: LinkTarget): Promise<void> {
    if (target.scope === "USER") {
      return kip.revokeUserPortal();
    } else if (target.scope === "LISTING") {
      return kip.revokeListingPortal(target.listing);
    } else if (target.scope === "ROOM") {
      return kip.revokeRoomPortal(target.listing, target.room.id);
    } else {
      return kip.revokeSlotPortal(target.listing.id, target.window);
    }
  }

  async function decline(): Promise<void> {
    // Read before the request is gone: declining removes it, and with it this
    // card and everything derived from its props.
    const target = link;
    busy = true;
    try {
      await kip.declineRequest(request);
    } catch (error) {
      reportFailure(error, "Couldn't decline that request. Please try again.");
      return;
    } finally {
      busy = false;
    }
    if (!target) return;
    const sure = await dialog.confirm(revokePrompt(target));
    if (sure) runAction(() => revokeLink(target));
  }
</script>

<!-- A snippet so it can sit flush against the name: a line break between the
     two would put a space ahead of the handle's own margin. -->
{#snippet handle()}
  {#if request.fromUsername}
    <span class="ml-1.5 font-normal text-muted">@{request.fromUsername}</span>
  {/if}
{/snippet}

{#snippet identity()}
  <Avatar
    name={request.fromName}
    photoURL={request.fromPhotoURL}
    class="h-11 w-11 text-base"
    ring
  />
  <div class="min-w-0 flex-1">
    <span class="block truncate text-[0.9375rem] font-bold">
      {request.fromName || "Someone"}{@render handle()}
    </span>
    <span class="block truncate text-sm text-muted">asked to be friends</span>
  </div>
{/snippet}

<div class="rounded-3xl bg-surface shadow-card">
  <div class="flex flex-col gap-3 p-4">
    <div class="flex items-center gap-3">
      {#if onTheirPage}
        {@render identity()}
      {:else}
        <button
          type="button"
          onclick={() => kip.navigate({ kind: "person", id: request.from })}
          class="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 text-left"
        >
          {@render identity()}
        </button>
      {/if}
      <!-- Passive label: a status pill that took a tap would read as a button. -->
      {#if viaLink}
        <div class="flex shrink-0 flex-col items-end gap-1">
          <Chip tone="neutral">via your link</Chip>
          {#if link}
            {@const target = link}
            <button
              type="button"
              onclick={() => openLink(target)}
              class="text-sm font-semibold text-accent-ink hover:opacity-80"
            >
              Manage link
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Beside the buttons from sm up; at 390px the sentence needs the width. -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <p class="min-w-0 flex-1 text-sm text-muted">
        Friends can see every place you share, whenever it's free.
      </p>
      <div class="flex shrink-0 justify-end gap-2">
        <Button variant="ghost" onclick={decline} disabled={busy}
          >Decline</Button
        >
        <Button onclick={accept} disabled={busy}>Add friend</Button>
      </div>
    </div>
  </div>
</div>
