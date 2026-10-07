<script lang="ts" module>
  // Twilio fetches the Privacy and Terms URLs server-side during campaign
  // registration, so every word has to be in the exported HTML for a reader with
  // no JavaScript. Nothing here or in a page built on it may import the store.

  export const link = "font-semibold text-accent-ink break-words";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { BASE_PATH } from "../base";
  import SiteFooter, { type DocRoute } from "./site-footer.svelte";
  import ThemeButton from "./theme-button.svelte";
  import Wordmark from "./wordmark.svelte";

  let {
    title,
    documentTitle,
    description,
    updated,
    route,
    children,
  }: {
    // The page's own heading.
    title: string;
    // What the tab and a search result call it.
    documentTitle: string;
    description: string;
    updated?: string;
    route: DocRoute;
    children: Snippet;
  } = $props();
</script>

<svelte:head>
  <title>{documentTitle}</title>
  <meta name="description" content={description}>
</svelte:head>

<div class="flex min-h-dvh flex-col">
  <header class="flex h-14 items-center gap-3 px-4">
    <a href="{BASE_PATH}/" aria-label="kip home" class="rounded-2xl">
      <Wordmark />
    </a>
    <div class="ml-auto flex items-center gap-1">
      <ThemeButton />
    </div>
  </header>

  <main
    class="mx-auto w-full max-w-2xl px-4 pt-6 pb-24 leading-7 text-text sm:pt-10"
  >
    <h1 class="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
      {title}
    </h1>
    {#if updated}
      <p class="mt-2 text-sm tabular-nums text-muted">
        Last updated: {updated}
      </p>
    {/if}
    {@render children()}
    <SiteFooter current={route} class="mt-16" />
  </main>
</div>
