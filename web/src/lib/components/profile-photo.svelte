<script lang="ts" module>
  // Their own surface and shadow, because what's behind them is a photo.
  const PHOTO_CONTROL =
    "grid h-7 w-7 place-items-center rounded-full bg-surface text-text shadow-card transition hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50";
</script>

<script lang="ts">
  import LuCamera from "~icons/lucide/camera";
  import LuLoaderCircle from "~icons/lucide/loader-circle";
  import LuX from "~icons/lucide/x";
  import { PhotoEncodeError } from "../photos";
  import { kip } from "../store.svelte";
  import Avatar from "./avatar.svelte";
  import FieldNote from "./ui/field-note.svelte";

  // The photo IS the control's label, so the controls sit on it. Removing falls
  // back to the provider's photo, so it only appears when wearing your own.
  let {
    name,
    photoURL,
  }: {
    name: string;
    photoURL: string | null;
  } = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement>();

  function failure(caught: unknown, file: Blob | null): string {
    if (caught instanceof PhotoEncodeError) {
      return "kip couldn't read that image. Try a different photo.";
    } else if (file) {
      return "That didn't upload. Check your connection and try again.";
    } else {
      return "Couldn't remove that. Try again.";
    }
  }

  async function change(file: Blob | null): Promise<void> {
    busy = true;
    error = null;
    try {
      await kip.setProfilePhoto(file);
    } catch (caught) {
      console.error(caught);
      error = failure(caught, file);
    } finally {
      busy = false;
      // The same file twice fires no change event unless the input is cleared.
      if (fileInput) fileInput.value = "";
    }
  }
</script>

<div class="flex flex-col items-center gap-2">
  <div class="relative inline-flex">
    <Avatar {name} {photoURL} class="h-20 w-20 text-2xl" ring />
    {#if photoURL && photoURL !== kip.providerPhotoURL}
      <button
        type="button"
        onclick={() => change(null)}
        disabled={busy}
        aria-label="Remove your photo"
        title="Remove your photo"
        class="absolute bottom-0 left-0 {PHOTO_CONTROL}"
      >
        <LuX width="14" height="14" />
      </button>
    {/if}
    <button
      type="button"
      onclick={() => fileInput?.click()}
      disabled={busy}
      aria-label="Change your photo"
      title="Change your photo"
      class="absolute bottom-0 right-0 {PHOTO_CONTROL}"
    >
      {#if busy}
        <LuLoaderCircle class="animate-spin" width="14" height="14" />
      {:else}
        <LuCamera width="14" height="14" />
      {/if}
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      hidden
      onchange={(event) => {
        // Cancelling the picker fires nothing, so null would mean "remove".
        const chosen = event.currentTarget.files?.[0];
        if (chosen) void change(chosen);
      }}
    >
  </div>
  {#if error}
    <FieldNote tone="danger">{error}</FieldNote>
  {/if}
</div>
