<script lang="ts">
  import { page } from "$app/state";
  import LuChevronDown from "~icons/lucide/chevron-down";
  import LuDownload from "~icons/lucide/download";
  import LuInbox from "~icons/lucide/inbox";
  import LuLogOut from "~icons/lucide/log-out";
  import LuMessageSquare from "~icons/lucide/message-square";
  import LuSettings from "~icons/lucide/settings";
  import LuUser from "~icons/lucide/user";
  import { credentialed } from "../feedback";
  import { install } from "../install.svelte";
  import { kip } from "../store.svelte";
  import Avatar from "./avatar.svelte";
  import { dialog } from "./dialog.svelte";
  import FeedbackSheet from "./feedback-sheet.svelte";
  import { useLeave } from "./use-leave.svelte";

  // Only shown once signed in (the app gates on auth). Sign-in itself lives on
  // the WelcomeScreen, so this is the profile menu: your profile, Settings (the
  // dock has no room for it), feedback, installing kip where that is possible,
  // and sign-out.
  const leaver = useLeave();
  let open = $state(false);
  let feedback = $state(false);

  const name = $derived(
    kip.profile?.displayName ?? kip.user?.displayName ?? null,
  );
  const photoURL = $derived(
    kip.profile?.photoURL ?? kip.user?.photoURL ?? null,
  );

  async function doSignOut(): Promise<void> {
    // Leaving is a teardown, not a sign-out, so it shares Settings' flow. The
    // menu stays open meanwhile, so "Leaving…" has somewhere to show until the
    // sign-out unmounts it.
    if (kip.anonymous) {
      await leaver.leave();
      return;
    }
    open = false;
    try {
      await kip.signOut();
    } catch (error) {
      console.error(error);
    }
  }

  async function doInstall(): Promise<void> {
    open = false;
    if (install.ready) {
      await install.prompt();
    } else {
      await dialog.alert({
        title: "Add kip to your Home Screen",
        body: "Tap the Share button in Safari, then Add to Home Screen. kip opens like an app after that, and keeps working when you have no signal.",
      });
    }
  }

  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  $effect(() => {
    if (!open) return;
    const items = (): HTMLElement[] =>
      Array.from(
        menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
    items()[0]?.focus();
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        open = false;
        trigger?.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const all = items();
        const at = all.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        all[(at + step + all.length) % all.length]?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // portal/continue render neither the nav stack nor Settings, so every row
  // would be a dead tap.
  const ownRoute = $derived(/\/(portal|continue)\/?$/.test(page.url.pathname));
  // A nameless ANONYMOUS session gets no menu, and wants none: it holds no
  // profile, no ask and no friends, so leaving would swap one empty anonymous
  // account for another. A nameless account with a credential keeps it —
  // Settings and the exit live only here, and the name sheet can be dismissed.
  const shown = $derived(
    !ownRoute && kip.user !== null && !(kip.anonymous && !name),
  );

  const ITEM =
    "flex h-11 w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[0.9375rem] font-medium text-text hover:bg-surface-hover";
</script>

{#if shown}
  <div class="relative">
    <button
      type="button"
      bind:this={trigger}
      onclick={() => {
        open = !open;
      }}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="You"
      class="flex h-10 items-center gap-0.5 rounded-full pr-1 transition hover:opacity-80"
    >
      <Avatar
        name={name ?? kip.email ?? ""}
        {photoURL}
        class="h-9 w-9 text-sm shadow-soft"
      />
      <LuChevronDown class="shrink-0 text-muted" width="14" height="14" />
      {#if kip.unreadFeedback && !open}
        <span
          class="absolute right-5 top-0.5 size-2 rounded-full bg-accent ring-2 ring-bg"
        ></span>
      {/if}
    </button>
    {#if open}
      <button
        type="button"
        aria-label="Close menu"
        onclick={() => {
          open = false;
        }}
        class="fixed inset-0 z-10 cursor-default"
      ></button>
      <div
        bind:this={menu}
        role="menu"
        aria-label="You"
        class="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl bg-surface p-1.5 shadow-panel"
      >
        <button
          type="button"
          role="menuitem"
          onclick={() => {
            if (kip.user) kip.navigate({ kind: "person", id: kip.user.uid });
            open = false;
          }}
          class={ITEM}
        >
          <LuUser class="text-muted" />
          <span>Your profile</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={() => {
            kip.setView("settings");
            open = false;
          }}
          class={ITEM}
        >
          <LuSettings class="text-muted" />
          <span>Settings</span>
        </button>
        <!-- Only the operator, and only the rules make that true: the
             fragment this opens is guessable, and reaching it without the
             role renders an empty list rather than anything. -->
        {#if kip.admin}
          <button
            type="button"
            role="menuitem"
            onclick={() => {
              kip.setView("feedback");
              open = false;
            }}
            class={ITEM}
          >
            <LuInbox class="text-muted" />
            <span>Feedback inbox</span>
            <!-- A dot, not a count: how MANY are waiting doesn't change what
                 you do about them, and a number would cost reading the whole
                 collection to draw it. -->
            {#if kip.unreadFeedback}
              <span class="ml-auto size-2 shrink-0 rounded-full bg-accent">
                <!-- Read out, where an aria-label on a roleless span is
                     simply dropped. -->
                <span class="sr-only">unread</span>
              </span>
            {/if}
          </button>
        {/if}
        <!-- The rules refuse a report from an identity a page load mints, so
             the row is hidden rather than offered and then denied. What that
             costs is the visitor best placed to report a broken share link,
             which is the trade the credential gate makes everywhere. -->
        {#if credentialed(kip.doors, kip.emailVerified)}
          <button
            type="button"
            role="menuitem"
            onclick={() => {
              feedback = true;
              open = false;
            }}
            class={ITEM}
          >
            <LuMessageSquare class="text-muted" />
            <span>Send feedback</span>
          </button>
        {/if}
        <!-- Only where it can do something. Chrome hands over a prompt and
             this opens it; Safari has no such event, so on an iPhone the row
             says where the control actually is rather than offering a button
             that cannot work. Installed already, neither shows. -->
        {#if install.ready || install.byHand}
          <button
            type="button"
            role="menuitem"
            onclick={doInstall}
            class={ITEM}
          >
            <LuDownload class="text-muted" />
            <span>Install kip</span>
          </button>
        {/if}
        <!-- Everyone gets an exit, and it is the one thing in this menu
             that reads as an action rather than a destination. What differs
             is what it MEANS: with a credential it is an ordinary sign-out;
             without one there is no way back in, so leaving is deletion and
             the word says so before the confirm does. Hiding it from
             unverified sessions left the people it matters most to with no
             way out of the menu at all. -->
        <button
          type="button"
          role="menuitem"
          onclick={doSignOut}
          class="mt-1 flex h-11 w-full items-center gap-3 whitespace-nowrap rounded-xl border-t border-border px-3 text-[0.9375rem] font-semibold text-danger hover:bg-danger-soft"
        >
          <LuLogOut />
          <span>
            {#if kip.anonymous}
              {leaver.leaving ? "Leaving…" : "Leave kip"}
            {:else}
              Sign out
            {/if}
          </span>
        </button>
      </div>
    {/if}
    <FeedbackSheet
      open={feedback}
      onclose={() => {
        feedback = false;
      }}
    />
  </div>
{/if}
