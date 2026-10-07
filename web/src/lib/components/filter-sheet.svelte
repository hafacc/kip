<script lang="ts" module>
  import type { ListingType } from "../types";
  import type { SegmentedOption } from "./ui/segmented.svelte";

  const RADII = [10, 25, 50, 100, 250] as const;

  const FIELD =
    "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

  const TYPES: readonly SegmentedOption<ListingType | "ANY">[] = [
    { value: "ANY", label: "Any" },
    { value: "ROOM", label: "Room" },
    { value: "FLAT", label: "Flat" },
    { value: "HOUSE", label: "House" },
  ];
</script>

<script lang="ts">
  import LuLocateFixed from "~icons/lucide/locate-fixed";
  import LuMapPin from "~icons/lucide/map-pin";
  import LuX from "~icons/lucide/x";
  import { todayIso } from "../format";
  import { geocodeAddress } from "../geocode";
  import { EMPTY_CRITERIA, type SearchCriteria } from "../search";
  import SavedSearches from "./saved-searches.svelte";
  import Button from "./ui/button.svelte";
  import IconButton from "./ui/icon-button.svelte";
  import Segmented from "./ui/segmented.svelte";
  import Sheet from "./ui/sheet.svelte";

  let {
    open,
    onclose,
    criteria,
    setCriteria,
    resultCount,
  }: {
    open: boolean;
    onclose: () => void;
    criteria: SearchCriteria;
    setCriteria: (criteria: SearchCriteria) => void;
    resultCount: number;
  } = $props();

  let nearText = $state("");
  let locating = $state(false);
  let geoMessage = $state<string | null>(null);

  function update(partial: Partial<SearchCriteria>): void {
    setCriteria({ ...criteria, ...partial });
  }

  async function findLocation(): Promise<void> {
    const queryText = nearText.trim();
    if (!queryText) return;
    locating = true;
    geoMessage = null;
    const hit = await geocodeAddress(queryText);
    locating = false;
    if (!hit) {
      geoMessage = "Couldn't find that place — try a city or postcode.";
      return;
    }
    update({ near: { lat: hit.lat, lng: hit.lng }, nearLabel: hit.label });
    nearText = "";
  }

  function locateMe(): void {
    if (!navigator.geolocation) {
      geoMessage = "Location isn't available in this browser.";
      return;
    }
    locating = true;
    geoMessage = null;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locating = false;
        update({
          near: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          nearLabel: "Your location",
        });
        nearText = "";
      },
      (error) => {
        locating = false;
        geoMessage = "Couldn't get your location.";
        console.error(error);
      },
      { timeout: 10000 },
    );
  }

  function clearLocation(): void {
    update({ near: null, nearLabel: null });
    nearText = "";
    geoMessage = null;
  }

  function onLocationKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      findLocation();
    }
  }
</script>

<Sheet {open} {onclose} title="Filters">
  <div class="flex flex-col gap-5">
    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1.5 text-sm text-muted">
        From
        <input
          type="date"
          class={FIELD}
          min={todayIso()}
          value={criteria.start ?? ""}
          oninput={(event) =>
            update({ start: event.currentTarget.value || null })}
        >
      </label>
      <label class="flex flex-col gap-1.5 text-sm text-muted">
        To
        <input
          type="date"
          class={FIELD}
          min={criteria.start ?? todayIso()}
          value={criteria.end ?? ""}
          oninput={(event) =>
            update({ end: event.currentTarget.value || null })}
        >
      </label>
    </div>

    <div class="flex flex-col gap-1.5">
      <span class="text-sm text-muted">Type</span>
      <Segmented
        ariaLabel="Place type"
        value={criteria.type ?? "ANY"}
        onchange={(value) => update({ type: value === "ANY" ? null : value })}
        options={TYPES}
      />
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-sm text-muted">Location</span>
      {#if criteria.near}
        <div class="flex items-center gap-2">
          <span class="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            <LuMapPin class="shrink-0 text-accent-ink" />
            <span class="truncate">{criteria.nearLabel ?? "Nearby"}</span>
          </span>
          <select
            class="h-11 shrink-0 rounded-xl border border-border bg-surface px-2 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            aria-label="Distance"
            value={criteria.radiusKm}
            onchange={(event) =>
              update({ radiusKm: Number(event.currentTarget.value) })}
          >
            {#each RADII as km (km)}
              <option value={km}>{km} km</option>
            {/each}
          </select>
          <IconButton
            label="Clear location"
            variant="danger"
            onclick={clearLocation}
          >
            <LuX />
          </IconButton>
        </div>
      {:else}
        <input
          class={FIELD}
          placeholder="City, address, or area"
          aria-label="Location"
          bind:value={nearText}
          onkeydown={onLocationKey}
        >
        <div class="flex gap-2">
          <Button
            variant="secondary"
            onclick={findLocation}
            disabled={!nearText.trim() || locating}
            class="flex-1"
          >
            <LuMapPin />
            Find
          </Button>
          <Button
            variant="secondary"
            onclick={locateMe}
            disabled={locating}
            class="flex-1"
          >
            <LuLocateFixed />
            My location
          </Button>
        </div>
      {/if}
      {#if geoMessage}
        <p class="text-sm text-danger">{geoMessage}</p>
      {/if}
    </div>

    <div class="flex items-center gap-3 pt-1">
      <Button
        variant="ghost"
        onclick={() => setCriteria(EMPTY_CRITERIA)}
        class="shrink-0"
      >
        Clear all
      </Button>
      <Button size="lg" onclick={onclose} class="flex-1">
        {resultCount === 1 ? "Show 1 place" : `Show ${resultCount} places`}
      </Button>
    </div>

    <!-- Below the footer, not above it: picking a saved search is the rarer
         reason to be here, and the primary action must stay reachable
         without scrolling past a list. -->
    <SavedSearches {criteria} {setCriteria} onapply={onclose} />
  </div>
</Sheet>
