<script lang="ts">
  import LuPlus from "~icons/lucide/plus";
  import { todayIso } from "../format";
  import { kip } from "../store.svelte";
  import BookingRow from "./booking-row.svelte";
  import ListingRow from "./listing-row.svelte";
  import { askIdentity } from "./name-gate.svelte";
  import Button from "./ui/button.svelte";
  import Group from "./ui/group.svelte";
  import Section from "./ui/section.svelte";

  // Places is the host's side of kip, so it carries the two things that happen
  // TO your places: someone waiting on an answer, and someone arriving. Home
  // shows these too, mixed in with your own trips and connect requests — it's the
  // digest you land on. This is the tab that owns places, and an ask about one of
  // them had no route from here at all; a per-place count on the row above says
  // which place, and these say who and when.
  const live = $derived.by(() => {
    const today = todayIso();
    return kip.incomingBookings
      .filter((booking) => booking.end >= today)
      .sort((left, right) => left.start.localeCompare(right.start));
  });
  const pendingAsks = $derived(
    live.filter((booking) => booking.status === "REQUESTED"),
  );
  const upcomingGuests = $derived(
    live.filter((booking) => booking.status === "CONFIRMED"),
  );

  function addPlace(): void {
    kip.navigate({ kind: "listing-form", id: null });
  }
</script>

{#if kip.user}
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-7">
    <Section title="My places">
      {#snippet action()}
        {#if kip.myListings.length > 0 && !kip.anonymous}
          <button
            type="button"
            onclick={addPlace}
            class="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink hover:opacity-80"
          >
            <LuPlus class="text-xs" />
            Add place
          </button>
        {/if}
      {/snippet}
      <!-- Hosting is the one thing a browser-local account can't do, and the
           reason belongs to the guest rather than to us: a host who can't be
           reached leaves people holding stays nobody can call off. Mirrors the
           rule; the rule is the enforcement. -->
      {#if kip.anonymous}
        <div
          class="flex flex-col items-start gap-3 rounded-3xl bg-surface p-5 shadow-card"
        >
          <p class="text-sm text-muted">
            Hosting starts with an email — your guests need a host kip can
            reach. Add yours and you can list a place.
          </p>
          <Button variant="secondary" onclick={askIdentity}>Add email</Button>
        </div>
      {:else if kip.myListings.length === 0}
        <div
          class="flex flex-col items-start gap-3 rounded-3xl bg-surface p-5 shadow-card"
        >
          <p class="text-sm text-muted">
            You haven't listed anything yet. Add a room you're not using or your
            whole place while you're away.
          </p>
          <Button onclick={addPlace}>
            <LuPlus />
            Add place
          </Button>
        </div>
      {:else}
        <Group>
          {#each kip.myListings as listing (listing.id)}
            <ListingRow {listing} />
          {/each}
        </Group>
      {/if}
    </Section>

    {#if pendingAsks.length > 0}
      <Section title="Asking to stay">
        <Group>
          {#each pendingAsks as booking (booking.id)}
            <BookingRow {booking} />
          {/each}
        </Group>
      </Section>
    {/if}

    {#if upcomingGuests.length > 0}
      <Section title="Upcoming guests">
        <Group>
          {#each upcomingGuests as booking (booking.id)}
            <BookingRow {booking} />
          {/each}
        </Group>
      </Section>
    {/if}
  </div>
{/if}
