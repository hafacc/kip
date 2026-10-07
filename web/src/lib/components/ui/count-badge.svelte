<script lang="ts">
  // The gradient count badge used on nav destinations (dock + top bar) — a filled
  // pill with a white number, no dot.
  let { count }: { count: number } = $props();
</script>

{#if count > 0}
  <span
    class="bg-gradient-accent grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full px-1 text-[0.6875rem] font-bold leading-none text-white tabular-nums"
  >
    {count}
  </span>
{/if}
