<script lang="ts">
  import { CHECKOUT_MAX } from "../checkout";
  import FieldNote from "./ui/field-note.svelte";
  import Textarea from "./ui/textarea.svelte";

  // The check-out instructions field, shared by the place form and the room sheet.
  let {
    value,
    onchange,
    disabled = false,
  }: {
    value: string;
    onchange: (value: string) => void;
    disabled?: boolean;
  } = $props();

  const fieldId = $props.id();
</script>

<label for={fieldId} class="flex flex-col gap-1.5 text-sm text-muted">
  Check-out instructions
  <Textarea
    id={fieldId}
    class="min-h-24 resize-y text-text"
    maxlength={CHECKOUT_MAX}
    {value}
    {disabled}
    oninput={(event) => onchange(event.currentTarget.value)}
  />
  <FieldNote>Only guests with a confirmed stay see this.</FieldNote>
</label>
