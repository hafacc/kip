<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ListingPhoto } from "../types";
  import CheckoutField from "./checkout-field.svelte";
  import { reportFailure } from "./dialog.svelte";
  import PhotoStrip from "./photo-strip.svelte";
  import Button from "./ui/button.svelte";
  import Input from "./ui/input.svelte";

  // The fields a room has whether or not its place exists yet, with the Save
  // button; `children` follows the button.
  let {
    ownerId,
    listingId,
    name = $bindable(),
    note = $bindable(),
    checkout,
    checkoutKnown = true,
    oncheckout,
    photos,
    onphotos,
    saveLabel,
    dirty,
    onsave,
    children,
  }: {
    ownerId: string;
    listingId: string;
    name: string;
    note: string;
    checkout: string;
    // False while a saved room's instructions are still loading.
    checkoutKnown?: boolean;
    oncheckout: (checkout: string) => void;
    photos: readonly ListingPhoto[];
    onphotos: (photos: ListingPhoto[]) => Promise<void>;
    saveLabel: string;
    dirty: boolean;
    onsave: () => Promise<void>;
    children?: Snippet;
  } = $props();

  const fieldId = $props.id();
  let busy = $state(false);
  let uploading = $state(false);

  async function save(): Promise<void> {
    busy = true;
    try {
      await onsave();
    } catch (error) {
      reportFailure(error, "Couldn't save that room. Please try again.");
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-col gap-5">
  <label for="{fieldId}-name" class="flex flex-col gap-1.5 text-sm text-muted">
    Name
    <Input
      id="{fieldId}-name"
      placeholder="e.g. Back bedroom"
      bind:value={name}
    />
  </label>
  <label for="{fieldId}-note" class="flex flex-col gap-1.5 text-sm text-muted">
    Note
    <Input
      id="{fieldId}-note"
      placeholder="e.g. Ground floor, double bed"
      bind:value={note}
    />
  </label>
  <div class="flex flex-col gap-1.5">
    <span class="text-sm text-muted">Photos</span>
    <PhotoStrip
      {ownerId}
      {listingId}
      {photos}
      editable
      onchange={onphotos}
      onbusychange={(now) => {
        uploading = now;
      }}
    />
  </div>
  <CheckoutField
    value={checkout}
    onchange={oncheckout}
    disabled={!checkoutKnown}
  />
  <Button onclick={save} disabled={busy || uploading || !dirty || !name.trim()}>
    {saveLabel}
  </Button>
  {@render children?.()}
</div>
