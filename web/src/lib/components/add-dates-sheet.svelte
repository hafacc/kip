<script lang="ts" module>
  export const DATE_FIELD =
    "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

  type Offering = "whole" | "rooms";
</script>

<script lang="ts">
  import LuCheck from "~icons/lucide/check";
  import { isExpired, todayIso } from "../format";
  import { findOverlaps, roomList, wholePlaceLabel } from "../rooms";
  import { kip } from "../store.svelte";
  import type { AvailabilityWindow, Listing } from "../types";
  import { runAction } from "./dialog.svelte";
  import { clashNote } from "./rooms";
  import Button from "./ui/button.svelte";
  import FieldNote from "./ui/field-note.svelte";
  import Segmented from "./ui/segmented.svelte";
  import Sheet from "./ui/sheet.svelte";
  import Switch from "./ui/switch.svelte";

  // The sheet that offers new dates at a place.
  //
  // A place with rooms chooses what the dates offer: the whole place, or one set
  // per ticked room. It opens on rooms with every one ticked; pass `roomId` to
  // open with only that room ticked. A place with no rooms shows no such choice.
  let {
    listing,
    existing,
    roomId = null,
    onclose,
  }: {
    listing: Listing;
    existing: readonly AvailabilityWindow[];
    roomId?: string | null;
    onclose: () => void;
  } = $props();

  const rooms = $derived(roomList(listing));
  let start = $state("");
  let end = $state("");
  let details = $state("");
  let autoAccept = $state(false);
  // svelte-ignore state_referenced_locally
  let offering = $state<Offering>(rooms.length > 0 ? "rooms" : "whole");
  // svelte-ignore state_referenced_locally
  let ticked = $state.raw<readonly string[]>(
    roomId ? [roomId] : rooms.map((room) => room.id),
  );

  // In the owner's order whatever order they were ticked in, and never a room
  // removed while the sheet was open.
  const chosen = $derived(
    rooms.map((room) => room.id).filter((id) => ticked.includes(id)),
  );
  const targets = $derived<readonly (string | null)[]>(
    offering === "whole" ? [null] : chosen,
  );
  const ranged = $derived(Boolean(start && end && end > start));
  const first = $derived(
    ranged ? findOverlaps(existing, { start, end }, targets)[0] : undefined,
  );
  // `min` on the pickers is a hint a typed date walks straight past, and a slot
  // that's expired the moment it exists is availability nobody can ever book.
  const gone = $derived(Boolean(end) && isExpired(end));
  const valid = $derived(ranged && !first && !gone && targets.length > 0);

  function toggle(id: string): void {
    ticked = ticked.includes(id)
      ? ticked.filter((candidate) => candidate !== id)
      : [...ticked, id];
  }

  function add(): void {
    if (!valid) return;
    const listingId = listing.id;
    const roomIds = chosen;
    const whole = offering === "whole";
    const dates = { start, end, autoAccept, details: details.trim() };
    runAction(async () => {
      if (whole) {
        await kip.addWindow(listingId, dates);
      } else {
        await kip.addRoomWindows(listingId, roomIds, dates);
      }
      onclose();
    });
  }

  const caption = $derived.by(() => {
    if (chosen.length === 0) {
      return "Tick at least one room.";
    } else if (chosen.length === 1) {
      return "Adds 1 set of dates.";
    } else {
      return `Adds ${chosen.length} sets of dates, one for each room.`;
    }
  });
</script>

<Sheet open {onclose} title="Add dates">
  <div class="flex flex-col gap-5">
    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1.5 text-sm text-muted">
        From
        <input
          type="date"
          class={DATE_FIELD}
          min={todayIso()}
          bind:value={start}
        >
      </label>
      <label class="flex flex-col gap-1.5 text-sm text-muted">
        To
        <input
          type="date"
          class={DATE_FIELD}
          min={start || todayIso()}
          bind:value={end}
        >
      </label>
    </div>

    {#if rooms.length > 0}
      <div class="flex flex-col gap-2">
        <span class="text-sm text-muted">What's free</span>
        <Segmented
          ariaLabel="What's free"
          value={offering}
          onchange={(next) => {
            offering = next;
          }}
          options={[
            { value: "whole", label: wholePlaceLabel(listing.type) },
            { value: "rooms", label: "Rooms" },
          ]}
        />
        {#if offering === "rooms"}
          <div
            class="overflow-hidden rounded-2xl bg-surface-muted divide-y divide-border"
          >
            {#each rooms as room (room.id)}
              {@const on = ticked.includes(room.id)}
              <!-- biome-ignore lint/a11y/useSemanticElements: a native checkbox can't hold the two-line label and the drawn tick as one tap target -->
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onclick={() => toggle(room.id)}
                class="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2 text-left"
              >
                <span
                  class="grid h-6 w-6 shrink-0 place-items-center rounded-[0.5rem] text-white {on
                    ? "bg-gradient-accent"
                    : "border-[1.5px] border-faint bg-surface"}"
                >
                  {#if on}
                    <LuCheck width="16" height="16" class="[&>path]:stroke-3" />
                  {/if}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[0.9375rem] font-semibold">
                    {room.name}
                  </span>
                  {#if room.note}
                    <span class="block truncate text-sm text-muted">
                      {room.note}
                    </span>
                  {/if}
                </span>
              </button>
            {/each}
          </div>
          <FieldNote>{caption}</FieldNote>
        {/if}
      </div>
    {/if}

    <label class="flex flex-col gap-1.5 text-sm text-muted">
      Notes for these dates
      <input
        class={DATE_FIELD}
        placeholder="e.g. flexible check-in, I'll be away"
        bind:value={details}
      >
    </label>
    <div class="rounded-2xl bg-surface-muted">
      <Switch
        checked={autoAccept}
        onchange={(next) => {
          autoAccept = next;
        }}
        label="Instant book"
        description="Friends book these dates instantly (first come, first served)."
      />
    </div>
    {#if first}
      <FieldNote tone="danger">
        {clashNote(listing, first.roomId, first.clash, chosen.length > 1)}
      </FieldNote>
    {:else if gone}
      <FieldNote tone="danger">Those dates have already passed.</FieldNote>
    {/if}
    <Button size="lg" onclick={add} disabled={!valid}>Add dates</Button>
  </div>
</Sheet>
