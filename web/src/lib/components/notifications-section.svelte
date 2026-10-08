<script lang="ts" module>
  import { NOTIFY_EVENTS } from "../types";

  // One list, walked by both channels, so the two read label for label. The
  // kinds a text cannot carry are still ROWS on the text side — saying "email
  // only" where the toggle would be — because a channel that silently drops two
  // of six looks like it forgot them. That replaces a sentence under the group
  // naming the missing kinds, which was four rows away from the gap it explained.
  const EVENTS = Object.entries(NOTIFY_EVENTS);
</script>

<script lang="ts">
  import { BASE_PATH } from "../base";
  import {
    CHECK_STALL_MS,
    formatUsNumber,
    probeState,
    SMS_FROM,
    startTextLink,
  } from "../sms";
  import { kip } from "../store.svelte";
  import type { NotifyKind, NotifySmsKind } from "../types";
  import { SMS_LIVE } from "./doors-section.svelte";
  import { askIdentity } from "./name-gate.svelte";
  import Busy from "./ui/busy.svelte";
  import Button from "./ui/button.svelte";
  import FieldNote from "./ui/field-note.svelte";
  import Group from "./ui/group.svelte";
  import Section from "./ui/section.svelte";
  import Switch from "./ui/switch.svelte";

  // Two channels, each with its own way of reaching nobody: email needs a
  // verified address, and a text needs a number on the account plus consent that
  // was given beside the disclosures. Both gaps are silent, so both are said
  // here.
  let sent = $state(false);
  let error = $state<string | null>(null);
  let textError = $state<string | null>(null);

  // Derived from the two stamps and the clock rather than held in state, so a
  // reload can't lose a check in flight and a second press still means "ask
  // again". One timer, armed only while a check could still turn into a stall —
  // an interval would redraw the section to advance a clock nothing reads.
  let now = $state(Date.now());
  const askedAt = $derived(kip.prefs.smsProbeAt);
  const probe = $derived(probeState(askedAt, kip.prefs.smsProbeDoneAt, now));
  $effect(() => {
    if (probe !== "checking" || askedAt === null) return;
    const timer = setTimeout(
      () => {
        now = Date.now();
      },
      askedAt + CHECK_STALL_MS - now,
    );
    return () => clearTimeout(timer);
  });

  // One switch over the whole map: what people decide is "text me the important
  // stuff", and per-kind granularity later is a UI change with no migration.
  //
  // `some`, not `every`: a kind added to the table later is absent from a stored
  // map and reads false, and that is meant to stay false — the disclosures name
  // the kinds, so a new one is wording nobody agreed to and wants the switch
  // turned on again. `every` would meanwhile read "off" while four kinds still
  // text, which is the lie worth avoiding.
  //
  // AND bound to the number it was given for. Read off the map alone, the row
  // rendered ON and greyed out over an account whose phone door had been
  // removed — nothing to turn it off with — and a different number added later
  // resumed texting on an agreement about the old one.
  //
  // ANDed with `SMS_LIVE`, or an account that agreed before kip lost its number
  // renders every text row ON while nothing can be sent — a switch claiming kip
  // texts about this is the one thing the section must never say.
  const texting = $derived(
    SMS_LIVE &&
      kip.prefs.smsConsentNumber !== null &&
      kip.prefs.smsConsentNumber === kip.phone &&
      Object.values(kip.prefs.notifySms).some(Boolean),
  );
  // Carrier-enforced, so kip only observes it — and only by attempting a send,
  // which needs the switch left on. Disabling it here stranded anyone whose STOP
  // landed as they were switching texts off: nothing to attempt, nothing to
  // clear the flag, and a dead control. Turning it on clears it instead, and the
  // next refused send writes it straight back.
  const blocked = $derived(kip.prefs.smsStopped);
  const checking = $derived(probe === "checking");
  // Only once the sender has actually answered. Gated on the state rather than
  // on the stamp being non-null, or a STALL would show "kip tried a text" over
  // an older answer while this ask was still unaccounted for.
  const checkedStillBlocked = $derived(probe === "answered" && blocked);

  const textNote = $derived.by(() => {
    if (!SMS_LIVE) {
      return "kip has no number to text from yet, so nothing can be sent and there is nothing to agree to. This turns on when it has one.";
    } else if (kip.phone) {
      return `Automated texts to ${kip.phone} for the kinds below. Message frequency varies, and message and data rates may apply. Reply STOP to stop, HELP for help.`;
    } else {
      return "kip texts the number on your account, and this one has none. Add a phone under How you get in, above.";
    }
  });

  async function runCheck(): Promise<void> {
    textError = null;
    now = Date.now();
    try {
      await kip.checkTexts();
    } catch (caught) {
      console.error(caught);
      textError = "Couldn't check just now. Try again.";
    }
  }

  async function toggleTexts(next: boolean): Promise<void> {
    textError = null;
    try {
      await kip.setTexts(next);
    } catch (caught) {
      console.error(caught);
      textError = "Couldn't save that. Try again.";
    }
  }

  async function toggleKind(kind: NotifySmsKind, next: boolean): Promise<void> {
    textError = null;
    try {
      await kip.setTextNotify(kind, next);
    } catch (caught) {
      console.error(caught);
      textError = "Couldn't save that. Try again.";
    }
  }

  async function resend(): Promise<void> {
    error = null;
    try {
      await kip.resendVerification();
      sent = true;
    } catch (caught) {
      console.error(caught);
      error = "Couldn't send that just now. Try again in a minute.";
    }
  }
