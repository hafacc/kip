<script lang="ts">
  import { kip } from "../store.svelte";
  import Button from "./ui/button.svelte";

  // An unverified account receives nothing at all, and the only explanation would
  // otherwise sit in Settings, which they have no reason to visit.
  let sent = $state(false);
  let failed = $state(false);

  async function resend(): Promise<void> {
    failed = false;
    try {
      await kip.resendVerification();
      sent = true;
    } catch (error) {
      console.error(error);
      failed = true;
    }
  }
</script>

{#if kip.user && !kip.emailVerified && kip.email}
  <div
    class="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card sm:flex-row sm:items-center"
  >
    <p class="min-w-0 flex-1 text-sm text-muted">
      {sent
        ? `Confirmation sent to ${kip.email}. Open it, then reload kip.`
        : `Confirm ${kip.email} to get notified about bookings — until you do, kip can't email you.`}
    </p>
    {#if !sent}
      <Button variant="secondary" onclick={resend} class="shrink-0">
        {failed ? "Try again" : "Confirm email"}
      </Button>
    {/if}
  </div>
{/if}
