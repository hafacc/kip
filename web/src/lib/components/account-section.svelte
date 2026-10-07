<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import { requestDeletion } from "../leave";
  import { kip } from "../store.svelte";
  import { dialog } from "./dialog.svelte";
  import DoorsSection from "./doors-section.svelte";
  import Group from "./ui/group.svelte";
  import Row from "./ui/row.svelte";
  import Section from "./ui/section.svelte";
  import { useLeave } from "./use-leave.svelte";

  // Your name and handle are edited on your profile, where they're actually
  // shown; this section is what's left — the ways into the account, and the way
  // out.

  // Shared with the menu, so the two exits cannot say different things or do
  // different amounts of work.
  const leaver = useLeave();
  let leaving = $state(false);

  // Deletion, not sign-out, and it says what other people lose too — a host
  // cancelling stays and a guest cancelling trips is what the first phase of it
  // does, and nobody should discover that after the fact.
  async function deleteAccount(): Promise<void> {
    const { user } = kip;
    if (!user || leaving) return;
    const sure = await dialog.confirm({
      title: "Delete your kip?",
      body: "Your stays and any stays at your places will be cancelled, and your friends will lose you from their lists. Past visits stay as a record, without your name. This can't be undone.",
      confirmLabel: "Delete everything",
      tone: "danger",
    });
    if (!sure) return;
    leaving = true;
    try {
      // Asking is the whole of it: a Cloud Function does the teardown and
      // retries on its own, so this tab is free to be closed. It used to be a
      // chain of writes from here, and closing the tab partway through left an
      // account nothing would ever finish.
      await requestDeletion(user.uid);
    } catch (error) {
      console.error(error);
      leaving = false;
      await dialog.alert({
        title: "Couldn't start that",
        body: "Nothing has been deleted. Check your connection and try again.",
      });
    }
  }
</script>

{#if kip.user}
  {@const uid = kip.user.uid}
  <Section title="Account">
    <Group>
      <Row
        onclick={() => kip.navigate({ kind: "person", id: uid })}
        ariaLabel="Name and photo"
      >
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-[0.9375rem] font-medium">
            Name and photo
          </span>
          <span class="truncate text-sm text-muted">
            Edit them on your profile
          </span>
        </span>
        <LuChevronRight class="shrink-0 text-faint" />
      </Row>
    </Group>

    <DoorsSection />

    <!-- The deliberate exit, and the ONLY one an account with no credential is
         offered. It is destruction rather than sign-out — the uid lives in this
         browser and nowhere else — so it says so, twice, and never sits in a
         casual menu. -->
    <Group>
      {#if kip.anonymous}
        <Row onclick={leaver.leave} ariaLabel="Leave kip">
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-medium text-danger">
              {leaver.leaving ? "Leaving…" : "Leave kip"}
            </span>
            <span class="truncate text-sm text-muted">
              Cancels your stays and removes you from friends' lists
            </span>
          </span>
        </Row>
      {:else}
        <Row onclick={deleteAccount} ariaLabel="Delete your kip">
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-medium text-danger">
              {leaving ? "Deleting…" : "Delete your kip"}
            </span>
            <span class="truncate text-sm text-muted">
              Cancels your stays and removes you from friends' lists
            </span>
          </span>
        </Row>
      {/if}
    </Group>
  </Section>
{/if}
