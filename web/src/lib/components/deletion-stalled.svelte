<script lang="ts">
  import { CONTACT_EMAIL } from "../contact";
  import { clearDeletion, requestDeletion } from "../leave";
  import { kip } from "../store.svelte";
  import { DELETION_LABELS, type DeletionRequest } from "../types";
  import Button from "./ui/button.svelte";
  import FieldNote from "./ui/field-note.svelte";

  // Both buttons clear the doc; rules allow that only once `error` is set.
  let { request }: { request: DeletionRequest } = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);

  async function act(again: boolean): Promise<void> {
    const { user } = kip;
    if (!user || busy) return;
    busy = true;
    error = null;
    try {
      await clearDeletion(user.uid);
      if (again) await requestDeletion(user.uid);
    } catch (caught) {
      console.error(caught);
      busy = false;
      error = "Couldn't reach kip just now. Try that again in a minute.";
    }
  }
</script>

<h1 class="text-xl font-bold tracking-[-0.02em]">kip couldn't finish this</h1>
<p class="text-sm text-muted">
  It stopped after {request.attempts}
  {request.attempts === 1 ? "attempt" : "attempts"}{request.phase
    ? `, at ${DELETION_LABELS[request.phase].toLowerCase()}`
    : ""}. What it got through has already happened and doesn't come back —
  cancelled stays, and friends whose lists you have gone from. The rest of your
  account is still here.
</p>
<div class="flex w-full flex-col gap-2">
  <Button size="lg" onclick={() => act(true)} disabled={busy}>
    Try deleting again
  </Button>
  <Button variant="ghost" size="lg" onclick={() => act(false)} disabled={busy}>
    Keep my account for now
  </Button>
</div>
{#if error}
  <FieldNote tone="danger">{error}</FieldNote>
{/if}
<FieldNote>
  Stuck again? Someone will finish it by hand — email
  <a class="font-semibold text-accent-ink" href="mailto:{CONTACT_EMAIL}"
    >{CONTACT_EMAIL}</a
  >.
</FieldNote>
