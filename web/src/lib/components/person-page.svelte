<script lang="ts" module>
  // A glance at what they are up to, not a second Trips screen.
  const ELSEWHERE_PREVIEW = 5;
</script>

<script lang="ts">
  import LuMail from "~icons/lucide/mail";
  import { fetchStaysOf } from "../bookings";
  import { isExpired } from "../format";
  import { fetchUserProfile } from "../friends";
  import { sendBookingConnectRequest } from "../requests";
  import { kip } from "../store.svelte";
  import type { Booking, Profile } from "../types";
  import Avatar from "./avatar.svelte";
  import BookingRow from "./booking-row.svelte";
  import { dialog, reportFailure, runAction } from "./dialog.svelte";
  import EditableName from "./editable-name.svelte";
  import PlaceCard from "./place-card.svelte";
  import ProfilePhoto from "./profile-photo.svelte";
  import RequestCard from "./request-card.svelte";
  import SelfIdentity from "./self-identity.svelte";
  import ShareLink from "./share-link.svelte";
  import Button from "./ui/button.svelte";
  import Group from "./ui/group.svelte";
  import Section from "./ui/section.svelte";

  // Serves a friend, yourself, and someone you've only hosted or stayed with —
  // for that last pair the confirmed stay is the only thing making either
  // readable.
  let { uid }: { uid: string } = $props();

  const isSelf = $derived(uid === kip.user?.uid);
  const friend = $derived(
    kip.friends.find((candidate) => candidate.uid === uid),
  );
  // Already loaded either way, so the fetch below is only for someone searchable.
  const known = $derived(kip.knownPerson(uid));
  // Whose profile and stays are held, so one person's never draw under another's
  // name when this page is handed a new uid.
  let fetched = $state.raw<{ uid: string; profile: Profile | null } | null>(
    null,
  );
  let stays = $state.raw<{ uid: string; list: readonly Booking[] } | null>(
    null,
  );
  let asking = $state(false);

  const profile = $derived(fetched?.uid === uid ? fetched.profile : null);
  const hasKnown = $derived(known !== null);
  const isFriend = $derived(friend !== undefined);

  $effect(() => {
    if (isSelf || hasKnown) return;
    const wanted = uid;
    let live = true;
    fetchUserProfile(wanted)
      .then((found) => {
        if (live) fetched = { uid: wanted, profile: found };
      })
      .catch((error) => console.error("fetchUserProfile", error));
    return () => {
      live = false;
    };
  });

  // Empty unless they've chosen to share, which the rules decide — the whole
  // query is refused otherwise, so there's no half-answer to interpret here.
  $effect(() => {
    if (isSelf || !isFriend) {
      stays = null;
      return;
    }
    const wanted = uid;
    let live = true;
    fetchStaysOf(wanted)
      .then((list) => {
        if (live) stays = { uid: wanted, list };
      })
      .catch((error) => console.error("fetchStaysOf", error));
    return () => {
      live = false;
    };
  });

  const theirStays = $derived(stays?.uid === uid ? stays.list : []);

  // Cancelled stays are left to Trips — this is a summary, not a second copy of
  // that screen — but they still count as having met, so they stay in the list.
  const staysBetween = $derived([
    ...kip.trips.filter((trip) => trip.ownerId === uid),
    ...kip.incomingBookings.filter((booking) => booking.guestId === uid),
  ]);
  const liveStays = $derived(
    staysBetween.filter((stay) => stay.status !== "CANCELLED"),
  );
  const upcomingStays = $derived(
    liveStays
      .filter((stay) => !isExpired(stay.end))
      .sort((left, right) => left.start.localeCompare(right.start)),
  );
  const pastStays = $derived(
    liveStays
      .filter((stay) => isExpired(stay.end))
      .sort((left, right) => right.start.localeCompare(left.start)),
  );
  // A stay at YOUR place comes back from both sources; "Stays" above already has it.
  const elsewhere = $derived(
    theirStays.filter(
      (stay) => !staysBetween.some((shared) => shared.id === stay.id),
    ),
  );
  const incoming = $derived(
    kip.incomingRequests.find((request) => request.from === uid),
  );
  const outgoing = $derived(
    kip.outgoingRequests.find((request) => request.to === uid),
  );
  // The third route into `connectRequests`, and the rule wants it by id.
  const sharedStay = $derived(
    staysBetween.find((stay) => stay.status === "CONFIRMED"),
  );

  // The last fallback: a request authorises no read, so its own copies are the
  // only description of someone who reached you by link and isn't answered yet.
  const name = $derived(
    isSelf
      ? (kip.profile?.displayName ?? "You")
      : known?.displayName ||
          profile?.displayName ||
          incoming?.fromName ||
          outgoing?.toName ||
          "Someone",
  );
  const photoURL = $derived(
    isSelf
      ? (kip.profile?.photoURL ?? null)
      : (known?.photoURL ??
          profile?.photoURL ??
          incoming?.fromPhotoURL ??
          outgoing?.toPhotoURL ??
          null),
  );
  // Only on the Auth account, so a friend's is simply not available.
  const email = $derived(isSelf ? (kip.email ?? undefined) : undefined);
  // `||` not `??`: an old friend edge stores username as "", which is falsy but
  // not nullish, and the fetched profile's handle is the better answer.
  const username = $derived(
    isSelf
      ? kip.profile?.username
      : known?.username ||
          profile?.username ||
          incoming?.fromUsername ||
          outgoing?.toUsername,
  );
  const firstName = $derived(name.split(" ")[0]);

  const places = $derived(
    isSelf
      ? kip.myListings
      : kip.friendListings.filter((listing) => listing.ownerId === uid),
  );
  const windows = $derived(isSelf ? kip.myWindows : kip.friendWindows);

  async function removeFriend(): Promise<void> {
    const leaving = friend;
    if (!leaving) return;
    const sure = await dialog.confirm({
      title: `Remove ${leaving.displayName}?`,
      body: "You'll both lose access to each other's places.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!sure) return;
    try {
      await kip.unfriend(leaving.uid);
      kip.back();
    } catch (error) {
      reportFailure(
        error,
        `Couldn't remove ${leaving.displayName}. Please try again.`,
      );
    }
  }

  async function askToConnect(): Promise<void> {
    if (!kip.profile || !sharedStay) return;
    asking = true;
    try {
      await sendBookingConnectRequest(kip.profile, sharedStay, {
        displayName: name,
        photoURL,
      });
    } catch (error) {
      reportFailure(error, "Couldn't send that request. Please try again.");
    } finally {
      asking = false;
    }
  }
</script>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-7">
  <div class="flex flex-col items-center gap-3 pt-2 text-center">
    {#if isSelf}
      <ProfilePhoto {name} {photoURL} />
    {:else}
      <Avatar {name} {photoURL} class="h-20 w-20 text-2xl" ring />
    {/if}
    <div class="w-full min-w-0">
      {#if isSelf}
        <EditableName {name} />
      {:else}
        <h2 class="truncate text-2xl font-extrabold tracking-[-0.03em]">
          {name}
        </h2>
      {/if}
      {#if username}
        <p class="mt-0.5 text-sm text-muted">@{username}</p>
      {/if}
      {#if email}
        <a
          href={`mailto:${email}`}
          class="mx-auto mt-1 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-accent-ink"
        >
          <LuMail class="shrink-0" width="14" height="14" />
          <span class="truncate">{email}</span>
        </a>
      {/if}
    </div>
  </div>

  {#if isSelf}
    <SelfIdentity />

    <Section title="Public profile">
      <p class="px-1 text-sm text-muted">
        A link anyone can open to see your places and ask to stay. Every ask
        needs your approval, and saying yes doesn't make you friends.
      </p>
      <ShareLink
        portalId={kip.prefs.profilePortalId}
        createLabel="Share your profile"
        oncreate={async () => {
          await kip.publishUserPortal();
        }}
        onrevoke={() => kip.revokeUserPortal()}
      />
    </Section>
  {:else}
    {#if incoming}
      <RequestCard request={incoming} />
    {/if}

    {#if outgoing}
      {@const sent = outgoing}
      <div
        class="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card sm:flex-row sm:items-center"
      >
        <p class="min-w-0 flex-1 text-sm text-muted">
          Friend request sent — waiting for {firstName} to answer.
        </p>
        <Button
          variant="ghost"
          onclick={() => runAction(() => kip.cancelRequest(sent))}
          class="shrink-0"
        >
          Cancel
        </Button>
      </div>
    {/if}

    <!-- The one route in for two people who met through a link. -->
    {#if !friend && !incoming && !outgoing && sharedStay}
      <Button
        variant="secondary"
        size="lg"
        onclick={() => runAction(askToConnect)}
        disabled={asking}
        class="w-full"
      >
        Ask to be friends
      </Button>
    {/if}
  {/if}

  {#if upcomingStays.length > 0}
    <Section title="Stays">
      <Group>
        {#each upcomingStays as stay (stay.id)}
          <BookingRow booking={stay} />
        {/each}
      </Group>
    </Section>
  {/if}

  <!-- Their trips generally, as against "Stays" above, which is only the ones
       involving you. Capped: this is a glance at what they're up to, and
       Trips is nobody's second inbox. -->
  {#if elsewhere.length > 0}
    <Section title={`${firstName}'s trips`}>
      <Group>
        {#each elsewhere.slice(0, ELSEWHERE_PREVIEW) as stay (stay.id)}
          <BookingRow booking={stay} showCounterpart={false} />
        {/each}
      </Group>
    </Section>
  {/if}

  {#if pastStays.length > 0}
    <Section title="Past stays">
      <Group class="opacity-70">
        {#each pastStays as stay (stay.id)}
          <BookingRow booking={stay} />
        {/each}
      </Group>
    </Section>
  {/if}

  <Section title={isSelf ? "Your places" : `${firstName}'s places`}>
    {#if !isSelf && !friend}
      <!-- An empty list would claim they share nothing, when the truth is that
           you can't see. -->
      <p class="px-1 text-sm text-muted">
        Only friends can see the places {firstName} shares.
      </p>
    {:else if places.length === 0}
      <p class="px-1 text-sm text-muted">
        {isSelf
          ? "You're not sharing any places yet."
          : `${firstName} isn't sharing any places right now.`}
      </p>
    {:else}
      <div class="gap-3 sm:columns-2">
        {#each places as place (place.id)}
          <div class="mb-3 break-inside-avoid">
            <PlaceCard
              listing={place}
              windows={windows[place.id] ?? []}
              showHost={false}
            />
          </div>
        {/each}
      </div>
    {/if}
  </Section>

  {#if !isSelf && friend}
    <div class="pt-2">
      <Button variant="danger" onclick={removeFriend}>Remove friend</Button>
    </div>
  {/if}
</div>
