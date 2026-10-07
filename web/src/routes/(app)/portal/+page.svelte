<script lang="ts" module>
  type LoadState = "loading" | "ready" | "missing" | "unreachable";

  // A read that never reached the server is not an answer about the link. Offline
  // the two are indistinguishable to the code and opposite to the reader: one says
  // their friend revoked it, the other that they are in a tunnel. Same distinction
  // the profile gate draws, for the same reason — a cached absence proves nothing.
  function unreachable(error: unknown): boolean {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return true;
    } else {
      const code = (error as { code?: string })?.code ?? "";
      return (
        code === "unavailable" ||
        code === "auth/network-request-failed" ||
        code === "deadline-exceeded"
      );
    }
  }

  // The only timeout in the flow: this page is outside the app's gate, so the
  // Unreachable screen never renders here. A stall nobody else names ends here.
  const ASK_TIMEOUT_MS = 10_000;
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { BASE_PATH } from "#lib/base.ts";
  import {
    fetchMyBookingsWith,
    requestStayViaPortal,
    SlotGone,
  } from "#lib/bookings.ts";
  import Mark from "#lib/components/mark.svelte";
  import SiteFooter from "#lib/components/site-footer.svelte";
  import ThemeButton from "#lib/components/theme-button.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import Sheet from "#lib/components/ui/sheet.svelte";
  import Wordmark from "#lib/components/wordmark.svelte";
  import {
    clientState,
    type DebugDetail,
    recordDebugEvent,
  } from "#lib/debug.ts";
  import { errorCode } from "#lib/firebase.ts";
  import { areFriends } from "#lib/friends.ts";
  import { claimGrant, fetchPortalPage } from "#lib/portals.ts";
  import {
    fetchMyConnectRequest,
    sendPortalConnectRequest,
  } from "#lib/requests.ts";
  import { kip } from "#lib/store.svelte.ts";
  import type {
    Portal,
    PortalContent,
    PortalWindow,
    Profile,
  } from "#lib/types.ts";
  import {
    type Ask,
    type Connect,
    type Failure,
    FRIEND_ONLY,
    type Standing,
  } from "./ask.ts";
  import NameForm from "./name-form.svelte";
  import PortalView from "./portal-view.svelte";

  // The one screen outside the auth gate. Nothing here needs an account: browsing
  // needs no identity at all, and asking needs only a name. For a visitor with no
  // name yet every button is live from the first paint; a named one's connect
  // control waits on the standing lookup. Tapping holds the ask and asks who they
  // are in place.
  let content = $state.raw<PortalContent | null>(null);
  // The portal doc on its own, a round trip ahead of `content`. A SLOT link
  // carries its room here too, but only `content` has the DATES, and a room
  // rendered without them claims "No open dates right now" — so nothing below
  // the host block is drawn from this. Superseded the moment `content` lands.
  let owner = $state.raw<Portal | null>(null);
  let load = $state<LoadState>("loading");
  let standing = $state.raw<Standing | null>(null);
  let busy = $state<string | null>(null);
  let ask = $state.raw<Ask | null>(null);
  // Carries the ask it came from, so trying again is one tap rather than a hunt
  // back to a button that may now be scrolled off or behind the error.
  let failed = $state.raw<{ reason: Failure; ask: Ask } | null>(null);
  // Held here rather than in the form: the form unmounts the moment the profile
  // lands, and these are the two things that still have something to say
  // afterwards.
  let sentTo = $state<string | null>(null);
  let notice = $state<string | null>(null);
  // The rooms didn't load, but the host block did — a different failure from a
  // link that never resolved, and it must not overwrite what's already on screen.
  let roomsFailed = $state(false);
  // Everything that needs the ROOMS reads `content`; everything that needs only
  // the host reads this, so the header can render while the rest is still
  // arriving.
  const portal = $derived(content?.portal ?? owner);

  // Null until the fragment has been read, which cannot happen while the page
  // is prerendered. Async work that outlives a fragment change compares against
  // this before landing, so it never paints the next link's page.
  let token = $state<string | null>(null);

  // The hashchange listener matters because pasting a different link changes
  // only the fragment, which the browser treats as the same document — no reload.
  onMount(() => {
    const read = (): void => {
      token = window.location.hash.slice(1);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  });

  // Anonymous sign-in gives the live reads an identity to hang a grant on.
  $effect(() => {
    const link = token;
    if (link === null) return;
    if (!link) {
      load = "missing";
      return;
    }
    let live = true;
    let painted = false;
    untrack(() => {
      load = "loading";
      content = null;
      owner = null;
      roomsFailed = false;
      standing = null;
      // A held ask names a portal that is about to stop existing, and the send
      // would refuse it forever without saying so.
      ask = null;
      failed = null;
      // Handed over in flight: the portal doc needs no identity to read.
      fetchPortalPage(link, kip.ensureAnonymous(), (found) => {
        if (!live) return;
        painted = true;
        owner = found;
        load = "ready";
      })
        .then((found) => {
          if (!live) return;
          content = found;
          load = found ? "ready" : "missing";
        })
        .catch((error: unknown) => {
          console.error(error);
          if (!live) return;
          // Once the host block is up, the link demonstrably resolved, so
          // replacing the page with "this link isn't active" would be a lie
          // about what went wrong — and a jarring one, since they can already
          // see it did.
          if (painted) roomsFailed = true;
          else load = unreachable(error) ? "unreachable" : "missing";
        });
    });
    return () => {
      live = false;
    };
  });

  // Both keyed on a uid rather than an object. `portal` is a DIFFERENT object
  // each time it improves — first the portal doc, then the fuller one — and
  // would otherwise run the lookup, and its three reads, twice on every load.
  const hostId = $derived(portal?.ownerId ?? null);
  const visitorId = $derived(kip.user?.uid ?? null);

  // Reported separately, so neither ask can hide the other's affordance.
  //
  // Runs for an anonymous visitor too, and must: they are the ones who ask.
  // Someone returning to their own pending ask hours later is signed in as the
  // same account (Firebase persists to IndexedDB), so this is what recognizes
  // them instead of offering an ask they already made.
  $effect(() => {
    const visitor = visitorId;
    const host = hostId;
    if (!visitor || !host) return;
    let live = true;
    Promise.all([
      fetchMyBookingsWith(visitor, host),
      fetchMyConnectRequest(visitor, host),
      areFriends(visitor, host),
    ])
      .then(([bookings, request, friend]) => {
        if (!live) return;
        const current = bookings.filter(
          (booking) => booking.status !== "CANCELLED",
        );
        standing = {
          windowIds: current.map((booking) => booking.windowId),
          confirmed: current.some((booking) => booking.status === "CONFIRMED"),
          connectPending: request !== null,
          friend,
        };
      })
      // Offer the ask rather than wait for ever: a redundant ask is refused
      // or harmless, while `unknown` has no control on it at all.
      .catch((error: unknown) => {
        console.error(error);
        if (!live) return;
        standing = {
          windowIds: [],
          confirmed: false,
          connectPending: false,
          friend: false,
        };
      });
    return () => {
      live = false;
    };
  });

  // These failures throw nothing, so the state that decided them is the whole
  // report. Every field is read when this is CALLED — from the timer, or from
  // the refused write — so it describes the moment of failure and not the tap,
  // which for the timer is up to ten seconds earlier. Untracked because one
  // caller is an effect, which must not re-run on what is only being reported.
  function report(reason: Failure, extra: DebugDetail = {}): void {
    untrack(() => {
      recordDebugEvent("portal-ask", {
        reason,
        anonymous: kip.anonymous,
        profileReady: kip.profileReady,
        profileUnreachable: kip.profileUnreachable,
        hasProfile: kip.profile !== null,
        hasName: Boolean(kip.profile?.displayName),
        hostLoaded: portal !== null,
        roomsLoaded: content !== null,
        ...clientState(),
        ...extra,
      });
    });
  }

  // The name comes off the kip profile, never the Auth user's email — that
  // would write their address into a document the host can read.
  function send(held: Ask, link: Portal, uid: string, profile: Profile): void {
    const { listingId, window: slot } = held;
    busy = slot?.id ?? FRIEND_ONLY;
    failed = null;
    const sender = {
      uid,
      username: profile.username,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
    };

    // Re-claimed as whoever we are NOW: signing in to an existing account mints
    // a fresh uid, orphaning the grant written on load.
    claimGrant(link.id, uid)
      // Asking for dates IS a booking — the same document a friend creates.
      .then(() =>
        listingId && slot
          ? requestStayViaPortal(
              uid,
              link.ownerId,
              listingId,
              slot,
              // The rules check a room link on its own, and only when told.
              link.scope === "ROOM" ? "ROOM" : null,
            )
          : sendPortalConnectRequest(link, sender),
      )
      // Never confirmed: a link is not friendship, whatever the slot allows.
      .then(() => {
        const current = standing;
        standing = {
          windowIds: slot
            ? [...(current?.windowIds ?? []), slot.id]
            : (current?.windowIds ?? []),
          confirmed: current?.confirmed ?? false,
          connectPending: slot ? (current?.connectPending ?? false) : true,
          // Asking is only ever offered to someone who isn't one yet, so this
          // settles `unknown` for a visitor whose lookup never ran at all.
          friend: current?.friend ?? false,
        };
      })
      .catch((error: unknown) => {
        console.error(error);
        // A slot that moved is not a refusal — it is news, and the visitor is
        // owed which news. Everything else reaching here really was refused.
        const gone = error instanceof SlotGone ? error.why : null;
        report(gone ?? "refused", { code: errorCode(error) });
        failed = { reason: gone ?? "refused", ask: held };
        // The dates on screen are the ones that just proved stale.
        if (gone) {
          fetchPortalPage(link.id, kip.ensureAnonymous())
            .then((found) => {
              if (found && found.portal.id === token) content = found;
            })
            .catch((refetch: unknown) => console.error(refetch));
        }
      })
      .finally(() => {
        busy = null;
      });
  }

  // The ask is cleared before anything is sent, so a later change to what this
  // watches can't fire a second request.
  $effect(() => {
    const held = ask;
    const link = portal;
    const uid = visitorId;
    const profile = kip.profile;
    const ready = kip.profileReady;
    if (!held || !link || !uid || !ready || !profile?.displayName) return;
    untrack(() => {
      ask = null;
      send(held, link, uid, profile);
    });
  });

  // A name is what an ask needs — not an account. Someone who has never typed
  // one has nothing to look up either, so their ask is live from the first
  // paint, which is the visitor this whole page exists for.
  const named = $derived(Boolean(kip.profile?.displayName));
  const isOwner = $derived(visitorId !== null && visitorId === hostId);

  function connectState(): Connect {
    if (isOwner) {
      return "none";
    } else if (!named) {
      return "ask";
    } else if (standing === null) {
      return "unknown";
    } else if (standing.friend) {
      return "none";
    } else {
      return standing.connectPending ? "sent" : "ask";
    }
  }
  const connect = $derived(connectState());

  const needsName = $derived(ask !== null && kip.profileReady && !named);
  // A held ask spins the control it came from, so a tap is never a no-op. The
  // sheet covers "no name"; it does not cover the gap between the page loading
  // and the profile answering, where a tap used to show nothing at all.
  const holding = $derived(
    ask === null ? busy : (ask.window?.id ?? FRIEND_ONLY),
  );

  // An ask held with NEITHER sheet up is waiting on the profile. Deliberately
  // not extended to the send: that write is Firestore's, which queues offline
  // and lands on reconnect.
  $effect(() => {
    const held = ask;
    if (held === null || needsName) return;
    const give = (): void => {
      report("stalled");
      ask = null;
      failed = { reason: "stalled", ask: held };
    };
    if (kip.profileUnreachable) {
      untrack(give);
      return;
    }
    const timer = setTimeout(give, ASK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  });

  function retry(): void {
    if (!failed) return;
    notice = null;
    ask = failed.ask;
    failed = null;
  }

  function hold(listingId: string | null, slot: PortalWindow | null): void {
    // Both clear: a fresh ask must not sit under the explanation of why the
    // last one didn't go.
    notice = null;
    failed = null;
    ask = { listingId, window: slot };
  }
</script>

<div class="flex min-h-dvh flex-col">
  <header class="flex h-14 items-center gap-3 px-4">
    <!-- A full page load, not a router push — this page sits outside the nav
         stack. -->
    <a
      href="{BASE_PATH}/"
      data-sveltekit-reload
      aria-label="kip home"
      class="rounded-2xl"
    >
      <Wordmark />
    </a>
    <div class="ml-auto flex items-center gap-1">
      <ThemeButton />
    </div>
  </header>

  <main class="flex-1 overflow-y-auto p-4">
    {#if load === "loading"}
      <!-- The same mark the app boots behind. -->
      <div class="flex min-h-[60vh] items-center justify-center">
        <Mark />
      </div>
    {:else if load === "unreachable"}
      <div class="mx-auto max-w-md pt-12 text-center">
        <h1 class="text-xl font-bold tracking-[-0.02em]">
          Can't reach kip right now
        </h1>
        <p class="mt-2 text-sm text-muted">
          The link is probably fine — kip just can't check it from here. Try
          again once you're back online.
        </p>
      </div>
    {:else if load === "missing"}
      <div class="mx-auto max-w-md pt-12 text-center">
        <h1 class="text-xl font-bold tracking-[-0.02em]">
          This link isn't active
        </h1>
        <p class="mt-2 text-sm text-muted">
          It may have been turned off or regenerated. Ask whoever shared it for
          a fresh link.
        </p>
      </div>
    {:else if portal}
      <PortalView
        {portal}
        windows={content?.windows ?? {}}
        roomsPending={content === null}
        {roomsFailed}
        {isOwner}
        {connect}
        {standing}
        busy={holding}
        {notice}
        failed={failed?.reason ?? null}
        onretry={retry}
        onask={hold}
      />
    {/if}

    <SiteFooter class="mx-auto mt-12 max-w-2xl" />
  </main>

  <!-- Closing it abandons the held ask, which is the only way out and needs
       no separate control.

       Held open past the profile write when an address was given: writing it
       flips `named` and the ask flies, but a one-time send has no other
       guard against a typo than the address read back. -->
  <Sheet
    open={needsName || sentTo !== null}
    onclose={() => {
      ask = null;
      sentTo = null;
    }}
    title={sentTo ? "Check your email" : "What should we call you?"}
  >
    {#if sentTo}
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted">
          Your request is already on its way. Open the link at {sentTo} and your
          kip will work on any device — nothing here is waiting on it.
        </p>
        <Button
          size="lg"
          onclick={() => {
            sentTo = null;
          }}
        >
          Done
        </Button>
      </div>
    {:else}
      <NameForm
        host={portal?.ownerName.split(" ")[0] ?? null}
        onsent={(email) => {
          sentTo = email;
        }}
        onabandon={(why) => {
          ask = null;
          notice = why;
        }}
      />
    {/if}
  </Sheet>
</div>
