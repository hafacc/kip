<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import { kip } from "../store.svelte";
  import { dialog } from "./dialog.svelte";
  import { askIdentity } from "./name-gate.svelte";
  import Button from "./ui/button.svelte";
  import FieldNote from "./ui/field-note.svelte";
  import Group from "./ui/group.svelte";
  import Row from "./ui/row.svelte";
  import Section from "./ui/section.svelte";
  import Switch from "./ui/switch.svelte";

  // The two independent ways someone can reach you: a handle they can search
  // for, and a share link they can open. Neither is on by default — a fresh
  // account is unreachable until you choose to be found. Both switches are
  // mirrors: the handle itself is claimed on your profile, and the link is
  // copied there.
  let busy = $state(false);
  let error = $state<string | null>(null);

  const handle = $derived(kip.profile?.username);

  function openProfile(): void {
    if (kip.user) kip.navigate({ kind: "person", id: kip.user.uid });
  }

  async function toggle(next: boolean): Promise<void> {
    // Becoming findable needs something to be found by, and a handle is claimed
    // on your profile — permanently — so that decision is made there, not here.
    if (next && !handle) {
      openProfile();
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

  // Turning the link off revokes it, which kills every link already sent — the
  // same irreversible act as ShareLink's own "Turn off", so it asks the same way.
  async function togglePortal(next: boolean): Promise<void> {
    if (!next) {
      const sure = await dialog.confirm({
        title: "Turn off the public link?",
        body: "Anyone holding the link loses access. You can make a new one anytime.",
        confirmLabel: "Turn off",
        tone: "danger",
      });
      if (!sure) return;
    }
    error = null;
    busy = true;
    try {
      if (next) await kip.publishUserPortal();
      else await kip.revokeUserPortal();
    } catch (caught) {
      console.error(caught);
      error = "Couldn't save that. Try again.";
    } finally {
      busy = false;
    }
  }

  const findableNote = $derived.by(() => {
    if (kip.anonymous) {
      return "Add an email or a number first — a username is permanent, so it needs an account you can get back into.";
    } else if (handle) {
      return `Anyone who knows @${handle} can send you a friend request.`;
    } else {
      return "Claim a username on your profile first — it's permanent, so you pick it there.";
    }
  });
</script>

{#if kip.profile && kip.user}
  <Section title="Privacy">
    <Group>
      <!-- A username is permanent, so it needs an account someone can get
           back into — the rule refuses the claim outright, and this says why
           rather than letting the switch fail. -->
      <Switch
        checked={kip.profile.searchable}
        onchange={toggle}
        disabled={kip.anonymous}
        label="Findable by username"
        description={findableNote}
      />
      {#if kip.anonymous}
        <div class="px-4 pb-4">
          <Button variant="secondary" onclick={askIdentity}>
            Add email or number
          </Button>
        </div>
      {/if}
    </Group>

    <Group>
      <Switch
        checked={kip.prefs.shareStaysWithFriends}
        onchange={(next) => kip.setShareStays(next)}
        label="Let friends see where I'll be staying"
        description="When on, confirmed stays can appear to your friends. When off, your trips stay private to you and the host."
      />
      <Switch
        checked={kip.prefs.profilePortalId !== null}
        onchange={togglePortal}
        disabled={busy}
        label="Public profile link"
        description="Anyone holding the link can see your places and ask to stay. It doesn't make them a friend."
      />
      {#if kip.prefs.profilePortalId}
        <Row onclick={openProfile} ariaLabel="Copy your profile link">
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-[0.9375rem] font-medium">
              Copy your link
            </span>
            <span class="truncate text-sm text-muted">
              Copy or regenerate it on your profile
            </span>
          </span>
          <LuChevronRight class="shrink-0 text-faint" />
        </Row>
      {/if}
    </Group>

    {#if error}
      <FieldNote tone="danger">{error}</FieldNote>
    {/if}
  </Section>
{/if}
