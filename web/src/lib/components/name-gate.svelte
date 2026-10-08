<script lang="ts" module>
  import { PhoneAlreadySet } from "../auth";
  import { auth } from "../firebase";
  import {
    confirmReach,
    EMPTY_REACH,
    type ReachState,
    reachError,
    sendReach,
  } from "../reach";
  import { kip } from "../store.svelte";
  import { validateDisplayName } from "../username";
  import { dialog } from "./dialog.svelte";

  // One sheet that collects whatever is missing — a name, a way to be reached, or
  // both — so no surface has to know which of the two a person lacks. Its state
  // lives at module level because the verbs that open it (`runNamed`,
  // `askIdentity`) are called from anywhere; this component, mounted once in the
  // app layout, draws it.
  //
  // The portal page keeps its own copy of this pattern rather than calling in: its
  // hold reports failures into `debug` and races a timeout, neither of which the
  // in-app verbs need. Two implementations of one WRITTEN-DOWN pattern is fine;
  // two patterns is not.
  let held = $state.raw<{
    action: () => Promise<void>;
    label: string;
    unprompted: boolean;
  } | null>(null);
  let name = $state("");
  let reach = $state.raw<ReachState>(EMPTY_REACH);
  let busy = $state(false);
  let sentTo = $state<string | null>(null);
  let error = $state<string | null>(null);
  // The uid whose unprompted sheet was dismissed.
  let dismissedFor = $state<string | null>(null);

  /**
   * What to say wherever a link turns out to be a sign-in: the sheet here, and
   * the Settings rows that add a way in.
   *
   * It names the ONE thing nobody can fix from inside kip — there is no merge —
   * so it has to end with a choice rather than an apology.
   */
  export function otherAccountAlert(door: string): {
    title: string;
    body: string;
  } {
    return {
      title: "You're in your other account",
      body: `That ${door} was already on kip, so you're signed into it now. kip can't combine two accounts — keep whichever has more history, and delete the other from its own Settings. Whatever you were doing, start it again from here.`,
    };
  }

  function open(
    action: () => Promise<void>,
    label: string,
    unprompted = false,
  ): void {
    name = "";
    reach = EMPTY_REACH;
    sentTo = null;
    error = null;
    held = { action, label, unprompted };
  }

  /**
   * Open the identity sheet with nothing held, for the surfaces that ask
   * someone to finish rather than to do something — the hosting card, the reach
   * card.
   */
  export function askIdentity(): void {
    open(async () => undefined, "Continue");
  }

  /**
   * Run an action that will put your name in front of another person,
   * collecting the name first if there isn't one.
   *
   * Nothing is written until the action runs, so dismissing the sheet abandons
   * it and costs nothing. `label` names the button that finishes it.
   */
  export async function runNamed(
    action: () => Promise<void>,
    label: string,
  ): Promise<void> {
    if (kip.profile?.displayName) {
      await action();
    } else {
      open(action, label);
    }
  }
</script>

