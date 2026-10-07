<script lang="ts">
  import Avatar from "#lib/components/avatar.svelte";
  import Busy from "#lib/components/ui/busy.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import Chip from "#lib/components/ui/chip.svelte";
  import type { Portal, PortalWindow } from "#lib/types.ts";
  import {
    type Connect,
    FAILURE_COPY,
    type Failure,
    FRIEND_ONLY,
    type OnAsk,
    type Standing,
  } from "./ask.ts";
  import ListingBlock from "./listing-block.svelte";

  let {
    portal,
    windows,
    roomsPending,
    roomsFailed,
    isOwner,
    connect,
    standing,
    busy,
    notice,
    failed,
    onretry,
    onask,
  }: {
    portal: Portal;
    windows: Readonly<Record<string, readonly PortalWindow[]>>;
    // True while only the portal doc has arrived, so the host block is all that
    // can be drawn honestly.
    roomsPending: boolean;
    roomsFailed: boolean;
    isOwner: boolean;
    connect: Connect;
    standing: Standing | null;
    busy: string | null;
    // Why an ask was dropped rather than sent — the visitor turned out to have
    // an account already. Lives up here because dropping the ask unmounts the
    // sheet that would otherwise have said so.
    notice: string | null;
    failed: Failure | null;
    onretry: () => void;
    onask: OnAsk;
  } = $props();

  const firstName = $derived(
    portal.ownerName.split(" ")[0] || portal.ownerName,
  );
</script>

<div class="mx-auto flex max-w-2xl flex-col gap-4">
  <div class="flex items-center gap-3">
    <Avatar
      name={portal.ownerName}
      photoURL={portal.ownerPhotoURL}
      class="h-12 w-12 text-base"
      ring
    />
    <div class="min-w-0">
      <p class="text-sm text-muted">Shared by</p>
      <h1 class="font-bold">{portal.ownerName}</h1>
    </div>
  </div>

  {#if roomsFailed}
    <p class="text-sm text-danger">
      Couldn't load what's shared here. Check your connection and try again.
    </p>
  {:else if roomsPending}
    <!-- "Nothing shared here right now" is a statement about an empty link,
         and saying it to someone whose rooms are in flight is worse than
         saying nothing at all. -->
    <div aria-hidden="true" class="flex flex-col gap-4">
      <div class="h-40 animate-pulse rounded-3xl bg-surface shadow-card"></div>
      <div class="h-40 animate-pulse rounded-3xl bg-surface shadow-card"></div>
    </div>
  {:else if portal.listings.length === 0}
    <p class="text-sm text-muted">Nothing shared here right now.</p>
  {:else}
    {#each portal.listings as listing (listing.listingId)}
      <ListingBlock
        {listing}
        roomLink={portal.scope === "ROOM"}
        windows={windows[listing.listingId] ?? []}
        canAsk={!isOwner}
        requestedWindowIds={standing?.windowIds ?? []}
        {busy}
        {onask}
      />
    {/each}
  {/if}

  <!-- The only route when a link has nothing free on it, and it reports its
       own state where it stands rather than vanishing — the same swap a slot
       row makes between Request and a Requested chip. Nothing at all once
       they're connected: a link is an ordinary way to reach a friend's
       places, so there is simply nothing left to ask for. -->
  {#if connect === "sent"}
    <Chip tone="pending" class="self-center">Friend request sent</Chip>
  {:else if connect === "ask"}
    <Button
      variant="secondary"
      size="lg"
      class="w-full"
      onclick={() => onask(null, null)}
      disabled={busy !== null}
    >
      {#if busy === FRIEND_ONLY}
        <Busy label="Ask to be friends" />
      {:else}
        Ask to be friends
      {/if}
    </Button>
  {/if}

  <!-- Dates only — the connect chip above says its own piece, and this line
       used to speak for both without naming which. -->
  {#if standing && standing.windowIds.length > 0}
    <p class="px-1 text-center text-sm text-muted">
      {standing.confirmed
        ? `${firstName} confirmed your dates — they're yours.`
        : `Sent — ${firstName} will get back to you.`}
    </p>
  {/if}

  {#if notice}
    <p class="px-1 text-center text-sm text-muted">{notice}</p>
  {/if}

  <!-- Without this the button just reappears and a failure is invisible. The
       retry re-sends the ask that failed, so nothing has to be found again. -->
  {#if failed}
    <div class="flex flex-col items-center gap-3 px-1">
      <p class="text-center text-sm text-danger">{FAILURE_COPY[failed]}</p>
      <!-- Retrying a slot that has gone would only fail again the same way,
           so the four of those offer nothing and say so instead. -->
      {#if failed === "refused" || failed === "stalled"}
        <Button variant="secondary" onclick={onretry}>Try again</Button>
      {/if}
    </div>
  {/if}
</div>
