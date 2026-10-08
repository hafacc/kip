<script lang="ts">
  import LuMonitor from "~icons/lucide/monitor";
  import LuMoon from "~icons/lucide/moon";
  import LuSun from "~icons/lucide/sun";
  import { nextThemeChoice, themeLabel } from "../theme";
  import { theme } from "../theme.svelte";
  import IconButton from "./ui/icon-button.svelte";

  // `theme.choice` reads "system" until the stored choice has been read in the
  // browser, so the prerendered markup and the first client render agree.
  const title = $derived(`${themeLabel(theme.choice)} theme`);
</script>

<IconButton
  label={title}
  onclick={() => theme.set(nextThemeChoice(theme.choice))}
>
  {#if theme.choice === "dark"}
    <LuMoon />
  {:else if theme.choice === "light"}
    <LuSun />
  {:else}
    <LuMonitor />
  {/if}
</IconButton>
