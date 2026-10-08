<script lang="ts" module>
  import type { ConnectRequest } from "../types";

  // How to address an ask you've sent. A handle is the one thing only the
  // by-handle route has, and `toName` is absent on anything written before it
  // existed, so the label falls through what's actually there rather than
  // rendering a bare "@".
  function recipientLabel(request: ConnectRequest): {
    name: string;
    handle: string | null;
  } {
    if (request.toName) {
      return { name: request.toName, handle: request.toUsername || null };
    } else if (request.toUsername) {
      return { name: `@${request.toUsername}`, handle: null };
    } else {
      return { name: "Someone", handle: null };
    }
  }
</script>

<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import LuSearch from "~icons/lucide/search";
  import LuUserPlus from "~icons/lucide/user-plus";
  import { findUserByUsername } from "../friends";
  import { kip } from "../store.svelte";
  import type { Profile } from "../types";
  import { normalizeUsername, validateUsername } from "../username";
  import Avatar from "./avatar.svelte";
  import { runAction } from "./dialog.svelte";
  import RequestCard from "./request-card.svelte";
  import Button from "./ui/button.svelte";
  import FieldNote from "./ui/field-note.svelte";
  import Group from "./ui/group.svelte";
  import Input from "./ui/input.svelte";
  import Row from "./ui/row.svelte";
  import Section from "./ui/section.svelte";

  let username = $state("");
  let status = $state<string | null>(null);
  let busy = $state(false);
  let found = $state.raw<Profile | null>(null);

  // Finding someone is its own step, so you see WHO a handle belongs to before
  // asking them anything. Only possible because a handle that matches means the
  // profile is searchable, and so readable — the name is visible, never indexed:
  // `usernames/{handle}` still maps to a uid and nothing else, and nothing here
  // can be searched by name.
  async function find(): Promise<void> {
    const handle = normalizeUsername(username);
    if (!handle) return;
    const invalid = validateUsername(handle);
    if (invalid) {
      found = null;
      status = invalid;
      return;
    }
    busy = true;
    status = null;
    found = null;
    try {
      const target = await findUserByUsername(handle);
      // A private account reads exactly like one that was never there, which is
      // the point of the discovery gate.
      if (target) found = target;
      else status = "No kip user with that username.";
    } catch (error) {
      console.error(error);
      status = "Something went wrong. Try again.";
    } finally {
      busy = false;
    }
  }

  async function send(target: Profile): Promise<void> {
    busy = true;
    status = null;
    try {
      const result = await kip.sendFriendRequest(target.username);
      const messages: Record<typeof result, string> = {
        sent: `Request sent to ${target.displayName}.`,
        "not-found": "No kip user with that username.",
        "already-friends": "You're already friends.",
        self: "That's you!",
      };
      status = messages[result];
      if (result === "sent") {
        username = "";
        found = null;
      }
    } catch (error) {
      console.error(error);
      status = "Something went wrong. Try again.";
    } finally {
      busy = false;
    }
  }

  // Why there's nothing to send: the store re-checks all of this at send time,
  // but saying so up front beats offering a button that only ever refuses.
  const settled = $derived.by(() => {
    const target = found;
    if (target === null) {
      return null;
    } else if (target.uid === kip.profile?.uid) {
      return "That's you";
    } else if (kip.friends.some((friend) => friend.uid === target.uid)) {
      return "Already friends";
    } else if (
      kip.outgoingRequests.some((request) => request.to === target.uid)
    ) {
      return "Already asked";
    } else {
      return null;
    }
  });
</script>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-7">
  <Section title="Add a friend">
    <div class="flex gap-2">
      <div class="min-w-0 flex-1">
        <Input
          type="text"
          autocapitalize="none"
          spellcheck={false}
          value={username}
          oninput={(event) => {
            username = event.currentTarget.value;
            found = null;
            status = null;
          }}
          onkeydown={(event) => {
            if (event.key === "Enter") void find();
          }}
          placeholder="username"
          aria-label="Username"
          prefix="@"
        />
      </div>
      <Button onclick={find} disabled={busy} class="shrink-0">
        <LuSearch />
        Find
      </Button>
    </div>
    {#if found}
      {@const target = found}
      <Group>
        <Row>
          <Avatar name={target.displayName} photoURL={target.photoURL} />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-[0.9375rem] font-medium">
              {target.displayName || "Someone"}
            </span>
            <span class="truncate text-sm text-muted">@{target.username}</span>
          </span>
          {#if settled}
            <span class="shrink-0 text-sm text-muted">{settled}</span>
          {:else}
            <Button
              onclick={() => send(target)}
              disabled={busy}
              class="shrink-0"
            >
              <LuUserPlus />
              Send
            </Button>
          {/if}
        </Row>
      </Group>
    {/if}
    {#if status}
      <FieldNote>{status}</FieldNote>
    {/if}
  </Section>

  <!-- The same card Home shows, not a compact row of its own. Home caps its
       preview and sends you here for the rest, so this is the one screen that
       lists every ask — and it was the one dropping how they reached you and
       the way to turn that link off. A row can't carry either without a
       second copy of the revoke prompts, and those name consequences. -->
  {#if kip.incomingRequests.length > 0}
    <Section title="Requests">
      {#each kip.incomingRequests as request (request.id)}
        <RequestCard {request} />
      {/each}
    </Section>
  {/if}

  {#if kip.outgoingRequests.length > 0}
    <Section title="Pending">
      <Group>
        {#each kip.outgoingRequests as request (request.id)}
          {@const label = recipientLabel(request)}
          <Row>
            <!-- The raw values, not the label: an initial should be a
                 letter, and the label may be an "@" handle. -->
            <Avatar
              name={request.toName || request.toUsername}
              photoURL={request.toPhotoURL}
            />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-[0.9375rem]">{label.name}</span>
              {#if label.handle}
                <span class="truncate text-sm text-muted">@{label.handle}</span>
              {/if}
            </span>
            <Button
              variant="ghost"
              onclick={() => runAction(() => kip.cancelRequest(request))}
              class="shrink-0"
            >
              Cancel
            </Button>
          </Row>
        {/each}
      </Group>
    </Section>
  {/if}

  <Section
    title={kip.friends.length > 0
      ? `Friends (${kip.friends.length})`
      : "Friends"}
  >
    {#if kip.friends.length === 0}
      <FieldNote
        >No friends yet. Add someone by their username above.</FieldNote
      >
    {:else}
      <Group>
        {#each kip.friends as friend (friend.uid)}
          <Row
            onclick={() => kip.navigate({ kind: "person", id: friend.uid })}
            ariaLabel={friend.displayName}
          >
            <Avatar name={friend.displayName} photoURL={friend.photoURL} />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-[0.9375rem] font-medium">
                {friend.displayName}
              </span>
              {#if friend.username}
                <span class="truncate text-sm text-muted">
                  @{friend.username}
                </span>
              {/if}
            </span>
            <LuChevronRight class="shrink-0 text-faint" />
          </Row>
        {/each}
      </Group>
    {/if}
  </Section>
</div>
