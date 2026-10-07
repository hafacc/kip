<script lang="ts" module>
  // When it arrived, to the minute. Not a relative age: a report read weeks
  // later is the normal case here, and "3 weeks ago" is worse than a date for
  // that.
  function when(at: number): string {
    if (!at) {
      return "just now";
    } else {
      return new Date(at).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
</script>

<script lang="ts">
  import LuRefreshCw from "~icons/lucide/refresh-cw";
  import LuTrash2 from "~icons/lucide/trash-2";
  import {
    deleteFeedback,
    fetchFeedback,
    markFeedbackSeen,
    type Report,
  } from "../feedback";
  import { kip } from "../store.svelte";
  import Group from "./ui/group.svelte";
  import IconButton from "./ui/icon-button.svelte";
  import Section from "./ui/section.svelte";

  // Frozen when the reports land, just before this screen marks them seen:
  // read live, the mark would clear every dot a beat after drawing it, and read
  // on mount it is the cold default on a reload straight into this screen.
  let wasSeenAt = $state<number | null>(null);
  let reports = $state.raw<readonly Report[] | null>(null);
  let problem = $state<string | null>(null);
  let busy = $state(false);
  // Only the newest load may land: the role arriving re-runs it, and a refusal
  // from the load it replaced must not be painted over the reports.
  let newest = 0;

  const uid = $derived(kip.user?.uid);

  async function load(): Promise<void> {
    newest += 1;
    const ticket = newest;
    const reader = uid;
    const admin = kip.admin;
    busy = true;
    problem = null;
    try {
      const fetched = await fetchFeedback();
      if (ticket !== newest) return;
      wasSeenAt = kip.prefs.feedbackSeenAt;
      reports = fetched;
      // Marked seen HERE, not on mount, and only for someone the reports were
      // actually shown to. On mount it fired for anyone who guessed the
      // fragment and was refused every report — clearing their dot for reports
      // they had never been shown, which for the operator meant arriving at a
      // full inbox with nothing marked new. A failed load leaves the mark alone
      // for the same reason: nothing was read.
      if (reader && admin) await markFeedbackSeen(reader);
    } catch (error) {
      console.warn("feedback", error);
      if (ticket === newest) {
        problem = "Couldn't load these. Try again in a moment.";
      }
    } finally {
      if (ticket === newest) busy = false;
    }
  }

  // Again when the account or its role changes: on a reload straight into this
  // screen the role is read off the token after the first load was refused.
  $effect(() => {
    void uid;
    void kip.admin;
    void load();
  });

  // No confirm. A report is one line of somebody's prose that has been read and
  // dealt with, and clearing it is the ordinary end of that — an "are you sure?"
  // on every one of them is a tax on the common case to guard a rare mis-tap.
  async function remove(report: Report): Promise<void> {
    // Dropped locally rather than by reloading: the list is a fetch, and a
    // round trip to learn what this client already knows would blank the screen
    // for the length of it.
    reports = (reports ?? []).filter((held) => held.id !== report.id);
    try {
      await deleteFeedback(report.id);
    } catch (error) {
      console.warn("feedback", error);
      problem = "That one didn't delete. Reload to see where things stand.";
    }
  }
</script>

{#snippet refresh()}
  <IconButton label="Refresh" variant="ghost" onclick={load} disabled={busy}>
    <LuRefreshCw />
  </IconButton>
{/snippet}

<div class="mx-auto flex max-w-2xl flex-col gap-5 pb-8">
  <Section
    title={reports === null
      ? "Reports"
      : `Reports · ${reports.length}${reports.length === 100 ? "+" : ""}`}
    action={refresh}
  >
    {#if problem}
      <p aria-live="polite" class="px-1 text-sm text-danger">{problem}</p>
    {/if}
    {#if reports === null}
      {#if !problem}
        <p class="px-1 text-sm text-muted">Loading…</p>
      {/if}
    {:else if reports.length === 0}
      <p class="px-1 text-sm text-muted">Nothing yet.</p>
    {:else}
      <Group>
        {#each reports as report (report.id)}
          <!-- Not a Row: these are whole paragraphs of someone's prose, and a
               Row is a fixed-height line with one tap target. Nothing here
               navigates, so there is no whole-row target to preserve. -->
          <div class="flex flex-col gap-2 p-4">
            <div class="flex items-center gap-2">
              {#if wasSeenAt === null || report.at > wasSeenAt}
                <span class="size-2 shrink-0 rounded-full bg-accent">
                  <span class="sr-only">unread</span>
                </span>
              {/if}
              <span class="text-xs tabular-nums text-muted">
                {when(report.at)}
              </span>
              <IconButton
                label="Delete"
                variant="danger"
                class="ml-auto"
                onclick={() => remove(report)}
              >
                <LuTrash2 />
              </IconButton>
            </div>
            <!-- Their words, wrapped as typed — a report is often a list of
                 steps, and collapsing the newlines loses the order. -->
            <p class="whitespace-pre-wrap text-[0.9375rem] leading-6 text-text">
              {report.text}
            </p>
          </div>
        {/each}
      </Group>
    {/if}
  </Section>
</div>
