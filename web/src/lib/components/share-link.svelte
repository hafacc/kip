<script lang="ts" module>
  import { BASE_PATH } from "../base";

  // How much of the URL's tail is kept whole when the row runs out of room. Two
  // links differ only in their token, so truncating at the end would leave every
  // one of yours reading identically — the last few characters are what tells you
  // which link you're looking at.
  const TOKEN_TAIL = 6;

  // Build the shareable URL. The token lives in the URL fragment (after #), which
  // browsers never send to servers — so the capability isn't leaked via referrers
  // or access logs.
  function portalUrl(portalId: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${BASE_PATH}/portal/#${portalId}`;
  }
</script>

<script lang="ts">
  import LuCheck from "~icons/lucide/check";
  import LuCopy from "~icons/lucide/copy";
  import LuGlobe from "~icons/lucide/globe";
  import LuPowerOff from "~icons/lucide/power-off";
  import LuRotateCw from "~icons/lucide/rotate-cw";
  import { dialog, reportFailure } from "./dialog.svelte";
  import Button from "./ui/button.svelte";
  import IconButton from "./ui/icon-button.svelte";

  // Presentational control to mint / copy / regenerate / revoke a public link.
  // The parent supplies the current token and the create/revoke actions, so the
  // same control drives a listing link and a whole-profile link.
  let {
    portalId,
    createLabel,
    oncreate,
    onrevoke,
  }: {
    portalId: string | null;
    createLabel: string;
    oncreate: () => Promise<void>;
    onrevoke: () => Promise<void>;
  } = $props();

  let busy = $state(false);
  let copied = $state(false);

  async function create(): Promise<void> {
    busy = true;
    try {
      await oncreate();
    } catch (error) {
      reportFailure(error, "Couldn't make the link. Please try again.");
    } finally {
      busy = false;
    }
  }

  async function regenerate(): Promise<void> {
    const ok = await dialog.confirm({
      title: "Regenerate the link?",
      body: "The current link stops working immediately; you'll get a fresh one.",
      confirmLabel: "Regenerate",
      tone: "danger",
    });
    if (ok) await create();
  }

  async function revoke(): Promise<void> {
    const ok = await dialog.confirm({
      title: "Turn off the public link?",
      body: "Anyone holding the link loses access. You can make a new one anytime.",
      confirmLabel: "Turn off",
      tone: "danger",
    });
    if (!ok) return;
    busy = true;
    try {
      await onrevoke();
    } catch (error) {
      reportFailure(error, "Couldn't turn off the link. Please try again.");
    } finally {
      busy = false;
    }
  }

  async function copy(): Promise<void> {
    if (!portalId) return;
    try {
      await navigator.clipboard.writeText(portalUrl(portalId));
    } catch (error) {
      reportFailure(
        error,
        "Couldn't copy the link. Select it and copy it by hand.",
      );
      return;
    }
    copied = true;
    window.setTimeout(() => {
      copied = false;
    }, 1500);
  }

  const url = $derived(portalId ? portalUrl(portalId) : "");
</script>

{#if !portalId}
  <Button variant="secondary" onclick={create} disabled={busy}>
    <LuGlobe />
    {createLabel}
  </Button>
{:else}
  <div
    class="flex items-center gap-1 rounded-2xl bg-surface-muted py-1.5 pl-3.5 pr-1.5"
  >
    <!-- Every control holds its size and the address gives way, so this is
         still one row at 390px — which is also why all three are icons. The
         head truncates against its own overflow while the tail rides beside
         it. -->
    <span class="flex min-w-0 flex-1 items-center text-sm text-muted">
      <span class="truncate">{url.slice(0, -TOKEN_TAIL)}</span>
      <span class="shrink-0">{url.slice(-TOKEN_TAIL)}</span>
    </span>
    <IconButton label={copied ? "Copied" : "Copy link"} onclick={copy}>
      {#if copied}
        <LuCheck width="17" height="17" class="text-success" />
      {:else}
        <LuCopy width="17" height="17" />
      {/if}
    </IconButton>
    <IconButton label="Regenerate link" onclick={regenerate} disabled={busy}>
      <LuRotateCw width="17" height="17" />
    </IconButton>
    <IconButton
      label="Turn off link"
      variant="danger"
      onclick={revoke}
      disabled={busy}
    >
      <LuPowerOff width="17" height="17" />
    </IconButton>
  </div>
{/if}
