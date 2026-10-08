<script lang="ts">
  import AuthPanel from "./auth-panel.svelte";
  import SiteFooter from "./site-footer.svelte";
  import ThemeButton from "./theme-button.svelte";
  import Wordmark from "./wordmark.svelte";
</script>

<div class="flex min-h-dvh flex-col">
  <div class="flex justify-end p-4">
    <ThemeButton />
  </div>
  <main
    class="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center"
  >
    <div class="flex flex-col items-center gap-4">
      <Wordmark size="lg" />
      <p class="max-w-xs text-[0.9375rem] text-muted">
        Spare rooms and empty flats — shared between friends, for free.
      </p>
    </div>

    <!-- The card AND the line under it, because that line is also where a
         problem with the field is said — one node, so the two can never
         disagree about how tall they are. -->
    <AuthPanel
      notice="Nothing on kip is public. Places appear when friends share them — or start by listing yours."
    />
  </main>

  <SiteFooter class="px-4 pb-8" />
</div>
