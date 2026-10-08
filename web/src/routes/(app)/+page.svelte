<script lang="ts" module>
  import type { View } from "#lib/types.ts";

  const TITLES: Record<View, string> = {
    home: "Home",
    browse: "Browse",
    places: "Places",
    friends: "Friends",
    trips: "Trips",
    settings: "Settings",
    feedback: "Feedback inbox",
  };
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import AuthMenu from "#lib/components/auth-menu.svelte";
  import BookingPage from "#lib/components/booking-page.svelte";
  import BrowseView from "#lib/components/browse-view.svelte";
  import DeletionScreen from "#lib/components/deletion-screen.svelte";
  import FeedbackView from "#lib/components/feedback-view.svelte";
  import FloatingDock from "#lib/components/floating-dock.svelte";
  import FriendsPanel from "#lib/components/friends-panel.svelte";
  import HomeView from "#lib/components/home-view.svelte";
  import ListingFormScreen from "#lib/components/listing-form-screen.svelte";
  import Mark from "#lib/components/mark.svelte";
  import PersonPage from "#lib/components/person-page.svelte";
  import PlacesView from "#lib/components/places-view.svelte";
  import RoomPage from "#lib/components/room-page.svelte";
  import SettingsView from "#lib/components/settings-view.svelte";
  import ThemeButton from "#lib/components/theme-button.svelte";
  import TopBar from "#lib/components/top-bar.svelte";
  import TripsView from "#lib/components/trips-view.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import IconButton from "#lib/components/ui/icon-button.svelte";
  import WelcomeScreen from "#lib/components/welcome-screen.svelte";
  import Wordmark from "#lib/components/wordmark.svelte";
  import { historyScroll, kip, rememberScroll } from "#lib/store.svelte.ts";
  import LuArrowLeft from "~icons/lucide/arrow-left";

  const screen = $derived(kip.screen);

  const title = $derived.by(() => {
    switch (screen.kind) {
      case "tab":
        return TITLES[screen.tab];
      case "room":
        return "Place";
      case "booking":
        return "Booking";
      case "listing-form":
        return screen.id ? "Edit place" : "Add place";
      case "person": {
        if (screen.id === kip.user?.uid) return "You";
        const friend = kip.friends.find(
          (candidate) => candidate.uid === screen.id,
        );
        return friend ? friend.displayName.split(" ")[0] : "Profile";
      }
    }
  });

  let scroller = $state<HTMLElement>();
  // True when the change came from history rather than a tap.
  let restoring = false;
  let lastPopped = kip.popped;

  // The screen's identity, not the object, which is rebuilt on every move.
  // windowId excluded: a slot is a sheet over the room and must not reset scroll.
  const screenKey = $derived(
    `${screen.kind}:${"id" in screen ? screen.id : ""}:${
      screen.kind === "tab" ? screen.tab : ""
    }`,
  );

  // Written continuously, not on the way out: a browser Back gives no chance to
  // save anything first. Keyed on the scroller, which exists only once the
  // gates below have opened.
  $effect(() => {
    const element = scroller;
    if (!element) return;
    let queued = 0;
    const onScroll = (): void => {
      window.clearTimeout(queued);
      queued = window.setTimeout(
        () => rememberScroll(element.scrollTop || window.scrollY),
        150,
      );
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(queued);
      element.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  });

  // Opening a screen starts at its top; returning puts it back where you left it.
  // Instant, never smooth — an animation on something that has only just appeared
  // reads as the page moving under you. Both the scroller and `window`, since
  // which one actually scrolls depends on the viewport.
  $effect(() => {
    // Read only to depend on them: the effect exists to fire when either moves.
    void screenKey;
    const count = kip.popped;
    if (count !== lastPopped) {
      lastPopped = count;
      restoring = true;
    }
    const to = restoring ? historyScroll() : 0;
    restoring = false;
    const element = untrack(() => scroller);
    const apply = (): boolean => {
      element?.scrollTo({ top: to, behavior: "instant" });
      window.scrollTo({ top: to, behavior: "instant" });
      return (element?.scrollTop ?? window.scrollY) >= to;
    };
    if (apply() || to === 0) return;
    // You can't scroll to 900px until something is 900px tall, and a list you're
    // returning to may not have refetched yet — so retry while it fills in.
    // Landing short is the honest failure: too high, never somewhere unvisited.
    const timers = [60, 160, 320, 640].map((delay) =>
      window.setTimeout(apply, delay),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  });

  async function doSignOut(): Promise<void> {
    try {
      await kip.signOut();
    } catch (error) {
      console.error(error);
    }
  }

  const isHome = $derived(screen.kind === "tab" && screen.tab === "home");
</script>

{#snippet splash()}
  <div class="flex min-h-dvh items-center justify-center">
    <Mark />
  </div>
{/snippet}

{#if !kip.authReady}
  {@render splash()}
{:else if !kip.user}
  <!-- Only a session-less visitor is turned away. An anonymous one is a
       participant or about to be: they may hold a name, an ask, even
       friendships, and every rule they meet is blind to how they signed in. -->
  <WelcomeScreen />
{:else if kip.deletion}
  <!-- Ahead of the profile gate, because the teardown DELETES the profile
       partway through and the other reading of a missing one is a missing
       name — which would put someone who asked to leave in front of a form
       asking what to call them, and write it back. `deletionReady` is what
       stops the app being drawn in the beat before the answer arrives. -->
  <DeletionScreen request={kip.deletion} />
{:else if !kip.profileReady || !kip.deletionReady}
  {#if kip.profileUnreachable}
    <!-- In place of the splash once the profile gate has given up — the splash
         claims something is still on its way. Deliberately BEHIND the gate: the
         other reading of an unanswered profile is "no profile", which is a name
         form and an overwrite. Nothing here is terminal: a late answer opens
         the gate and this unmounts itself. -->
    <div
      class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <h1 class="text-xl font-bold tracking-[-0.02em]">
        Can't reach kip right now
      </h1>
      <p class="text-sm text-muted">
        Nothing is lost — this device just can't get through to kip. Check your
        connection and try again.
      </p>
      <div class="flex gap-2">
        <Button variant="secondary" onclick={() => window.location.reload()}>
          Try again
        </Button>
        <!-- A session the server refuses outright — a disabled account, a
             revoked token — lands here too, and reloading hits the same wall.
             Withheld from a session with nothing to sign back in with: there it
             destroys the account outright, dressed as recovery advice. -->
        {#if !kip.anonymous}
          <Button variant="ghost" onclick={doSignOut}>Sign out</Button>
        {/if}
      </div>
    </div>
  {:else}
    {@render splash()}
  {/if}
{:else}
  <div class="flex min-h-dvh flex-col">
    <header class="flex h-14 items-center gap-2 px-4 md:hidden">
      {#if kip.canGoBack}
        <IconButton label="Back" onclick={kip.back} class="-ml-2">
          <LuArrowLeft />
        </IconButton>
      {/if}
      {#if isHome}
        <button
          type="button"
          onclick={() => kip.setView("home")}
          class="transition hover:opacity-80"
          aria-label="Home"
        >
          <Wordmark />
        </button>
      {:else}
        <h1 class="truncate text-lg font-bold tracking-[-0.02em]">{title}</h1>
      {/if}
      <div class="ml-auto flex items-center gap-1">
        <ThemeButton />
        <AuthMenu />
      </div>
    </header>

    <TopBar />

    <main bind:this={scroller} class="flex-1 overflow-y-auto">
      <div
        class="mx-auto w-full max-w-6xl px-4 pt-2 pb-28 md:px-6 md:pt-8 md:pb-14"
      >
        {#if kip.canGoBack}
          <div class="mb-4 hidden items-center gap-2 md:flex">
            <IconButton label="Back" variant="surface" onclick={kip.back}>
              <LuArrowLeft />
            </IconButton>
            <span class="text-sm font-semibold text-muted">{title}</span>
          </div>
        {/if}
        {#if kip.listenersLost}
          <!-- Reload rather than a retry button: the store has already retried
               and given up, and a reload is what re-runs auth from scratch,
               which covers the likeliest causes. A client cannot talk a server
               out of a refusal, so this is disclosure. -->
          <div
            class="mb-4 flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card sm:flex-row sm:items-center"
          >
            <p class="min-w-0 flex-1 text-sm text-muted">
              kip stopped receiving updates, so this screen may be out of date.
            </p>
            <Button
              variant="secondary"
              onclick={() => window.location.reload()}
              class="shrink-0"
            >
              Reload
            </Button>
          </div>
        {/if}
        {#if screen.kind === "person"}
          <PersonPage uid={screen.id} />
        {:else if screen.kind === "room"}
          <RoomPage id={screen.id} />
        {:else if screen.kind === "booking"}
          <BookingPage id={screen.id} />
        {:else if screen.kind === "listing-form"}
          <ListingFormScreen id={screen.id} />
        {:else if screen.tab === "home"}
          <HomeView />
        {:else if screen.tab === "browse"}
          <BrowseView />
        {:else if screen.tab === "places"}
          <PlacesView />
        {:else if screen.tab === "friends"}
          <FriendsPanel />
        {:else if screen.tab === "trips"}
          <TripsView />
        {:else if screen.tab === "settings"}
          <SettingsView />
        {:else}
          <!-- Guessing the fragment renders an empty list rather than a leak:
               every read behind it is refused by the rules for anyone but the
               operator. -->
          <FeedbackView />
        {/if}
      </div>
    </main>

    <FloatingDock />
  </div>
{/if}
