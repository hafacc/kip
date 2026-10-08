<script lang="ts" module>
  import { EMAIL_DOOR, PHONE_DOOR } from "../auth";
  import { EMPTY_REACH, type ReachState } from "../reach";
  import { SMS_FROM } from "../sms";

  // kip has no number to text from, so nothing can be sent and nothing may be
  // agreed to. The same "ships able to be off" shape as `smsConfigured()` on the
  // sender: one constant, checked before anything is offered. Provisioning a number is what turns the section on.
  export const SMS_LIVE = Boolean(SMS_FROM);

  // The field defaults to email, and this sheet's door is a keypad from the first
  // tap — `only` pins the route, this only picks the keyboard.
  const PHONE_REACH: ReachState = { ...EMPTY_REACH, mode: "phone" };

  // Removing one of these two takes the reach it carried with it: unlinking clears
  // the address or the number off the Auth account, which is the only copy kip
  // keeps, so notifications on that channel stop. Probed against the Auth
  // emulator, including the case where a Google door carries the same address —
  // the address still goes. Google is absent because it is the exception: it
  // leaves the address behind, and kip keeps mailing it.
  const LOSES: Record<string, string> = {
    [EMAIL_DOOR]: "The address goes with it, so kip's email stops. ",
    [PHONE_DOOR]: "The number goes with it, so kip's texts stop. ",
  };
</script>

