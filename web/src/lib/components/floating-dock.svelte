<script lang="ts">
  import { kip } from "../store.svelte";
  import { navItems } from "./nav-items";

  const items = $derived(navItems());
</script>

<nav
  class="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-30 flex items-center justify-around rounded-3xl border border-border bg-surface/90 px-1.5 py-2 shadow-dock backdrop-blur md:hidden"
>
  {#each items as item (item.view)}
    {@const active = kip.view === item.view}
    <button
      type="button"
      onclick={() => kip.setView(item.view)}
      aria-label={item.badge > 0
        ? `${item.label}, ${item.badge} waiting`
        : item.label}
      aria-current={active ? "page" : undefined}
      class="flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-2xl py-1 text-[0.625rem] font-semibold transition {active
        ? "text-accent-ink"
        : "text-faint"}"
    >
      <span
        class="relative grid h-8 w-10 place-items-center rounded-2xl transition-colors {active
          ? "bg-accent-soft"
          : ""}"
      >
        <item.icon width="20" height="20" />
        {#if item.badge > 0}
          <span
            class="bg-gradient-accent absolute -top-0.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.625rem] font-bold leading-none text-white ring-2 ring-surface tabular-nums"
          >
            {item.badge}
          </span>
        {/if}
      </span>
      <span class="leading-none">{item.label}</span>
    </button>
  {/each}
</nav>
