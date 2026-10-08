<script lang="ts">
  import LuTrash2 from "~icons/lucide/trash-2";
  import { describeCriteria, type SavedSearchHits } from "../search";
  import CountBadge from "./ui/count-badge.svelte";
  import IconButton from "./ui/icon-button.svelte";
  import Row from "./ui/row.svelte";

  // Shared by Home and the filter sheet so the two can't drift into wording a
  // count differently. NOT a whole-row tap target, unlike rows elsewhere:
  // removing one needs its own control, and a button can't nest in a button.
  let {
    hits,
    onopen,
    onremove,
  }: {
    hits: SavedSearchHits;
    onopen: () => void;
    onremove: () => void;
  } = $props();

  const search = $derived(hits.search);
</script>

<Row>
  <button
    type="button"
    onclick={onopen}
    class="flex min-w-0 flex-1 flex-col items-start text-left"
  >
    <span class="w-full truncate font-medium">{search.label}</span>
    <span class="w-full truncate text-sm text-muted">
      {`${hits.places === 1 ? "1 place" : `${hits.places} places`} · ${describeCriteria(search.criteria)}`}
    </span>
  </button>
  <CountBadge count={hits.fresh} />
  <IconButton
    label={`Remove ${search.label}`}
    variant="ghost"
    onclick={onremove}
  >
    <LuTrash2 />
  </IconButton>
</Row>
