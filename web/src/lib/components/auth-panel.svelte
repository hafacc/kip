<script lang="ts">
  import FaGoogle from "~icons/fa6-brands/google";
  import { authErrorMessage } from "../auth";
  import {
    codeReady,
    confirmReach,
    EMPTY_REACH,
    type ReachState,
    reachError,
    sendReach,
  } from "../reach";
  import { kip } from "../store.svelte";
  import ReachField from "./reach-field.svelte";
  import Busy from "./ui/busy.svelte";
  import Button from "./ui/button.svelte";

  // The door — the whole of it, since the same one-time link both makes an account
  // and returns you to one, and the flow never asks which you are. No password: a
  // one-time link or code is fewer things to remember and fewer to lose, and
  // retiring it took the whole reset flow — its own screen, its own failure
  // states, its own careful "if an account exists" notice — out of the product.
  //
  // It offers the SAME three doors as the identity sheet, and that is the point
  // rather than a nicety: an account whose only credential is a phone number could
  // not get back in on a new device while this offered email and Google alone.
  // Anything addable must be returnable.
  //
  // Nothing here says sign in or sign up, and the omission is deliberate: the same
  // link works whether or not kip has met this address, so there is no question to
  // answer and no wrong door to pick. Nor does anything spell out the accepted
  // formats — the placeholder and the "Use phone" link carry them, and the US-only
  // limit is said by `reachError` at the moment it bites.
  //
  // It owns the CARD as well as the form, so that the standing notice under the
  // card and the error that replaces it are one node rather than the same string
  // synchronised into two components. `notice` is what that line says when
  // nothing is wrong.
  let { notice }: { notice: string } = $props();

  let reach = $state.raw<ReachState>(EMPTY_REACH);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let sentTo = $state<string | null>(null);
  let recaptcha = $state<HTMLDivElement>();

  const invalid = $derived(reachError(reach.raw));
  const problem = $derived(invalid ?? error);

  async function run(action: () => Promise<unknown>): Promise<void> {
    busy = true;
    error = null;
    try {
      await action();
    } catch (caught) {
      console.error(caught);
      // Remedy-shaped, matching the other two surfaces: `authErrorMessage`
      // ends at "Something went wrong. Try again." for most codes, which tells
      // nobody what to do differently. Its specific cases still speak.
      const mapped = authErrorMessage(caught);
      error =
        mapped === "Something went wrong. Try again."
          ? "Couldn't send that. Check or change it."
          : mapped;
    } finally {
      busy = false;
    }
  }

  async function submit(): Promise<void> {
    if (invalid || !reach.raw) return;
    // A code already sent is waiting to be typed, so this finishes it.
    if (reach.pending) {
      // Caught apart from the send, and worded like its siblings: routed
      // through `run`, a refused code came back as "couldn't send that" while
      // the code step in front of them was asking for exactly that code.
      busy = true;
      error = null;
      try {
        await confirmReach(reach.pending, reach.code);
      } catch (caught) {
        console.error(caught);
        error = "Wrong code. Check it, or ask for another.";
      } finally {
        busy = false;
      }
      return;
    }
    const holder = recaptcha;
    // Reported, not swallowed — the two sheets throw here and say so, and a
    // dead Continue with no spinner and nothing in the console is the exact
    // divergence these four surfaces exist to have eliminated.
    if (!holder) {
      error = "Couldn't start that. Reload and try again.";
      return;
    }
    await run(async () => {
      const sent = await sendReach(reach.raw, "", holder, "return");
      if (sent.pending) reach = { ...reach, ...sent };
      else sentTo = sent.sentTo;
    });
  }
</script>

<!-- No heading and no label. An email field over a Continue button is
     self-evidently the way in, and "no sign-up, no password" is said by
     the absence of a toggle and a password field rather than by a line
     claiming it. -->
<div class="w-full max-w-sm rounded-3xl bg-surface p-6 text-left shadow-panel">
  <!-- Deliberately identical whether or not kip knows the address — that is
       what preserves the non-enumeration the old reset notice had to spell
       out. -->
  {#if sentTo}
    <div class="flex flex-col gap-3 text-center">
      <p class="text-sm text-muted">
        Open the link we sent to {sentTo} and you're in. It works for about an
        hour.
      </p>
      <Button
        variant="ghost"
        onclick={() => {
          sentTo = null;
        }}
      >
        Use something else
      </Button>
    </div>
  {:else}
    <form
      class="flex flex-col gap-3"
      onsubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <ReachField
        state={reach}
        onchange={(next) => {
          error = null;
          reach = next;
        }}
        bind:host={recaptcha}
        invalid={Boolean(problem)}
        {busy}
      />
      <Button
        type="submit"
        size="lg"
        class="w-full"
        disabled={busy ||
          Boolean(invalid) ||
          (reach.pending ? !codeReady(reach) : !reach.raw)}
      >
        {#if busy}
          <Busy label="Continue" />
        {:else}
          Continue
        {/if}
      </Button>

      <!-- Under the button it stands in for, the same as every other surface
           that offers it — above, it reads as the recommended route, which is
           a claim kip has no reason to make about one door of three. -->
      <div class="flex items-center gap-3 py-0.5">
        <span class="h-px flex-1 bg-border"></span>
        <span class="text-xs text-faint">or</span>
        <span class="h-px flex-1 bg-border"></span>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        class="w-full"
        disabled={busy}
        onclick={() => run(kip.signIn)}
      >
        <FaGoogle width="1em" height="1em" />
        Continue with Google
      </Button>
    </form>
  {/if}
</div>
<!-- Two lines reserved whatever speaks: the page is a centred column, so
     a height change here would shift the door. One line of error is
     pinned by `tests/auth-copy.test.ts`. -->
<p
  aria-live="polite"
  class="max-w-sm min-h-10 text-sm leading-5 {problem
    ? "text-danger"
    : "text-muted"}"
>
  {problem ?? notice}
</p>
