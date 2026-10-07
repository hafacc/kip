<script lang="ts">
  import { isExpired } from "../format";
  import { kip } from "../store.svelte";
  import BookingRow from "./booking-row.svelte";
  import { dialog, runAction } from "./dialog.svelte";
  import Group from "./ui/group.svelte";
  import Section from "./ui/section.svelte";

  // Clearing is per-party: these rows go from THIS list, and each host's own
  // record of the cancellation is untouched.
  async function clearCancelled(): Promise<void> {
    const agreed = await dialog.confirm({
      title: "Clear cancelled trips?",
      body: "They disappear from your list. Each host still has their copy — nothing is deleted.",
      confirmLabel: "Clear all",
    });
    if (!agreed) return;
    await kip.hideCancelledTrips();
  }

  const upcoming = $derived(
    kip.trips
      .filter((trip) => trip.status !== "CANCELLED" && !isExpired(trip.end))
      .sort((left, right) => left.start.localeCompare(right.start)),
  );
  const past = $derived(
    kip.trips
      .filter((trip) => trip.status !== "CANCELLED" && isExpired(trip.end))
      .sort((left, right) => right.start.localeCompare(left.start)),
  );
  // Cancelled stays get their own section rather than being folded into Past:
  // most of them are still in the future, and filing next month's called-off trip
  // under "Past" reads as a mistake. They can't sit under Upcoming either — they
  // aren't coming — and this is the only route in to who cancelled and why.
  const cancelled = $derived(
    kip.trips
      .filter((trip) => trip.status === "CANCELLED")
      .sort((left, right) => right.start.localeCompare(left.start)),
  );
</script>

{#if kip.user}
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-7">
    <Section title="Upcoming">
      {#if upcoming.length === 0}
        <p class="px-1 text-sm text-muted">
          No upcoming trips. Find a place in Browse and request some dates.
        </p>
      {:else}
        <Group>
          {#each upcoming as trip (trip.id)}
            <BookingRow booking={trip} />
          {/each}
        </Group>
      {/if}
    </Section>

    {#if past.length > 0}
      <Section title="Past">
        <Group class="opacity-70">
          {#each past as trip (trip.id)}
            <BookingRow booking={trip} />
          {/each}
        </Group>
      </Section>
    {/if}

    {#if cancelled.length > 0}
      <Section title="Cancelled">
        {#snippet action()}
          <button
            type="button"
            onclick={() => runAction(clearCancelled)}
            class="text-sm font-semibold text-accent-ink hover:opacity-80"
          >
            Clear all
          </button>
        {/snippet}
        <Group class="opacity-70">
          {#each cancelled as trip (trip.id)}
            <BookingRow booking={trip} />
          {/each}
        </Group>
      </Section>
    {/if}
  </div>
{/if}
