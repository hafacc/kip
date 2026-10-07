<script lang="ts">
  import type { ThemeChoice } from "../theme";
  import { theme } from "../theme.svelte";
  import AccountSection from "./account-section.svelte";
  import DiscoverabilitySection from "./discoverability-section.svelte";
  import NotificationsSection from "./notifications-section.svelte";
  import Section from "./ui/section.svelte";
  import Segmented, { type SegmentedOption } from "./ui/segmented.svelte";

  const THEMES: readonly SegmentedOption<ThemeChoice>[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
</script>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-7">
  <AccountSection />

  <DiscoverabilitySection />

  <NotificationsSection />

  <Section title="Appearance">
    <!-- `theme.choice` reads "system" until the stored choice has been read in
         the browser, so the prerendered markup and the first client render
         agree. -->
    <Segmented
      ariaLabel="Theme"
      value={theme.choice}
      onchange={theme.set}
      options={THEMES}
    />
  </Section>
</div>
