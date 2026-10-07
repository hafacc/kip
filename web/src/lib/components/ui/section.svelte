<script lang="ts">
  import type { Snippet } from "svelte";
  import SectionHeading from "./section-heading.svelte";

  let {
    title,
    action,
    children,
    class: className = "",
  }: {
    title?: string | Snippet;
    action?: Snippet;
    children: Snippet;
    class?: string;
  } = $props();
</script>

<section class="flex flex-col gap-2.5 {className}">
  {#if title}
    <SectionHeading {action}>
      {#if typeof title === "string"}
        {title}
      {:else}
        {@render title()}
      {/if}
    </SectionHeading>
  {/if}
  {@render children()}
</section>
