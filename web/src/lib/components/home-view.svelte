<script lang="ts" module>
  const PREVIEW_COUNT = 4;
  const FRIEND_PREVIEW = 4;
  const REQUEST_PREVIEW = 5;
  const COMING_UP_PREVIEW = 5;

  // A pluralized "N thing" fragment, or null when the count is zero.
  function countPhrase(count: number, noun: string): string | null {
    if (count <= 0) {
      return null;
    } else {
      return `${count} ${noun}${count === 1 ? "" : "s"}`;
    }
  }
</script>

<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import { isExpired } from "../format";
  import {
    EMPTY_CRITERIA,
    hitsForSearches,
    type SearchCriteria,
    searchListings,
  } from "../search";
  import { kip } from "../store.svelte";
  import Avatar from "./avatar.svelte";
  import BookingRow from "./booking-row.svelte";
  import { dialog } from "./dialog.svelte";
  import PlaceCard from "./place-card.svelte";
  import RequestCard from "./request-card.svelte";
  import SavedSearchRow from "./saved-search-row.svelte";
  import Group from "./ui/group.svelte";
  import Row from "./ui/row.svelte";
  import Section from "./ui/section.svelte";
  import VerifyEmailPrompt from "./verify-email-prompt.svelte";

  // Confirming an ask whose dates have gone would book a stay in the past, so
  // it stops needing attention rather than sitting there forever.
  const bookingRequests = $derived(
    kip.incomingBookings.filter(
      (booking) => booking.status === "REQUESTED" && !isExpired(booking.end),
    ),
  );
  // Your own outstanding asks too — the status chip tells them apart.
  const upcomingStays = $derived(
    kip.trips.filter(
      (trip) => trip.status !== "CANCELLED" && !isExpired(trip.end),
    ),
  );
  const confirmedTrips = $derived(
    upcomingStays.filter((trip) => trip.status === "CONFIRMED"),
  );
  const upcomingGuests = $derived(
    kip.incomingBookings.filter(
      (booking) => booking.status === "CONFIRMED" && !isExpired(booking.end),
    ),
  );
  // Interleaved by date: capped at five, two runs would bury next week's guest
  // behind a trip six months out.
  const comingUp = $derived(
    [...upcomingStays, ...upcomingGuests].sort((left, right) =>
      left.start.localeCompare(right.start),
    ),
  );
  const available = $derived(
    searchListings(kip.friendListings, kip.friendWindows, EMPTY_CRITERIA),
  );
  // Free: the browse set is already in memory, so these are array passes, not
  // reads. They're as of the last refresh, like everything else drawn from it.
  const searchHits = $derived(
    hitsForSearches(kip.savedSearches, kip.friendListings, kip.friendWindows),
  );

  // Opening one puts its results on screen, which is what "seen" means.
  function openSearch(searchId: string, criteria: SearchCriteria): void {
    kip.setCriteria(criteria);
    kip
      .markSearchSeen(searchId)
      .catch((error) => console.error("markSearchSeen", error));
    kip.setView("browse");
  }

  async function removeSearch(searchId: string, label: string): Promise<void> {
    const agreed = await dialog.confirm({
      title: "Remove this search?",
      body: `"${label}" will stop appearing here. The places themselves aren't affected.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (agreed) await kip.deleteSavedSearch(searchId);
  }

  const requestPreview = $derived(
    kip.incomingRequests.slice(0, REQUEST_PREVIEW),
  );
  const comingUpPreview = $derived(comingUp.slice(0, COMING_UP_PREVIEW));
  const availablePreview = $derived(available.slice(0, PREVIEW_COUNT));
  const friendPreview = $derived(kip.friends.slice(0, FRIEND_PREVIEW));

  const hasAttention = $derived(
    bookingRequests.length + kip.incomingRequests.length > 0,
  );

  // The Auth copy is a fire-and-forget mirror, so reading it first greeted
  // "there" whenever that write lost.
  const firstName = $derived(
    (kip.profile?.displayName || kip.user?.displayName || "there").split(
      " ",
    )[0],
  );
  // Counted by name, so the line is a table of contents for the sections below
  // rather than a total to reconcile against them.
  const waiting = $derived(
    [
      countPhrase(bookingRequests.length, "stay request"),
      countPhrase(kip.incomingRequests.length, "friend request"),
    ]
      .filter(Boolean)
      .join(" and "),
  );
  const tripsLine = $derived(
    confirmedTrips.length === 1
      ? "a trip coming up"
      : `${confirmedTrips.length} trips coming up`,
  );
  const summary = $derived(
    [
      waiting ? `${waiting} waiting` : null,
      confirmedTrips.length > 0 ? tripsLine : null,
    ]
      .filter(Boolean)
      .join(", plus ") || "You're all caught up.",
  );
</script>

{#if kip.user}
  <div class="flex flex-col gap-7">
    <VerifyEmailPrompt />

    <div>
      <h1 class="text-2xl font-extrabold tracking-[-0.03em] md:text-3xl">
        Welcome back, {firstName}
      </h1>
      <p class="mt-1 text-[0.9375rem] text-muted">
        {summary.endsWith(".") ? summary : `${summary}.`}
      </p>
    </div>

    <div
      class="flex flex-col gap-7 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-8"
    >
      <div class="flex min-w-0 flex-col gap-7">
        <!-- Two asks, two sections: one hands over a set of dates, the other
             hands over everything you share from then on, and a single stack
             made the reader tell them apart by card shape. Stays lead because
             they're the dated ones — a request expires with its nights — and
             because the uncapped list has to sit above the capped one. -->
        {#if bookingRequests.length > 0}
          <Section title="Stay requests">
            <Group>
              {#each bookingRequests as booking (booking.id)}
                <BookingRow {booking} />
              {/each}
            </Group>
          </Section>
        {/if}

        <!-- Uncapped above, capped here: a friend request keeps until you answer
             it and Friends lists every one, whereas someone waiting on specific
             nights can't be sent elsewhere to be found. -->
        {#if kip.incomingRequests.length > 0}
          <Section title="Friend requests">
            {#snippet action()}
              {#if kip.incomingRequests.length > REQUEST_PREVIEW}
                <button
                  type="button"
                  onclick={() => kip.setView("friends")}
                  class="text-sm font-semibold text-accent-ink hover:opacity-80"
                >
                  See all {kip.incomingRequests.length}
                </button>
              {/if}
            {/snippet}
            {#each requestPreview as request (request.id)}
              <RequestCard {request} />
            {/each}
          </Section>
        {/if}

        {#if comingUp.length > 0}
          <Section title="Coming up">
            {#snippet action()}
              {#if comingUp.length > COMING_UP_PREVIEW}
                <button
                  type="button"
                  onclick={() => kip.setView("trips")}
                  class="text-sm font-semibold text-accent-ink hover:opacity-80"
                >
                  See all upcoming
                </button>
              {/if}
            {/snippet}
            <Group>
              {#each comingUpPreview as booking (booking.id)}
                <BookingRow {booking} />
              {/each}
            </Group>
          </Section>
        {/if}

        <!-- Above the general list because it's the same thing narrowed to
             what you actually asked for. -->
        {#if searchHits.length > 0}
          <Section title="Your searches">
            <Group>
              {#each searchHits as hit (hit.search.id)}
                <SavedSearchRow
                  hits={hit}
                  onopen={() => openSearch(hit.search.id, hit.search.criteria)}
                  onremove={() => removeSearch(hit.search.id, hit.search.label)}
                />
              {/each}
            </Group>
          </Section>
        {/if}

        <Section title="Open at friends' places">
          {#snippet action()}
            {#if available.length > 0}
              <button
                type="button"
                onclick={() => kip.setView("browse")}
                class="text-sm font-semibold text-accent-ink hover:opacity-80"
              >
                Browse all
              </button>
            {/if}
          {/snippet}
          {#if available.length === 0}
            <p class="px-1 text-sm text-muted">
              {!hasAttention && comingUp.length === 0
                ? "Nothing here yet. Add friends and browse the places they share."
                : "No friends' places free right now."}
            </p>
          {:else}
            <div class="gap-3 md:columns-2">
              {#each availablePreview as match (match.listing.id)}
                <div class="mb-3 break-inside-avoid">
                  <PlaceCard
                    listing={match.listing}
                    windows={match.windows}
                    distanceKm={match.distanceKm}
                  />
                </div>
              {/each}
            </div>
          {/if}
        </Section>

        {#if kip.friends.length === 0}
          <button
            type="button"
            onclick={() => kip.setView("friends")}
            class="text-left text-sm font-semibold text-accent-ink hover:opacity-80"
          >
            Find your friends on kip →
          </button>
        {/if}
      </div>

      <aside class="hidden flex-col gap-6 md:flex">
        {#if kip.friends.length > 0}
          <Section title="Friends">
            {#snippet action()}
              <button
                type="button"
                onclick={() => kip.setView("friends")}
                class="text-sm font-semibold text-accent-ink hover:opacity-80"
              >
                All
              </button>
            {/snippet}
            <Group>
              {#each friendPreview as friend (friend.uid)}
                <Row
                  onclick={() =>
                    kip.navigate({ kind: "person", id: friend.uid })}
                  ariaLabel={friend.displayName}
                >
                  <Avatar
                    name={friend.displayName}
                    photoURL={friend.photoURL}
                    class="h-9 w-9 text-sm"
                  />
                  <span
                    class="min-w-0 flex-1 truncate text-[0.9375rem] font-medium"
                  >
                    {friend.displayName}
                  </span>
                  <LuChevronRight class="shrink-0 text-faint" />
                </Row>
              {/each}
            </Group>
          </Section>
        {/if}
      </aside>
    </div>
  </div>
{/if}
