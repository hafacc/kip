<script lang="ts">
  import { BASE_PATH } from "#lib/base.ts";
  import Mark from "#lib/components/mark.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import { page } from "$app/state";

  // Without this, the framework's own fallback is a bare status line with no
  // way back into kip. It stands in for two things: a page that threw, and —
  // through the exported `404.html` — a path that names no page.
  const missing = $derived(page.status === 404);

  $effect(() => {
    if (!missing) console.error(page.error);
  });
</script>

<main
  class="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center"
>
  <Mark />
  {#if missing}
    <h1 class="text-xl font-bold tracking-[-0.02em]">
      This page could not be found.
    </h1>
  {:else}
    <h1 class="text-xl font-bold tracking-[-0.02em]">
      This page couldn't load
    </h1>
    <p class="max-w-xs text-sm text-muted">
      Something went wrong on our side. Reloading usually fixes it.
    </p>
  {/if}
  <div class="flex items-center gap-2">
    {#if !missing}
      <Button onclick={() => window.location.reload()}>Reload</Button>
    {/if}
    <!-- A full load, not a router navigation: the app is one route, so a
         navigation to it from inside it would leave this boundary standing. -->
    <a
      href="{BASE_PATH}/"
      data-sveltekit-reload
      class="inline-flex h-11 items-center rounded-full px-5 text-[0.9375rem] font-semibold text-muted hover:bg-surface-hover hover:text-text"
    >
      Home
    </a>
  </div>
</main>
