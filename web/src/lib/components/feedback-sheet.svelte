<script lang="ts">
  import { MAX_FEEDBACK, sendFeedback } from "../feedback";
  import Button from "./ui/button.svelte";
  import Sheet from "./ui/sheet.svelte";
  import Textarea from "./ui/textarea.svelte";

  let {
    open,
    onclose,
  }: {
    open: boolean;
    onclose: () => void;
  } = $props();

  let text = $state("");
  let busy = $state(false);
  let sent = $state(false);
  let problem = $state<string | null>(null);

  function close(): void {
    onclose();
    // Only once it is out of sight: resetting while the sheet is still on
    // screen plays the whole form back in the last frame of the dismissal.
    setTimeout(() => {
      text = "";
      sent = false;
      problem = null;
    }, 200);
  }

  async function submit(): Promise<void> {
    busy = true;
    problem = null;
    try {
      await sendFeedback(text);
      sent = true;
    } catch (error) {
      console.warn("feedback", error);
      problem = "That didn't send. Have another go in a moment.";
    } finally {
      busy = false;
    }
  }
</script>

<Sheet {open} onclose={close} title={sent ? "Thank you" : "Send feedback"}>
  {#if sent}
    <p class="text-sm leading-6 text-muted">
      That's with us. We read every one, though we can't always write back — if
      you'd like an answer, say how to reach you.
    </p>
    <Button size="lg" class="mt-5 w-full" onclick={close}>Done</Button>
  {:else}
    <!-- One box and nothing else. Asking someone to pick a category first
         makes them sort their own report before they can write it, and
         sorting them is the reader's job. -->
    <Textarea
      autofocus
      rows={5}
      maxlength={MAX_FEEDBACK}
      bind:value={text}
      placeholder="What's on your mind?"
      aria-label="Your feedback"
    />
    <!-- Where it goes, said before the button rather than after it. kip
         keeps this to itself — nothing forwards it and nothing publishes
         it — which is worth saying outright, because "send feedback"
         elsewhere often means a public tracker. -->
    <p class="mt-3 text-sm leading-5 text-muted">
      This goes to the people who make kip, and nowhere else.
    </p>
    <!-- Mounted whatever happens, at zero height when there is nothing to
         say: a live region announces a CHANGE, so a message that appears
         together with its element is one a screen reader never reads out. -->
    <p
      aria-live="polite"
      class="text-sm leading-5 text-danger {problem ? "mt-3" : ""}"
    >
      {problem}
    </p>
    <Button
      size="lg"
      class="mt-4 w-full"
      disabled={busy || text.trim().length === 0}
      onclick={submit}
    >
      {busy ? "Sending…" : "Send"}
    </Button>
  {/if}
</Sheet>