<script lang="ts">
  import {
    authErrorMessage,
    GOOGLE_DOOR,
    PhoneAlreadySet,
    removeDoor,
    StaleSession,
    sendAttachLink,
  } from "../auth";
  import { parseDestination } from "../destination";
  import { codeReady, confirmReach, reachError, sendReach } from "../reach";
  import { standingConsent } from "../settings";
  import { kip } from "../store.svelte";
  import { dialog } from "./dialog.svelte";
  import DoorRow from "./door-row.svelte";
  import { otherAccountAlert } from "./name-gate.svelte";
  import ReachField from "./reach-field.svelte";
  import Busy from "./ui/busy.svelte";
  import Button from "./ui/button.svelte";
  import Chip from "./ui/chip.svelte";
  import FieldNote from "./ui/field-note.svelte";
  import Group from "./ui/group.svelte";
  import Input from "./ui/input.svelte";
  import Section from "./ui/section.svelte";
  import Sheet from "./ui/sheet.svelte";

  // What this account can be reached and re-entered by. kip has no password, so
  // there is no reset to fall back on: one credential is one lost inbox from
  // unrecoverable, which is the whole reason this is a list rather than a line.
  //
  // Every row reads the store's snapshot rather than `user`, because linking and
  // unlinking change those fields without changing the uid — Firebase mutates
  // the same object in place and a row reading it would never update.

  // Which sheet is up, rather than one flag each: they draw over the same note
  // and only one can be answered at a time.
  let sheet = $state<"email" | "phone" | null>(null);
  let address = $state("");
  let sentTo = $state<string | null>(null);
  let reach = $state.raw<ReachState>(PHONE_REACH);
  let recaptcha = $state<HTMLDivElement>();
  let busy = $state(false);
  let error = $state<string | null>(null);

  const emailDoor = $derived(
    kip.doors.find((door) => door.providerId === EMAIL_DOOR),
  );
  const phoneDoor = $derived(
    kip.doors.find((door) => door.providerId === PHONE_DOOR),
  );
  const googleDoor = $derived(
    kip.doors.find((door) => door.providerId === GOOGLE_DOOR),
  );
  const spare = $derived(kip.doors.length > 1);
  const numberProblem = $derived(reachError(reach.raw, "phone"));

  function openEmail(): void {
    address = "";
    sentTo = null;
    error = null;
    sheet = "email";
  }

  function openPhone(): void {
    reach = PHONE_REACH;
    error = null;
    sheet = "phone";
  }

  // Clearing on the way out, because the note under the group shows the same
  // `error` — so a rejected address would follow the sheet back onto a screen
  // with no field on it.
  function close(): void {
    error = null;
    sheet = null;
  }

  // No conflict can surface here: an address that belongs to someone else is
  // indistinguishable at send time — `enableImprovedEmailPrivacy` is what makes
  // it so — and `/continue/` is where it finally refuses and says so.
  async function sendLink(): Promise<void> {
    const parsed = parseDestination(address);
    if (parsed.kind !== "email") {
      error = "That doesn't look like an email address.";
      return;
    }
    busy = true;
    error = null;
    try {
      // No host: this was added from Settings, where there is no request for
      // the landing page to name.
      await sendAttachLink(parsed.value, "");
      sentTo = parsed.value;
    } catch (caught) {
      console.error(caught);
      error = authErrorMessage(caught);
    } finally {
      busy = false;
    }
  }

  // Both steps of the phone door, since the sheet's one button finishes
  // whichever is showing: a code that has been sent is waiting to be typed.
  async function submitNumber(): Promise<void> {
    if (numberProblem) return;
    const current = reach;
    busy = true;
    error = null;
    try {
      if (current.pending) {
        const { sameAccount } = await confirmReach(
          current.pending,
          current.code,
        );
        sheet = null;
        if (!sameAccount) {
          // The number was already on kip, so they are IN that account now — a
          // different uid, with its own places, friends and stays. Nothing here
          // can merge the two.
          await dialog.alert(otherAccountAlert("number"));
        } else if (SMS_LIVE && current.sentTo && standingConsent(kip.prefs)) {
          // Gated too, not just the switch: this is the OTHER way a consent gets
          // written, and re-presenting the disclosures for texts kip cannot send
          // takes an agreement it has no use for.
          await offerTexts(current.sentTo);
        }
        return;
      }
      const holder = recaptcha;
      if (!holder) throw new Error("no element for the check to bind to");
      // No host: this was added from Settings, where there is no request for
      // a landing page to name.
      const sent = await sendReach(current.raw, "", holder);
      reach = { ...current, pending: sent.pending, sentTo: sent.sentTo };
    } catch (caught) {
      console.error(caught);
      if (current.pending) {
        error = "Wrong code. Check it, or ask for another.";
      } else if (caught instanceof PhoneAlreadySet) {
        // The row offered Add, so this account grew a number somewhere else —
        // another tab, or the sheet that collects one beside an ask.
        error = "A number was added. Reload kip to see it.";
      } else {
        error = authErrorMessage(caught);
      }
    } finally {
      busy = false;
    }
  }

  async function addGoogle(): Promise<void> {
    busy = true;
    error = null;
    try {
      const { sameAccount } = await kip.signIn();
      // That Google account already existed, so they have MOVED to it — the
      // listings, friends and stays on screen a second ago belong to a uid they
      // no longer are, and nothing here can merge the two.
      if (!sameAccount) {
        await dialog.alert(otherAccountAlert("Google account"));
      }
    } catch (caught) {
      console.error(caught);
      error = authErrorMessage(caught);
    } finally {
      busy = false;
    }
  }

  // Changing your number is remove-then-add, and the texts you had turned on
  // must not just stop without you noticing. Not a transfer: the disclosures are
  // shown again, so what this writes is a fresh consent naming the NEW phone.
  // Only where a consent already stands — otherwise adding a number would nag
  // about texts nobody asked for, which is the bundling this design refuses.
  async function offerTexts(number: string): Promise<void> {
    const keep = await dialog.confirm({
      title: "Keep texts on?",
      body: `You had kip's texts turned on for your old number. kip can text ${number} instead — the same kinds you chose, as automated texts. Message frequency varies, and message and data rates may apply. Reply STOP to stop, HELP for help.`,
      confirmLabel: "Text this number",
      cancelLabel: "No texts",
    });
    try {
      if (keep) {
        await kip.keepTexts(number);
      } else if (Object.values(kip.prefs.notifySms).some(Boolean)) {
        // Removing the old number already zeroed the map, but a number can
        // change by routes this screen doesn't own. Declining has to mean off
        // wherever it was reached from.
        await kip.setTexts(false);
      }
    } catch (caught) {
      console.error(caught);
      error = "Couldn't save that. Try again.";
    }
  }

  async function remove(providerId: string, name: string): Promise<void> {
    const sure = await dialog.confirm({
      title: `Remove ${name}?`,
      body: `${LOSES[providerId] ?? ""}You'll still get in the other ways listed here, and you can add this one back anytime.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!sure) return;
    busy = true;
    error = null;
    try {
      await removeDoor(providerId);
      // Taking a number off the account is the plainest way there is of saying
      // stop texting me, so re-adding one asks again rather than resuming. The
      // consent record stays: it is what explains texts already sent, and what
      // tells a change of number from someone who never wanted texts at all.
      if (providerId === PHONE_DOOR) await kip.setTexts(false);
    } catch (caught) {
      console.error(caught);
      if (caught instanceof StaleSession) {
        await dialog.alert({
          title: "Come back in first",
          body: "Firebase only changes what an account signs in with on a fresh sign-in. Sign out, come back in, and remove it then.",
        });
      } else {
        error = "Couldn't remove that. Try again.";
      }
    } finally {
      busy = false;
    }
  }
</script>

<!-- The one message line both sheets end on, mounted whether or not it has
     anything to say: a live region announces a CHANGE, so one that appears
     together with its text is one a screen reader never reads out. It carries
     its own top margin rather than taking a gap from the column, so an empty
     one costs no height at all — which is why it sits in a gapless wrapper with
     the button it follows rather than beside it.

     It used to stand at one line always, reserved so a refusal could not lift
     the field off the thumb of whoever was typing into it. What made that a
     fair trade was standing copy filling the line the rest of the time; both
     sheets have since run out of anything to say there, and 32px of empty sheet
     under the button on every render reads as the layout having broken rather
     than as room being kept. -->
{#snippet problem(
  message: string | null,
)}
  <p
    aria-live="polite"
    class="text-sm leading-5 text-danger {message ? "mt-3" : ""}"
  >
    {message}
  </p>
{/snippet}

<Section title="How you get in">
  <Group>
    <DoorRow
      name="Email"
      value={emailDoor?.value ?? null}
      note="A one-time link, sent to your inbox"
      chip={emailDoor && !kip.emailVerified ? unconfirmed : undefined}
      {busy}
      onadd={openEmail}
      onremove={spare ? () => remove(EMAIL_DOOR, "email") : null}
    />
    <DoorRow
      name="Phone"
      value={phoneDoor?.value ?? null}
      note="A one-time code, texted to you"
      {busy}
      onadd={openPhone}
      onremove={spare ? () => remove(PHONE_DOOR, "phone") : null}
    />
    <DoorRow
      name="Google"
      value={googleDoor?.value ?? null}
      note="One tap, no link to wait for"
      {busy}
      onadd={addGoogle}
      onremove={spare ? () => remove(GOOGLE_DOOR, "Google") : null}
    />
  </Group>

  {#if error && !sheet}
    <FieldNote tone="danger">{error}</FieldNote>
  {:else}
    <FieldNote>
      {kip.doors.length > 1
        ? "Never shown to other users or used to find you."
        : "kip has no password, so these are the only ways back in — a second one means losing the first isn't losing your kip."}
    </FieldNote>
  {/if}

  <Sheet open={sheet === "email"} onclose={close} title="Add an email">
    {#if sentTo}
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted">
          Check {sentTo} and open the link — that's what attaches it. It lands
          on this account whichever device opens it. Reload kip afterwards to
          see it here.
        </p>
        <Button size="lg" onclick={close}>Done</Button>
      </div>
    {:else}
      <form
        class="flex flex-col gap-3"
        onsubmit={(event) => {
          event.preventDefault();
          void sendLink();
        }}
      >
        <Input
          autocomplete="email"
          inputmode="email"
          autofocus
          invalid={Boolean(error)}
          value={address}
          oninput={(event) => {
            error = null;
            address = event.currentTarget.value;
          }}
          placeholder="you@example.com"
          aria-label="Email"
        />
        <div class="flex flex-col">
          <Button type="submit" size="lg" disabled={busy || !address}>
            {#if busy}
              <Busy label="Send the link" />
            {:else}
              Send the link
            {/if}
          </Button>
          {@render problem(error)}
        </div>
      </form>
    {/if}
  </Sheet>

  <Sheet open={sheet === "phone"} onclose={close} title="Add a number">
    <form
      class="flex flex-col gap-3"
      onsubmit={(event) => {
        event.preventDefault();
        void submitNumber();
      }}
    >
      <ReachField
        state={reach}
        onchange={(next) => {
          error = null;
          reach = next;
        }}
        bind:host={recaptcha}
        only="phone"
        invalid={Boolean(error || numberProblem)}
        {busy}
      />
      <div class="flex flex-col">
        <Button
          type="submit"
          size="lg"
          disabled={busy ||
            Boolean(numberProblem) ||
            (reach.pending ? !codeReady(reach) : !reach.raw)}
        >
          {#if busy}
            <Busy label={reach.pending ? "Add the number" : "Text me a code"} />
          {:else if reach.pending}
            Add the number
          {:else}
            Text me a code
          {/if}
        </Button>
        {@render problem(error ?? numberProblem)}
      </div>
    </form>
  </Sheet>
</Section>

<!-- A label, not a second offer: confirming is what the Notifications section
     asks for, since being unconfirmed costs you mail rather than a way in. -->
{#snippet unconfirmed()}
  <Chip tone="pending">Unconfirmed</Chip>
{/snippet}
