<script lang="ts" module>
  // Its own route rather than a mode of `/portal/`, because that page mints an
  // anonymous account on load — this one must not, since it has no use for a
  // session and every landing would leave a throwaway behind. A skip flag would
  // have been an invariant held by a comment.
  //
  // Two jobs behind one URL, told apart by whether an ID token rides along.
  // ATTACHING (token present) links the address to the anonymous account already
  // asking somewhere else and never signs in here — which is what makes it survive
  // a mail app's throwaway browser. RETURNING (no token) is a real sign-in on this
  // device, for someone coming back with no session at all.

  // One HTTPS round trip to a warm endpoint, with a person watching a page that
  // offers nothing else. Deliberately shorter than the portal's ten seconds, which
  // covers a dependency chain with the SDK's own retries behind it.
  const CONTINUE_TIMEOUT_MS = 6_000;

  // `connectAuthEmulator` points the SDK, and nothing points a raw fetch — so
  // attaching was the one door a local run could not open, while returning (an SDK
  // call) worked. Written out rather than read off a helper for the reason the
  // same pair is written out in `lib/firebase.ts`: Vite replaces `DEV` with a
  // literal, so the whole ternary folds and no localhost address reaches a
  // production bundle.
  function identityToolkit(): string {
    return import.meta.env.DEV && import.meta.env.VITE_AUTH_EMULATOR === "1"
      ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com"
      : "https://identitytoolkit.googleapis.com";
  }

  type Outcome =
    | "working"
    | "done"
    | "expired"
    | "stalled"
    | "taken"
    | "failed";

  // The one refusal that is worth naming, because it is the one nobody can fix
  // from anywhere else: kip cannot merge two accounts, and the ask this link
  // belongs to is held by the account that was asking, not by the address.
  const EMAIL_EXISTS = "EMAIL_EXISTS";

  // What the link carried.
  type Link = {
    // The URL as it arrived. `signInWithEmailLink` parses the code out of it
    // itself, so it has to be kept rather than rebuilt.
    href: string;
    idToken: string;
    email: string;
    oobCode: string;
    host: string | null;
  };

  function readLink(): Link | null {
    // kip's half in the fragment, Firebase's `oobCode` in the query — see
    // `continueUrl` in `lib/auth.ts`.
    const carried = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const email = carried.get("email");
    if (!email) {
      // No fragment. Refused rather than mistaken for a returning link, which
      // would sign them into a second account.
      return null;
    } else {
      return {
        href: window.location.href,
        idToken: carried.get("idToken") ?? "",
        email,
        oobCode: query.get("oobCode") ?? "",
        host: carried.get("host"),
      };
    }
  }
</script>

