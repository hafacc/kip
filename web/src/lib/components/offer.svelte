<script lang="ts">
  import LuBed from "~icons/lucide/bed";
  import { listingTypeIcon } from "../listing-icons";
  import type { ListingType } from "../types";

  // What a set of dates offers, as an icon and a name.
  let {
    type,
    room,
    label,
  }: {
    type: ListingType;
    room: boolean;
    label: string;
  } = $props();

  const Icon = $derived(room ? LuBed : listingTypeIcon(type));
</script>

<span class="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold">
  <Icon width="14" height="14" class="shrink-0 text-muted" />
  <span class="truncate">{label}</span>
</span>
