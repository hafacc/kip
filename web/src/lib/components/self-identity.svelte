<script lang="ts">
  import LuCheck from "~icons/lucide/check";
  import LuLoaderCircle from "~icons/lucide/loader-circle";
  import LuX from "~icons/lucide/x";
  import { kip } from "../store.svelte";
  import {
    isUsernameAvailable,
    normalizeUsername,
    validateUsername,
  } from "../username";
  import { dialog } from "./dialog.svelte";
  import Button from "./ui/button.svelte";
  import FieldNote from "./ui/field-note.svelte";
  import Group from "./ui/group.svelte";
  import Input from "./ui/input.svelte";
  import Switch from "./ui/switch.svelte";

  // Self view only; Settings mirrors the switch.
  let claiming = $state(false);
  let username = $state("");
  let checking = $state(false);
  let available = $state<boolean | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const normalized = $derived(normalizeUsername(username));
  const formatError = $derived(username ? validateUsername(username) : null);
  const handle = $derived(kip.profile?.username);

  // Debounced availability check, only once the format is valid.
  $effect(() => {
    if (!username || formatError) {
      available = null;
      checking = false;
      return;
    }
    const wanted = normalized;
    checking = true;
    available = null;
    // An answer about a name that has since been typed over says nothing about
    // the one in the field.
    let live = true;
    const timer = setTimeout(() => {
      isUsernameAvailable(wanted)
        .then((free) => {
          if (live) available = free;
        })
        .catch((caught) => console.error("isUsernameAvailable", caught))
        .finally(() => {
          if (live) checking = false;
        });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  });

  async function toggleSearchable(next: boolean): Promise<void> {
    // The rules refuse `searchable: true` without a handle, so claim one first.
    if (next && !handle) {
      claiming = true;
      return;
    }
    error = null;
    try {
      await kip.setSearchable(next);
    } catch (caught) {
      console.error(caught);
      error = "Couldn't save that. Try again.";
    }
  }

  async function claim(): Promise<void> {
    const wanted = normalized;
    const sure = await dialog.confirm({
      title: `Claim @${wanted}?`,
      body: "Your username is permanent — it can't be changed or given up later.",
      confirmLabel: "Claim",
    });
    if (!sure) return;
    busy = true;
    error = null;
    try {
      await kip.claimUsername(wanted);
      claiming = false;
      username = "";
    } catch (caught) {
      console.error(caught);
      error = "That username was just taken. Try another.";
      available = false;
    } finally {
      busy = false;
    }
  }
</script>

{#snippet verdict()}
  {#if checking}
    <LuLoaderCircle class="animate-spin text-muted" />
  {:else if available === true}
    <LuCheck class="text-success-ink" />
  {:else if available === false}
    <LuX class="text-danger" />
  {/if}
{/snippet}

{#if kip.profile}
  <div class="flex flex-col gap-2">
    <Group>
      <Switch
        checked={kip.profile.searchable}
        onchange={toggleSearchable}
        label="Findable by username"
        description={handle
          ? `Anyone who knows @${handle} can send you a friend request.`
          : "Pick a permanent username so friends can search for you."}
      />

      {#if claiming && !handle}
        <div class="flex flex-col gap-2 px-4 py-3">
          <Input
            autocapitalize="none"
            autocomplete="off"
            spellcheck={false}
            bind:value={username}
            placeholder="yourname"
            aria-label="Username"
            prefix="@"
            suffix={checking || available !== null ? verdict : undefined}
          />
          {#if formatError}
            <FieldNote tone="danger">{formatError}</FieldNote>
          {:else if available === false}
            <FieldNote tone="danger">@{normalized} is taken.</FieldNote>
          {:else if available === true}
            <FieldNote tone="success">@{normalized} is available.</FieldNote>
          {:else}
            <FieldNote>
              Letters, numbers and _, starting with a letter. Permanent once
              claimed.
            </FieldNote>
          {/if}
          <div class="flex justify-end gap-2">
            <Button
              variant="ghost"
              onclick={() => {
                claiming = false;
              }}
            >
              Cancel
            </Button>
            <Button onclick={claim} disabled={busy || available !== true}>
              Claim
            </Button>
          </div>
        </div>
      {/if}
    </Group>

    {#if error}
      <FieldNote tone="danger">{error}</FieldNote>
    {/if}
  </div>
{/if}