<script lang="ts">
  import { page } from "$app/state";
  import FaGoogle from "~icons/fa6-brands/google";
  import { codeReady } from "../reach";
  import ReachField from "./reach-field.svelte";
  import Busy from "./ui/busy.svelte";
  import Button from "./ui/button.svelte";
  import Input from "./ui/input.svelte";
  import Sheet from "./ui/sheet.svelte";

  let recaptcha = $state<HTMLDivElement>();

  // Routes that own their identity flow. Matched on a trailing segment so the
  // base path, when there is one, doesn't change the answer.
  const ownRoute = $derived(/\/(portal|continue)\/?$/.test(page.url.pathname));

  // A brand-new credentialed account — someone continuing on a new device, or a
  // Google arrival carrying no name — has no ask to hold and no friend request
  // to accept, so nothing else would ever open this. Offered once per account:
  // dismissing it sticks, and the next action that needs a name asks again
  // through `runNamed`.
  $effect(() => {
    // Only on the app's own routes. `/portal/` and `/continue/` render their own
    // sheets and reach that state legitimately — a Google sign-in returning no
    // name, a phone sign-in into a profileless account — where this would stack
    // a second sheet over theirs.
    if (ownRoute) return;
    // A teardown deletes the profile as its second-to-last act, so an account
    // on its way out reaches exactly this state — and asked the person who had
    // just left what to call them, over the screen saying they were leaving.
    if (kip.deletion) return;
    if (
      !kip.profileReady ||
      kip.anonymous ||
      kip.profile?.displayName ||
      held
    ) {
      return;
    }
    if (!kip.user || dismissedFor === kip.user.uid) return;
    open(async () => undefined, "Continue", true);
  });

  function dismiss(): void {
    held = null;
    dismissedFor = kip.user?.uid ?? null;
  }

  const needsName = $derived(!kip.profile?.displayName);
  // Credentialed is not the same as reachable: a phone-only account has a way
  // back in and still no address kip can write to, and gating on `anonymous`
  // handed exactly that person a sheet with nothing in it.
  const needsReach = $derived(kip.anonymous || !kip.email);
  const reachInvalid = $derived(reachError(reach.raw));

  // The name can arrive some other way (another tab, a sign-in carrying one),
  // leaving an unprompted sheet with nothing to ask.
  $effect(() => {
    if (held?.unprompted && !needsName && !needsReach && !busy) held = null;
  });

  const invalid = $derived(
    name && needsName ? validateDisplayName(name) : null,
  );
  const problem = $derived(invalid ?? reachInvalid ?? error);
  const message = "Only so kip can reach you. Nobody else sees it.";

  // Google identifies you outright, so there is nothing to prove afterwards and
  // no name to type — it carries one. The held action runs straight after.
  async function googleAttach(): Promise<void> {
    const holding = held;
    if (!holding) return;
    busy = true;
    error = null;
    try {
      const { sameAccount } = await kip.signIn();
      // That Google account already existed and they are in it now. It has its
      // own name and photo, which this sheet's must not overwrite, and the held
      // action belongs to a uid they have just left — so neither runs.
      if (!sameAccount) {
        // Closed, not merely explained. The held action belongs to the uid they
        // just left, and for the account they landed in both fields compute
        // away — leaving a sentence, a dead submit and a divider.
        held = null;
        await dialog.alert(otherAccountAlert("Google account"));
        return;
      }
      const known = auth().currentUser?.displayName?.trim();
      if (needsName && known) await kip.completeOnboarding(known);
      else if (needsName) {
        error = "Google didn't share a name. Type one.";
        return;
      }
      await holding.action();
      held = null;
    } catch (caught) {
      console.error(caught);
      error = "That didn't work. Try again, or use email.";
    } finally {
      busy = false;
    }
  }

  // Two failures with two different remedies — correct an address, or retry a
  // write — so they are caught separately. One catch around both blamed the
  // address for a Firestore outage, sometimes under a note saying that same
  // address had just worked.
  async function submit(): Promise<void> {
    const holding = held;
    if (!holding || reachInvalid || sentTo) return;
    if (needsName && validateDisplayName(name)) return;
    busy = true;
    error = null;
    let emailed: string | null = null;

    // A code that has been sent is waiting to be typed, so this submit finishes
    // that rather than starting again.
    if (reach.pending) {
      try {
        const { sameAccount } = await confirmReach(reach.pending, reach.code);
        // The number belonged to an account they already had, so they are now
        // IN it — and it has its own name and photo. Writing the sheet's over
        // them would be destructive, and the held action belongs to a uid they
        // are no longer, so neither runs.
        if (!sameAccount) {
          busy = false;
          held = null;
          await dialog.alert(otherAccountAlert("number"));
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
        // First, while this sheet is still mounted to report it: writing the
        // profile can close it, and a send awaited afterwards could neither echo
        // the address back nor show a failure to anyone.
        const holder = recaptcha;
        if (!holder) throw new Error("no element for the check to bind to");
        // No host: this reach was collected in Settings or beside an accept,
        // where there is no request for the landing page to name.
        const sent = await sendReach(reach.raw, "", holder);
        // Recorded either way: a code needs the second step, and an emailed
        // link needs the confirmation panel to have something to name.
        reach = { ...reach, pending: sent.pending, sentTo: sent.sentTo };
        if (sent.pending) {
          // The phone door has a second step, so nothing else runs yet.
          busy = false;
          return;
        }
        emailed = sent.sentTo;
      } catch (caught) {
        console.error(caught);
        error =
          caught instanceof PhoneAlreadySet
            ? "This account has a number. Add an email."
            : "Couldn't send that. Check it, or clear it.";
        busy = false;
        return;
      }
    }

    try {
      // Before the action, because the rules read the COMMITTED profile: an edge
      // write is pinned against the name Firestore holds, not the one in hand.
      if (needsName) await kip.completeOnboarding(name.trim());
      await holding.action();
    } catch (caught) {
      console.error(caught);
      error = "Couldn't save that. Check your connection.";
      busy = false;
      return;
    }

    busy = false;
    // An emailed link is still to be opened, so the sheet says so. A code has
    // been typed by now, and a bare name has nothing left to report.
    if (emailed) sentTo = emailed;
    else held = null;
  }
</script>

<Sheet
  open={held !== null}
  onclose={dismiss}
  title={needsName ? "What should we call you?" : "Where can kip reach you?"}
>
  <!-- Once the email is away the form has nothing left to do, and leaving
       it submittable would re-run a held action whose request may already
       be gone — painting an error over a flow that worked. -->
  {#if sentTo}
    <div class="flex flex-col gap-3">
      <p class="text-sm text-muted">
        Check {sentTo} and open the link — that's what keeps your kip if you
        switch phones. Nothing is waiting on it; you can close this.
      </p>
      <Button
        size="lg"
        onclick={() => {
          held = null;
        }}
      >
        Done
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
      {#if needsName}
        <Input
          autocomplete="name"
          autofocus
          invalid={Boolean(invalid)}
          bind:value={name}
          placeholder="Your name"
          aria-label="Your name"
        />
      {/if}

      {#if needsReach}
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
      {/if}

      <!-- Always mounted so the sheet doesn't grow as messages appear;
           one-line budget pinned by `tests/auth-copy.test.ts`. -->
      <p
        aria-live="polite"
        class="min-h-5 text-sm leading-5 {problem
          ? "text-danger"
          : "text-muted"}"
      >
        {problem ?? (needsReach ? message : null)}
      </p>

      <!-- Labelled by the verb it finishes, never "Save" — the button
           completes what they tapped rather than starting something new. -->
      <Button
        type="submit"
        size="lg"
        disabled={busy ||
          Boolean(reachInvalid) ||
          Boolean(reach.pending && !codeReady(reach)) ||
          (needsName && Boolean(validateDisplayName(name)))}
      >
        {#if busy}
          <Busy label={held?.label ?? "Continue"} />
        {:else}
          {held?.label ?? "Continue"}
        {/if}
      </Button>
      <!-- Below the button it replaces: the same thing, done another way.
           Above it, it read as the preferred route. -->
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
        onclick={googleAttach}
      >
        <FaGoogle width="1em" height="1em" />
        Continue with Google
      </Button>
    </form>
  {/if}
</Sheet>