<script lang="ts">
  import { signInWithEmailLink } from "firebase/auth";
  import { onMount } from "svelte";
  import { tokenExpired } from "#lib/auth.ts";
  import { BASE_PATH } from "#lib/base.ts";
  import Mark from "#lib/components/mark.svelte";
  import ThemeButton from "#lib/components/theme-button.svelte";
  import { auth, firebaseConfig } from "#lib/firebase.ts";

  let outcome = $state<Outcome>("working");
  let mode = $state<"attach" | "return">("attach");
  let host = $state<string | null>(null);

  // Which attempt owns a failure or a stall. Cancelling is a newer attempt
  // starting, not a teardown. A success belongs to every attempt — see
  // `finished`.
  let attempt = 0;
  // Set by the first attempt that succeeds, whichever it was. A retry after a
  // stall resends a code the stalled call may yet spend, so the retry's refusal
  // can arrive before, or after, the success it lost to.
  let finished = false;
  let link: Link | null = null;

  function attach(): void {
    link ??= readLink();
    const held = link;

    if (!held) {
      outcome = "failed";
      return;
    }
    const { idToken, email } = held;
    host = held.host;
    // The discriminator between the two modes. An ID token means an anonymous
    // account is asking for this address to be attached to it; its absence means
    // someone is coming back to an account they already have, and the same call
    // signs them in instead of linking.
    const returning = !idToken;
    mode = returning ? "return" : "attach";

    // Before spending the one-time code, never after: the code outlives our
    // token, so an expired open must not burn one that still works. A returning
    // link carries no token, so only the code's own lifetime applies.
    if (!returning && tokenExpired(idToken)) {
      outcome = "expired";
      return;
    }

    const code = held.oobCode;
    attempt += 1;
    const mine = attempt;
    const live = (): boolean => mine === attempt;
    // A stall is only ever provisional: the call may still be in flight, and if
    // it lands the answer replaces this. Retry is offered on the timeout alone,
    // because a call that ANSWERED has already spent the one-time code — posting
    // it again would report failure for a flow that worked.
    const timer = setTimeout(() => {
      if (live() && !finished) outcome = "stalled";
    }, CONTINUE_TIMEOUT_MS);

    // Two calls, because the modes want different things from the answer.
    // Returning needs a SESSION in this browser, and only the SDK can persist
    // one — the raw REST call hands back tokens with nowhere to put them, so the
    // page would say "you're signed in" over a browser that is not, and every
    // attempt would burn a one-time code. Attaching wants no session at all:
    // passing an idToken makes the endpoint LINK the address to that account
    // rather than mint one, and this browser is disposable.
    const work: Promise<unknown> = returning
      ? signInWithEmailLink(auth(), email, held.href)
      : fetch(
          `${identityToolkit()}/v1/accounts:signInWithEmailLink?key=${firebaseConfig.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, oobCode: code, idToken }),
          },
        ).then(async (response) => {
          if (response.ok) return;
          const refusal = await response
            .json()
            .then((body) => body?.error?.message)
            .catch(() => null);
          throw new Error(refusal === EMAIL_EXISTS ? EMAIL_EXISTS : "refused");
        });

    work
      .then((): Outcome => "done")
      .catch(
        (error: Error): Outcome =>
          error.message === EMAIL_EXISTS ? "taken" : "failed",
      )
      .then((result) => {
        if (finished) return;
        if (result === "done") finished = true;
        else if (!live()) return;
        clearTimeout(timer);
        outcome = result;
      });
  }

  // Once: the one-time code may be spent a single time, and a second run would
  // always find it spent.
  onMount(attach);

  // A new attempt is the cancellation: the old one no longer owns a failure.
  function retry(): void {
    outcome = "working";
    attach();
  }

  // Returning ends in the app itself: the sign-in has happened and this is the
  // device they want it on, so a panel with a button on it is a step between
  // someone and the thing they asked for. Attaching stays where it is — that
  // browser is disposable and the session it belongs to is somewhere else.
  const arriving = $derived(mode === "return" && outcome === "done");
  $effect(() => {
    if (!arriving) return;
    // Replace, not assign: the code in this URL has been spent, so Back must
    // not lead back to it, and the app is entered on a URL that never held it.
    window.location.replace(`${BASE_PATH}/`);
  });

  // Empty when the address was added from inside the app rather than beside an
  // ask, where there is no request to mention at all.
  const who = $derived(host || null);
</script>

<div class="flex min-h-dvh flex-col">
  <div class="flex justify-end p-4">
    <ThemeButton />
  </div>
  <main
    class="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-24 text-center"
  >
    <Mark />

    <!-- Static, and true whichever way the call goes. A script that never
         runs at all has still said the thing that matters — which a timeout
         cannot do, because a timeout is also script. It cannot name the host
         for the same reason: one exported page, and the query is unreadable
         before hydration. -->
    <p class="max-w-xs text-sm text-muted">
      This page only finishes what the email started — nothing you've already
      done depends on it.
    </p>

    <!-- `arriving` holds the page on its quiet state while the browser
         leaves, rather than flashing a panel nobody is meant to read. -->
    {#if outcome === "working" || arriving}
      <!-- Nothing yet. -->
    {:else if outcome === "done"}
      <div class="flex flex-col gap-2">
        <h1 class="text-xl font-bold tracking-[-0.02em]">You're set</h1>
        <p class="max-w-xs text-sm text-muted">
          {who
            ? `Your email is attached, and your request to ${who} is already on its way.`
            : "Your email is attached."}
          Your kip lives in the browser you started from — you can close this
          page and head back there.
        </p>
      </div>
    {:else if outcome === "expired"}
      <div class="flex flex-col gap-2">
        <h1 class="text-xl font-bold tracking-[-0.02em]">This link expired</h1>
        <p class="max-w-xs text-sm text-muted">
          Links like this only work for about an hour. Open the link your friend
          sent you again and kip will offer a fresh one — your request is
          unaffected.
        </p>
      </div>
    {:else if outcome === "taken"}
      <div class="flex flex-col gap-2">
        <h1 class="text-xl font-bold tracking-[-0.02em]">
          That address already has a kip
        </h1>
        <p class="max-w-xs text-sm text-muted">
          It belongs to another account, and kip can't combine two. Open kip
          where you already use that address, or sign back in with it from kip's
          front page. Whatever you asked for still stands where you asked it.
        </p>
      </div>
    {:else if mode === "return"}
      <div class="flex flex-col items-center gap-3">
        <h1 class="text-xl font-bold tracking-[-0.02em]">
          {outcome === "stalled"
            ? "This page can't get through"
            : "That link didn't sign you in"}
        </h1>
        <p class="max-w-xs text-sm text-muted">
          {outcome === "stalled"
            ? "Try again, or open kip and ask for a fresh link."
            : "It may have been used already, or be too old. Open kip and ask for a fresh one."}
        </p>
        <div class="flex gap-2">
          {#if outcome === "stalled"}
            <button
              type="button"
              onclick={retry}
              class="h-11 rounded-full bg-surface px-5 text-sm font-semibold shadow-card"
            >
              Try again
            </button>
          {/if}
          <a
            href="{BASE_PATH}/"
            data-sveltekit-reload
            class="inline-flex h-11 items-center rounded-full bg-gradient-accent px-5 text-sm font-semibold text-white shadow-glow"
          >
            Open kip
          </a>
        </div>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-3">
        <h1 class="text-xl font-bold tracking-[-0.02em]">
          {outcome === "stalled"
            ? "This page can't get through"
            : "That didn't work"}
        </h1>
        <p class="max-w-xs text-sm text-muted">
          {outcome === "stalled"
            ? "Nothing is lost. Try again, or close this and finish from where you started."
            : "This link can't be used. Nothing is lost: whatever you asked for still stands where you asked it."}
        </p>
        <!-- Only after a timeout, where the call may never have run. A call
             that ANSWERED has spent the one-time code, so retrying it fails
             identically every press — the refusal is the answer, not a
             hiccup. -->
        {#if outcome === "stalled"}
          <button
            type="button"
            onclick={retry}
            class="h-11 rounded-full bg-surface px-5 text-sm font-semibold shadow-card"
          >
            Try again
          </button>
        {/if}
      </div>
    {/if}
  </main>
</div>
