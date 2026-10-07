<script lang="ts" module>
  // Keys for a row that is never inserted into, removed from or reordered, so
  // they can be names rather than positions.
  const BOXES = ["one", "two", "three", "four", "five", "six"] as const;
</script>

<script lang="ts">
  import { CODE_LENGTH } from "../../reach";

  // Six boxes drawn under ONE real input, never six inputs. That is the whole
  // design decision: the OS keyboard's "From Messages: 123456" strip, paste,
  // backspace and select-all are all things the platform already does to a single
  // `one-time-code` field, and six would mean imitating every one of them with
  // index-juggling refs — while still losing the autofill, which fills one field
  // and gives up. The boxes are the shell `Input` wears (h-11, rounded-xl, the
  // same border and accent ring), so this reads as kip's field rather than a
  // widget that wandered in.
  //
  // The input is transparent rather than hidden, because an `opacity-0` field is
  // skipped by some autofill, and the caret is drawn as the ring on whichever box
  // comes next.
  //
  // It submits its own form on the sixth digit. A code is the one field with
  // nothing left to decide once it is full, so the tap that follows exists only
  // because the form has a button. Fired from an effect, so the caller's submit
  // reads the state that includes the digit that completed it.
  let {
    value,
    onchange,
    invalid = false,
    autofocus = false,
    busy = false,
  }: {
    value: string;
    onchange: (next: string) => void;
    invalid?: boolean;
    autofocus?: boolean;
    // The caller's in-flight flag. See `readonly` below — this is what stops one
    // code being confirmed twice.
    busy?: boolean;
  } = $props();

  let field = $state<HTMLInputElement>();
  // Seeded from the prop: the focus given on mount below lands before the
  // `focus` listener can be relied on to have said so, and unseeded the field
  // opened as six identical empty boxes with nothing saying where the next
  // digit lands.
  // svelte-ignore state_referenced_locally
  let focused = $state(autofocus);

  // Focused by hand rather than left to the attribute, which only takes while
  // nothing else holds focus — and this step replaces a field that did.
  $effect(() => {
    if (autofocus) field?.focus();
  });

  $effect(() => {
    if (value.length === CODE_LENGTH) field?.form?.requestSubmit?.();
  });

  // Everything here assumes the caret is at the end — the ring names the next
  // box, backspace takes the last digit — so a tap that would land it in the
  // middle is walked back to the end instead.
  function toEnd(): void {
    field?.setSelectionRange(value.length, value.length);
  }

  const next = $derived(Math.min(value.length, CODE_LENGTH - 1));
</script>

<div class="relative">
  <div class="grid grid-cols-6 gap-2">
    {#each BOXES as name, index (name)}
      {@const live = focused && index === next}
      {@const ring = live
        ? "border-accent ring-2 ring-accent/20"
        : "border-border"}
      <div
        class="flex h-11 items-center justify-center rounded-xl border bg-surface text-base font-semibold tabular-nums transition {invalid
          ? "border-danger"
          : ring}"
      >
        {value[index] ?? ""}
      </div>
    {/each}
  </div>
  <!-- No maxlength: it truncates a paste before non-digits are stripped.

       Frozen while a code is in flight, or the race is: submit starts on the
       sixth digit, nothing on screen has changed yet, so a backspace and a
       retype take the value 6 -> 5 -> 6, the effect fires again, and the same
       single-use code is confirmed twice. `requestSubmit` does not consult the
       submit button's `disabled`, so the button being greyed is no guard at
       all. -->
  <input
    bind:this={field}
    autocomplete="one-time-code"
    inputmode="numeric"
    aria-label="6-digit code"
    aria-invalid={invalid || undefined}
    readonly={busy}
    {value}
    oninput={(event) => {
      const cleaned = event.currentTarget.value
        .replace(/\D/g, "")
        .slice(0, CODE_LENGTH);
      // Written back at once: when the cleaned value is what the caller already
      // holds, nothing would otherwise put it back in the field.
      event.currentTarget.value = cleaned;
      onchange(cleaned);
    }}
    onfocus={() => {
      focused = true;
      toEnd();
    }}
    onblur={() => {
      focused = false;
    }}
    onclick={toEnd}
    class="absolute inset-0 h-full w-full bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
  >
</div>
