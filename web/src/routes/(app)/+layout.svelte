<script lang="ts">
  import Dialog from "#lib/components/dialog.svelte";
  import EmulatorBadge from "#lib/components/emulator-badge.svelte";
  import NameGate from "#lib/components/name-gate.svelte";
  import { startKip } from "#lib/store.svelte.ts";

  // The app's own routes: `/`, `/portal/` and `/continue/`. The identity sheet
  // gates ITSELF to `/` — the other two carry their own sheets, and its
  // auto-open would stack a second, undismissable one over them.
  let { children } = $props();

  startKip();
</script>

<svelte:head>
  <title>kip</title>
  <meta
    name="description"
    content="Share a spare room or your whole place with friends, for free."
  >
</svelte:head>

{@render children()}
<NameGate />
<EmulatorBadge />
<Dialog />
