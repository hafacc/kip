<script lang="ts" module>
  const PAGES = [
    { href: "/about/", label: "About" },
    { href: "/privacy/", label: "Privacy" },
    { href: "/terms/", label: "Terms" },
    { href: "/help/", label: "Help" },
  ] as const;

  export type DocRoute = (typeof PAGES)[number]["href"];
</script>

<script lang="ts">
  import { BASE_PATH } from "../base";
  import { REPO_URL } from "../contact";

  let {
    current,
    class: className = "",
  }: {
    current?: DocRoute;
    class?: string;
  } = $props();
</script>

<footer
  class="flex flex-wrap items-center justify-center gap-x-2 text-sm text-faint {className}"
>
  {#each PAGES as { href, label }, index (href)}
    {#if index > 0}
      <span aria-hidden="true">·</span>
    {/if}
    {#if href === current}
      <span aria-current="page">{label}</span>
    {:else}
      <a href="{BASE_PATH}{href}" class="hover:text-muted">{label}</a>
    {/if}
  {/each}
  <span aria-hidden="true">·</span>
  <a href={REPO_URL} class="hover:text-muted">Source</a>
</footer>
