<script lang="ts">
  import ReachField from "#lib/components/reach-field.svelte";
  import Busy from "#lib/components/ui/busy.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import Input from "#lib/components/ui/input.svelte";
  import { auth } from "#lib/firebase.ts";
  import {
    codeReady,
    confirmReach,
    EMPTY_REACH,
    type ReachState,
    reachError,
    sendReach,
  } from "#lib/reach.ts";
  import { kip } from "#lib/store.svelte.ts";
  import { validateDisplayName } from "#lib/username.ts";
  import FaGoogle from "~icons/fa6-brands/google";

  // The host has to see a name rather than a blank. No handle, and no account —
  // the ask goes out on this alone, and keeping it is a separate offer made after.
  let {
    host,
    onsent,
    onabandon,
  }: {
    host: string | null;
    onsent: (email: string) => void;
    // Drops the held ask AND carries the reason up. Needed when the visitor
    // turns out to already have an account: the send would otherwise lodge the
    // request from an identity they never asked as — and dropping it unmounts
    // this form, so anything said down here would never be read.
    onabandon: (why: string) => void;
  } = $props();

  let name = $state(kip.user?.displayName ?? "");
  let reach = $state.raw<ReachState>(EMPTY_REACH);
  let recaptcha = $state<HTMLDivElement>();
  let busy = $state(false);
  let error = $state<string | null>(null);

  const invalid = $derived(name ? validateDisplayName(name) : null);
  const reachInvalid = $derived(reachError(reach.raw));
  const problem = $derived(invalid ?? reachInvalid ?? error);

  // The one path that identifies you BEFORE the ask, and the only one that needs
  // no name typed: Google already knows it. The other two send on the name in the
  // field and prove the address or number afterwards.
  async function googleAsk(): Promise<void> {
    busy = true;
    error = null;
    try {
      const { sameAccount } = await kip.signIn();
      // Landing in an account they already had: it has its own name and photo,
      // which must not be overwritten, and the ask must not fly from it as a
      // side effect of adding a way to be reached.
      if (!sameAccount) {
        onabandon(
          "That Google account is already on kip — you're in it now. Ask again and it'll go from this account.",
        );
        return;
      }
      const known = auth().currentUser?.displayName?.trim();
      if (!known) {
        // Nothing to write, so fall back to the field rather than sending an ask
        // that would reach the host as a blank.
        error = "Google didn't share a name. Type one.";
        return;
      }
      await kip.completeOnboarding(known);
    } catch (caught) {
      console.error(caught);
      error = "That didn't work. Try again, or use email.";
    } finally {
      busy = false;
    }
  }

  async function submit(): Promise<void> {
    if (validateDisplayName(name) || reachInvalid) return;
    // Taken now: the profile write below unmounts this form the moment it
    // lands, and the address still has to be handed up after that.
    const handUp = onsent;
    busy = true;
    error = null;
    let emailed: string | null = null;
    // Two failures, two remedies: a bad destination is corrected here, a failed
    // write is retried. One catch blamed the destination for both.
    if (reach.pending) {
      try {
        const { sameAccount } = await confirmReach(reach.pending, reach.code);
        // That number already had a kip account, so they are in it now — with
        // its own name and photo, which the sheet's must not overwrite. The ask
        // stays with the account that made it; only that browser can act on it.
        if (!sameAccount) {
          // Dropping the held ask is what makes this true: otherwise the send
          // fires the moment the new account's profile lands, lodging the
          // request from an identity they never asked as. The message goes UP,
          // because dropping the ask unmounts this form.
          busy = false;
          onabandon(
            "That number is already on kip — you're in it now. Ask again and it'll go from this account.",
          );
          return;
        }
      } catch (caught) {
        console.error(caught);
        error = "Wrong code. Check it, or ask for another.";
        busy = false;
        return;
      }
    } else if (reach.raw) {
      try {
        // Sent FIRST, and an emailed address handed UP before the profile write,
        // which unmounts this form the moment it lands.
        const holder = recaptcha;
        if (!holder) throw new Error("no element for the check to bind to");
        const sent = await sendReach(reach.raw, host ?? "your host", holder);
        if (sent.pending) {
          // A code is on its way; the ask waits for it to be typed.
          reach = { ...reach, pending: sent.pending, sentTo: sent.sentTo };
          busy = false;
          return;
        }
        // NOT handed up yet: doing so swaps the sheet's body and unmounts this
        // form, so a profile write that then failed would have nowhere to say
        // so — under a line claiming the request was already on its way.
        emailed = sent.sentTo;
      } catch (caught) {
        console.error(caught);
        // The profile is unwritten, so the ask has not gone: they can correct
        // it or clear it and send without one.
        error = "Couldn't send that. Check it, or clear it.";
        busy = false;
        return;
      }
    }

    try {
      await kip.completeOnboarding(name.trim());
    } catch (caught) {
      console.error(caught);
      error = "Couldn't save that. Check your connection.";
      busy = false;
      return;
    }
    busy = false;
    if (emailed) handUp(emailed);
  }
</script>

<form
  class="flex flex-col gap-3"
  onsubmit={(event) => {
    event.preventDefault();
    void submit();
  }}
>
  <Input
    autocomplete="name"
    autofocus
    invalid={Boolean(invalid)}
    bind:value={name}
    placeholder="Your name"
    aria-label="Your name"
  />
  <ReachField
    state={reach}
    onchange={(next) => {
      error = null;
      reach = next;
    }}
    bind:host={recaptcha}
    invalid={Boolean(reachInvalid || error)}
    {busy}
  />
  <!-- Two lines reserved so a message swap never resizes the sheet; two
       because the host's name is in the standing copy. -->
  <p
    aria-live="polite"
    class="min-h-10 text-sm leading-5 {problem ? "text-danger" : "text-muted"}"
  >
    {problem ?? `Only so kip can reach you — ${host ?? "they"} never sees it.`}
  </p>
  <Button
    type="submit"
    size="lg"
    disabled={busy ||
      Boolean(validateDisplayName(name) || reachInvalid) ||
      Boolean(reach.pending && !codeReady(reach))}
  >
    {#if busy}
      <Busy label="Send request" />
    {:else}
      Send request
    {/if}
  </Button>

  <!-- Below the button it replaces, because that is what it is: the same ask
       sent a different way. Above it, it read as the preferred route. -->
  <div class="flex items-center gap-3 py-0.5">
    <span class="h-px flex-1 bg-border"></span>
    <span class="text-xs text-faint">or</span>
    <span class="h-px flex-1 bg-border"></span>
  </div>
  <Button
    type="button"
    variant="secondary"
    size="lg"
    disabled={busy}
    onclick={googleAsk}
  >
    <FaGoogle width="1em" height="1em" />
    Request with Google
  </Button>
</form>
