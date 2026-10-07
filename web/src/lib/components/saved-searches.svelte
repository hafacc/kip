<script lang="ts">
  import LuBookmark from "~icons/lucide/bookmark";
  import {
    describeCriteria,
    hitsForSearches,
    type SavedSearch,
    type SearchCriteria,
    sameCriteria,
  } from "../search";
  import { MAX_SAVED_SEARCHES } from "../searches";
  import { kip } from "../store.svelte";
  import { dialog } from "./dialog.svelte";
  import SavedSearchRow from "./saved-search-row.svelte";
  import Button from "./ui/button.svelte";
  import Group from "./ui/group.svelte";
  import Input from "./ui/input.svelte";
  import Section from "./ui/section.svelte";

  // The bottom of the filter sheet: where a search is composed is where to keep
  // one or pick one up again. Home renders the same list.
  let {
    criteria,
    setCriteria,
    onapply,
  }: {
    criteria: SearchCriteria;
    setCriteria: (criteria: SearchCriteria) => void;
    // Closes the sheet: picking one is asking to run it, not to fill a form in.
    onapply: () => void;
  } = $props();

  let naming = $state(false);
  let label = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let field = $state<HTMLInputElement>();

  $effect(() => {
    if (naming) field?.focus();
  });

  const hits = $derived(
    hitsForSearches(kip.savedSearches, kip.friendListings, kip.friendWindows),
  );
  const suggestion = $derived(describeCriteria(criteria));
  const full = $derived(kip.savedSearches.length >= MAX_SAVED_SEARCHES);
  // Ten slots, so a mis-tap spending one on a copy costs something real.
  const already = $derived(
    kip.savedSearches.find((search) => sameCriteria(search.criteria, criteria)),
  );

  async function save(): Promise<void> {
    busy = true;
    error = null;
    try {
      const result = await kip.saveSearch(label.trim() || suggestion, criteria);
      if (result === "full") {
        error = `You can keep ${MAX_SAVED_SEARCHES} searches — remove one.`;
      } else if (result === "duplicate") {
        // Reachable despite the header swapping to "Saved as …": the filters
        // are above this field, so they can change while it's open.
        error = "You've already saved these filters.";
      } else {
        label = "";
        naming = false;
      }
    } catch (caught) {
      console.error(caught);
      error = "Couldn't save that. Try again.";
    } finally {
      busy = false;
    }
  }

  function apply(search: SavedSearch): void {
    setCriteria(search.criteria);
    kip
      .markSearchSeen(search.id)
      .catch((caught) => console.error("markSearchSeen", caught));
    onapply();
  }

  async function remove(search: SavedSearch): Promise<void> {
    const agreed = await dialog.confirm({
      title: "Remove this search?",
      body: `"${search.label}" will stop appearing on your home screen.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (agreed) await kip.deleteSavedSearch(search.id);
  }

  function onNameKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      naming = false;
    }
  }
</script>

<Section title="Saved searches">
  <!-- Replaces the link rather than adding a line below it — same fact. -->
  {#snippet action()}
    {#if already}
      <span class="min-w-0 truncate text-sm text-muted">
        Saved as "{already.label}"
      </span>
    {:else if !naming && !full}
      <button
        type="button"
        onclick={() => (naming = true)}
        class="shrink-0 text-sm font-semibold text-accent-ink hover:opacity-80"
      >
        Save this one
      </button>
    {/if}
  {/snippet}

  {#if naming}
    <div class="flex flex-col gap-2">
      <Input
        bind:element={field}
        bind:value={label}
        placeholder={suggestion}
        aria-label="Name for this search"
        onkeydown={onNameKey}
      />
      <div class="flex gap-2">
        <Button
          variant="ghost"
          onclick={() => (naming = false)}
          class="shrink-0"
        >
          Cancel
        </Button>
        <Button onclick={save} disabled={busy} class="flex-1">
          <LuBookmark />
          Save
        </Button>
      </div>
      <p class="px-1 text-sm text-muted">
        Named "{label.trim() || suggestion}" unless you change it.
      </p>
    </div>
  {/if}

  {#if error}
    <p class="px-1 text-sm text-danger">{error}</p>
  {/if}
  {#if full && !naming}
    <p class="px-1 text-sm text-muted">
      That's the maximum of {MAX_SAVED_SEARCHES}. Remove one to save another.
    </p>
  {/if}

  {#if hits.length > 0}
    <Group>
      {#each hits as hit (hit.search.id)}
        <SavedSearchRow
          hits={hit}
          onopen={() => apply(hit.search)}
          onremove={() => remove(hit.search)}
        />
      {/each}
    </Group>
  {:else if !naming}
    <p class="px-1 text-sm text-muted">
      Nothing saved yet. Set some filters, then keep them here.
    </p>
  {/if}
</Section>
