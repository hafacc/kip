<script lang="ts">
  import { EMPTY_REACH, type ReachState } from "../reach";
  import CodeInput from "./ui/code-input.svelte";
  import Input from "./ui/input.svelte";

  // The field `lib/reach.ts` describes: one input for both doors, replaced by
  // the code step once a number has been texted.
  let {
    state: reach,
    onchange,
    host = $bindable(),
    only,
    invalid = false,
    busy = false,
  }: {
    state: ReachState;
    onchange: (next: ReachState) => void;
    // The element reCAPTCHA binds to. Bound by the caller because the SEND
    // needs it, and the send lives there.
    host?: HTMLDivElement;
    // Pins the field to one door and drops the offer of the other. See
    // `reachError`.
    only?: "phone";
    // Reddens whichever step's box is up, so it and the message the caller is
    // showing read as one object. The caller owns it because the caller owns the
    // message: what is wrong may be the typed address (`reachError`) or the send
    // that followed it, and only the caller has both.
    invalid?: boolean;
    // Passed straight through to the code step, where it freezes the field. Every
    // caller already holds it for its own button; see `CodeInput`.
    busy?: boolean;
  } = $props();

  const phoneMode = $derived(reach.mode === "phone");
</script>

<!-- The code step replaces the field rather than sitting under it: at that point
     the number is settled and the only thing left to type is six digits. It
     carries the SAME message line, or a refused code has nowhere to be said and
     the sheet just stops. -->
{#if reach.pending}
  <!-- The message line above describes the PREVIOUS step and cannot know
       about this one, so the code step names its own: a bare six-digit box
       with nothing saying anything was texted, or where to, was the one
       step the restructure was meant to make legible. -->
  <p class="text-sm text-muted">
    We texted a code to {reach.sentTo}. Standard message rates apply.
  </p>
  <!-- Focused on arrival: the code step replaces the field it follows, so
       the keyboard is already up — a tap to get it back is one the previous
       step never asked for. -->
  <CodeInput
    autofocus
    {invalid}
    {busy}
    value={reach.code}
    onchange={(code) => onchange({ ...reach, code })}
  />
  <!-- A code that never arrives must not trap the ask. Backing out returns
       to the field with everything else intact, so the request can still
       go with no way to be reached — which is what "optional" has to mean
       for it to be true. -->
  <button
    type="button"
    onclick={() => onchange({ ...EMPTY_REACH, mode: reach.mode })}
    class="self-start text-sm font-semibold text-accent-ink hover:opacity-80"
  >
    {only ? "Didn't get it? Start over" : "Didn't get it? Use something else"}
  </button>
{:else}
  {#snippet swap()}
    <button
      type="button"
      onclick={() =>
        onchange({ ...reach, mode: phoneMode ? "email" : "phone" })}
      class="text-sm font-semibold text-accent-ink hover:opacity-80"
    >
      {phoneMode ? "Use email" : "Use phone"}
    </button>
  {/snippet}
  <!-- The switch lives in the field's tail and only while the field is
       empty: everything it does — keyboard, autofill hint, placeholder — is
       settled at focus, before a character exists. Words rather than an icon
       because a stranger on a share link meets this once, and naming the
       ALTERNATIVE removes the is-this-a-state-or-an-action ambiguity every
       icon toggle carries. -->
  <Input
    autocomplete={phoneMode ? "tel" : "email"}
    inputmode={phoneMode ? "tel" : "email"}
    {invalid}
    value={reach.raw}
    oninput={(event) => onchange({ ...reach, raw: event.currentTarget.value })}
    placeholder={phoneMode ? "(415) 555-0123" : "you@example.com"}
    aria-label={phoneMode ? "Phone number" : "Email"}
    wideSuffix
    suffix={reach.raw || only ? undefined : swap}
  />

  <!-- Invisible reCAPTCHA still binds to a real element, so one has to exist
       before the send rather than being conjured during it. Out of flow: at
       zero height it still collected a full gap from the column, which is
       12px of nothing between the field and the button. -->
  <div bind:this={host} class="absolute"></div>
{/if}
