<script lang="ts">
  import { kip } from "../store.svelte";
  import AuthMenu from "./auth-menu.svelte";
  import { navItems } from "./nav-items";
  import ThemeButton from "./theme-button.svelte";
  import CountBadge from "./ui/count-badge.svelte";
  import Wordmark from "./wordmark.svelte";

  // Desktop: a sticky top app bar. Wordmark left, nav as inline pill links
  // (active = tonal accent pill), avatar right. Canvas background with a blur so
  // content scrolls under it.
  const items = $derived(navItems());
</script>

<header
  class="sticky top-0 z-30 hidden border-b border-border bg-bg/80 backdrop-blur md:block"
>
  <div class="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
    <button
      type="button"
      onclick={() => kip.setView("home")}
      class="transition hover:opacity-80"
      aria-label="Home"
    >
      <Wordmark />
    </button>
    <nav class="ml-4 flex items-center gap-1">
      {#each items as item (item.view)}
        <button
          type="button"
          onclick={() => kip.setView(item.view)}
          class="flex h-10 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-semibold transition {kip.view ===
          item.view
            ? "bg-accent-soft text-accent-ink"
            : "text-muted hover:bg-surface-hover hover:text-text"}"
        >
          {item.label}
          <CountBadge count={item.badge} />
        </button>
      {/each}
    </nav>
    <div class="ml-auto flex items-center gap-1">
      <ThemeButton />
      <AuthMenu />
    </div>
  </div>
</header>