</script>

{#if kip.user}
  <!-- Channel-major: two labelled blocks, each heading tight against the group
       it names. Nested so the outer gap separates the channels while the inner
       one keeps a heading with its list. -->
  <Section title="Notifications" class="gap-4">
    <Section title="Email">
      <!-- Two different gaps, and they used to be one. An address kip has but
           can't trust is a confirm; no address at all is an ask — and without
           this split the second rendered "Confirm undefined", which nobody saw
           only because these sessions could not reach Settings. -->
      {#if kip.email}
        {#if !kip.emailVerified}
          <div
            class="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card"
          >
            <p class="text-sm text-muted">
              kip only emails an address that's been confirmed — otherwise
              anyone could enter someone else's and have kip mail them. Confirm
              {kip.email}
              to start receiving these.
            </p>
            {#if sent}
              <FieldNote tone="success">
                Sent. Check your inbox, then reload kip.
              </FieldNote>
            {:else}
              <Button variant="secondary" onclick={resend} class="self-start">
                Send confirmation email
              </Button>
            {/if}
            {#if error}
              <FieldNote tone="danger">{error}</FieldNote>
            {/if}
          </div>
        {/if}
      {:else}
        <div
          class="flex flex-col items-start gap-3 rounded-3xl bg-surface p-4 shadow-card"
        >
          <p class="text-sm text-muted">
            {kip.phone && SMS_LIVE
              ? "kip has no address for you, so none of this arrives by email. A text can still reach you — turn those on below."
              : "kip has no way to reach you when you're not looking at it. Add an address to hear when things happen."}
          </p>
          <Button variant="secondary" onclick={askIdentity}>Add email</Button>
        </div>
      {/if}

      <Group>
        {#each EVENTS as [key, event] (key)}
          <Switch
            checked={kip.prefs.notify[key as NotifyKind]}
            onchange={(next) => kip.setNotify(key as NotifyKind, next)}
            label={event.label}
            description={event.note}
            srSuffix="by email"
          />
        {/each}
      </Group>
    </Section>

    <Section title="Texts">
      <!-- Consent to be texted is collected on the first row and nowhere else:
           it must not ride along with signing in or with adding a number, which
           is what bundling it onto the reach field would have done. Off by
           default, and the disclosures are on the row being turned on.

           The rows under it carry no descriptions. Each is the same event as a
           row forty pixels up, whose note already says what it is, and four more
           paragraphs would double the section to repeat them. -->
      <Group>
        <Switch
          checked={texting}
          onchange={toggleTexts}
          disabled={!SMS_LIVE || !kip.phone}
          label="Text me"
          description={textNote}
        />
        {#each EVENTS as [key, event] (key)}
          {#if event.sms}
            <!-- Checked is not the stored map alone: consent bound to a number
                 that has since changed leaves trues standing that nothing will
                 act on, and a greyed-out row drawn ON would be saying kip texts
                 about this. `texting` already folds in the no-number-at-all
                 case.

                 Disabled is one condition for no sender, no phone, no consent
                 and consent about another number — every one of them is
                 answered by the row above, which is why none needs its own line
                 here. -->
            <Switch
              checked={texting && kip.prefs.notifySms[key as NotifySmsKind]}
              disabled={!texting}
              onchange={(next) => toggleKind(key as NotifySmsKind, next)}
              label={event.label}
              srSuffix="by text"
            />
          {:else}
            <!-- Nothing takes this branch today — every kind is textable — and
                 it is kept because the next one may not be: a saved-search
                 digest is not caused by a person acting on you and belongs in
                 an inbox. The table decides, so adding such a kind is one flag
                 rather than a second list here. -->
            <Switch
              checked={false}
              onchange={() => {}}
              label={event.label}
              unavailable="Email only"
            />
          {/if}
        {/each}
      </Group>

      {#if textError}
        <FieldNote tone="danger">{textError}</FieldNote>
      {/if}

      <!-- kip can only ever OBSERVE this: the carrier holds the block, and the
           only way out is the person texting START themselves. So the number is
           named and made tappable rather than described — "the number kip
           texted you from" is in a message they may well have deleted.

           The check is here because nothing else would tell them it worked: the
           block lifts silently, and kip finds out only by trying. Without it
           the answer is "wait until kip next has something to text you about",
           which for a quiet week is indistinguishable from still being
           blocked. -->
      {#if SMS_LIVE && blocked}
        <FieldNote tone="danger">
          <span>
            Your carrier is blocking kip's texts: STOP was replied from
            {kip.phone ?? "your number"}. kip can't lift that.
            {#if SMS_FROM}
              Text START to
              <a class="font-semibold underline" href={startTextLink(SMS_FROM)}
                >{formatUsNumber(SMS_FROM)}</a
              >, then check below.
            {:else}
              Text START to the number kip texted you from, and this clears the
              next time a text gets through.
            {/if}
          </span>
          {#if SMS_FROM}
            <span class="mt-3 flex items-center gap-3">
              <Button
                variant="secondary"
                onclick={runCheck}
                disabled={checking}
              >
                {#if checking}
                  <Busy label="Check now" />
                {:else}
                  Check now
                {/if}
              </Button>
              {#if checkedStillBlocked}
                <span>kip tried a text; the block is still there.</span>
              {:else if probe === "stalled"}
                <span>That check didn't run. Try again.</span>
              {/if}
            </span>
          {/if}
        </FieldNote>
      {/if}

      <!-- Required beside an SMS consent, and they stay whether or not kip can
           send today. -->
      <FieldNote>
        See our
        <a class="font-semibold text-accent-ink" href="{BASE_PATH}/privacy/"
          >Privacy Policy</a
        >{" "}and{" "}<a
          class="font-semibold text-accent-ink"
          href="{BASE_PATH}/terms/"
          >Terms</a
        >.
      </FieldNote>

      <!-- Across both channels: an email switch left on still tells you, and a
           text switch is no comfort while texts are off as a whole. -->
      {#if !kip.prefs.notify.stayCancelled &&
        !(texting && kip.prefs.notifySms.stayCancelled)}
        <FieldNote tone="danger">
          Nothing will tell you if a stay you're counting on is called off — no
          email, no text. You'd only find out by opening kip.
        </FieldNote>
      {/if}
    </Section>
  </Section>
{/if}
