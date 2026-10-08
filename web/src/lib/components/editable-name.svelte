<script lang="ts">
  import LuPencil from "~icons/lucide/pencil";
  import { kip } from "../store.svelte";
  import { validateDisplayName } from "../username";
  import FieldNote from "./ui/field-note.svelte";
  import IconButton from "./ui/icon-button.svelte";
  import Input from "./ui/input.svelte";

  // The heading itself becomes the field, so there's no form for a Save button
  // to belong to — Enter or blur commits, Escape reverts.
  let { name }: { name: string } = $props();

  let editing = $state(false);
  let draft = $state("");
  let saved = $state(false);
  let failed = $state(false);
  // Escape has to beat the blur that follows it, or the blur commits the very
  // edit that was just abandoned.
  let reverting = false;

  const invalid = $derived(validateDisplayName(draft));

  // An acknowledgement, not a state — once the field is a heading again there's
  // nothing for it to sit beside.
  $effect(() => {
    if (!saved) return;
    const timer = setTimeout(() => {
      saved = false;
    }, 2500);
    return () => clearTimeout(timer);
  });

  function open(): void {
    // A blur isn't guaranteed to arrive, so a stale flag would swallow the next
    // edit's commit.
    reverting = false;
    draft = kip.profile?.displayName ?? "";
    saved = false;
    failed = false;
    editing = true;
  }

  async function commit(): Promise<void> {
    if (reverting) {
      reverting = false;
      return;
    }
    // Enter commits and removes the field, and the blur that removal fires
    // would otherwise commit the same edit a second time.
    if (!editing) return;
    editing = false;
    const trimmed = draft.trim();
    const { profile } = kip;
    // Nowhere to argue, so an unsaveable name reverts; the field already said why.
    if (
      !profile ||
      validateDisplayName(draft) ||
      trimmed === profile.displayName
    ) {
      return;
    }
    failed = false;
    try {
      await kip.updateDisplayName(trimmed);
      saved = true;
    } catch (error) {
      console.error(error);
      failed = true;
    }
  }
</script>

{#if editing}
  <div class="mx-auto flex w-full max-w-xs flex-col gap-1.5">
    <Input
      autofocus
      aria-label="Display name"
      bind:value={draft}
      onkeydown={(event) => {
        if (event.key === "Enter") {
          void commit();
        } else if (event.key === "Escape") {
          reverting = true;
          editing = false;
        }
      }}
      onblur={commit}
      class="text-center font-bold"
    />
    {#if invalid}
      <FieldNote tone="danger">{invalid}</FieldNote>
    {/if}
  </div>
{:else}
  <div class="flex flex-col items-center gap-1">
    <div class="flex w-full min-w-0 items-center justify-center gap-1">
      <h2 class="min-w-0 truncate text-2xl font-extrabold tracking-[-0.03em]">
        {name}
      </h2>
      <IconButton label="Edit your display name" onclick={open}>
        <LuPencil width="16" height="16" />
      </IconButton>
    </div>
    {#if saved}
      <FieldNote tone="success">Saved.</FieldNote>
    {/if}
    {#if failed}
      <FieldNote tone="danger">Couldn't save that. Try again.</FieldNote>
    {/if}
  </div>
{/if}
