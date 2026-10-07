<script lang="ts">
  import type { Snippet } from "svelte";
  import LuX from "~icons/lucide/x";
  import Button from "./ui/button.svelte";
  import IconButton from "./ui/icon-button.svelte";
  import Row from "./ui/row.svelte";

  // One way in. The value is the address it carries once it's set, and the sub-
  // line otherwise says what adding it buys — a Google account already supplies an
  // address, so "no email" would be a lie on the row that most needs to be true.
  let {
    name,
    value,
    note,
    chip,
    busy,
    onadd,
    onremove,
  }: {
    name: string;
    value: string | null;
    note: string;
    chip?: Snippet;
    busy: boolean;
    onadd: () => void;
    // Null when this is the only way in, which must never be removable.
    onremove: (() => void) | null;
  } = $props();
</script>

<Row>
  <span class="flex min-w-0 flex-1 flex-col">
    <span class="truncate text-[0.9375rem] font-medium">{name}</span>
    <!-- A long address wraps and clips at 390px, so it ends in an ellipsis
         instead — the same treatment the profile page gives the same
         string. -->
    <span class="truncate text-sm text-muted">{value ?? note}</span>
  </span>
  {@render chip?.()}
  {#if value === null}
    <Button variant="secondary" onclick={onadd} disabled={busy}>Add</Button>
  {:else if onremove}
    <IconButton
      variant="danger"
      label={`Remove ${name}`}
      onclick={onremove}
      disabled={busy}
    >
      <LuX />
    </IconButton>
  {/if}
</Row>
