// What happens to kip's texts when the number they were agreed for CHANGES,
// which in kip is remove-then-add: two screens apart, and silent if nobody
// carries the consent across. Every state is read back off the stored prefs
// document, since a switch drawn from state nobody has read back proves the
// render and not the write.
//
// While kip has no number to text from (`SMS_FROM` empty) none of that is
// reachable, so the gate is checked instead; provision a number and the change
// of number runs as written.

import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import {
  EmulatedFirestore,
  type Plain,
  plainFields,
  textedCode,
} from "../emulators.ts";
import {
  bodyText,
  expect,
  freshEmail,
  linger,
  profile,
  signInByEmail,
  test,
} from "../fixtures.ts";

// Read out of the constant Settings reads, so the two cannot disagree. A check
// that quietly skips a disabled feature is how the gate gets removed by
// accident, so with no sender the gate itself is what gets checked.
const SMS_LIVE = /SMS_FROM\s*=\s*"([^"]*)"/.exec(
  await readFile(new URL("../../src/lib/sms.ts", import.meta.url), "utf8"),
)?.[1];

const firestore = new EmulatedFirestore();

// Fresh every run: the emulator keeps its accounts while it is up, and a number
// that already belongs to one signs INTO it rather than linking, a real product
// path that here silently hands the run somebody else's account.
const line = () => `+1202${Math.floor(1000000 + Math.random() * 8999999)}`;

/** the Texts switch, by its label */
const master = (page: Page): Locator =>
  page.getByRole("switch").filter({ hasText: /^Text me/ });

type Prefs = { [key: string]: Plain };

async function prefsOf(uid: string): Promise<Prefs> {
  const fields = await firestore.read(`users/${uid}/settings/prefs`);
  return fields ? plainFields(fields) : {};
}

const kinds = (held: Plain | undefined): boolean[] =>
  held && typeof held === "object" && !Array.isArray(held)
    ? Object.values(held).map((on) => on === true)
    : [];
const allOff = (held: Plain | undefined) => kinds(held).every((on) => !on);
const allOn = (held: Plain | undefined) =>
  kinds(held).length > 0 && kinds(held).every((on) => on);

async function textsRow(page: Page) {
  const held = master(page);
  return {
    on: (await held.getAttribute("aria-checked")) === "true",
    text: await held.innerText(),
    disabled: await held.isDisabled(),
  };
}

// The switch is below the fold on this screen.
async function showTexts(page: Page): Promise<void> {
  await master(page).scrollIntoViewIfNeeded();
}

const dialogAsked = async (page: Page) =>
  (await bodyText(page)).includes("Keep texts on?");

// The whole door: open the sheet, type the number, and paste the code the
// emulator would have texted.
async function addPhone(page: Page, number: string): Promise<void> {
  await page
    .locator("[class*='min-h-14']")
    .filter({ hasText: /^Phone/ })
    .locator("button")
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.locator("input").first().fill(number);
  await sheet.locator("button[type=submit]").click();
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        code = await textedCode(number);
        return code;
      },
      { message: `a code is texted to ${number}` },
    )
    .toBeTruthy();
  const codeField = sheet.locator("input[autocomplete='one-time-code']");
  await codeField.focus();
  // PASTED, with a separator in it, and never submitted. A full code has
  // nothing left to decide, so the field submits its own form; and a
  // `maxLength` would truncate this paste by CHARACTERS before any handler saw
  // it, quietly losing a digit. `insertText` is a real paste, unlike `fill`.
  await page.keyboard.insertText(`${code?.slice(0, 3)}-${code?.slice(3)}`);
  await expect(
    codeField,
    "a code pasted with a separator lands whole and submits itself",
  ).toHaveCount(0);
}

async function removePhone(page: Page): Promise<void> {
  await page.locator('button[aria-label="Remove Phone"]').click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator('button[aria-label="Remove Phone"]')).toHaveCount(
    0,
  );
}

async function answerDialog(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByText("Keep texts on?")).toHaveCount(0);
}

/** sign someone in with a profile and open Settings */
async function settle(page: Page): Promise<string> {
  const uid = await signInByEmail(page, freshEmail("consent-check"));
  await firestore.put(`users/${uid}`, profile("Consent Under Test"));
  // A full load: the app has been sitting with no profile since the sign-in,
  // and its name sheet is up over everything.
  await page.goto("about:blank");
  await page.goto("/#/settings");
  await expect(master(page)).toBeAttached();
  return uid;
}

test("with no number to text from, texts cannot be turned on", async ({
  page,
}) => {
  test.skip(
    Boolean(SMS_LIVE),
    "kip has a number; the change of number runs instead",
  );
  const uid = await settle(page);
  await addPhone(page, line());

  expect(await dialogAsked(page), "adding a number asked nothing").toBe(false);
  await showTexts(page);
  const gated = await textsRow(page);
  expect(gated.on, "the switch is off").toBe(false);
  expect(gated.disabled, "and refuses the press").toBe(true);
  expect(
    gated.text,
    "the row says kip has no number, rather than nothing",
  ).toContain("no number to text from");

  await master(page).evaluate((held) => (held as HTMLElement).click());
  await linger(page);
  const pressed = await prefsOf(uid);
  expect(
    pressed.smsConsentNumber ?? null,
    "pressing it writes no consent",
  ).toBeNull();
  expect(allOff(pressed.notifySms), "and turns no kind on").toBe(true);

  // Both channels list the same kinds in the same order: a text column shorter
  // than the email one above it reads as having forgotten some.
  const labels = await page
    .locator("[class*='divide-y']")
    .last()
    .evaluate((texts) =>
      [...texts.children]
        .map((held) => (held as HTMLElement).innerText.split("\n")[0])
        .slice(1),
    );
  expect(labels, "every kind is listed under Texts").toHaveLength(6);
});

test("a change of number carries consent only when asked", async ({ page }) => {
  test.skip(
    !SMS_LIVE,
    "kip has no number to text from; the gate is checked instead",
  );
  const [first, second, third] = [line(), line(), line()];
  const uid = await settle(page);

  let firstAt: Plain | undefined;
  let firstVersion: Plain | undefined;
  await test.step("an account that never wanted texts is not asked about them", async () => {
    await addPhone(page, first);
    await showTexts(page);
    expect(await dialogAsked(page), "no dialog with no consent to carry").toBe(
      false,
    );
    const fresh = await prefsOf(uid);
    expect(
      fresh.smsConsentNumber ?? null,
      "nothing operative was written by adding a number",
    ).toBeNull();
    const row = await textsRow(page);
    expect(row.on, "the switch is off").toBe(false);
    expect(row.text, "with the number in its copy").toContain(first);
  });

  await test.step("turning texts on records a consent naming that number", async () => {
    await master(page).click();
    await expect
      .poll(async () => (await prefsOf(uid)).smsConsentNumber, {
        message: "the record names the number it was given for",
      })
      .toBe(first);
    const consented = await prefsOf(uid);
    expect(allOn(consented.notifySms), "every texted kind is on").toBe(true);
    expect(
      consented.smsConsentLog,
      "nothing is superseded yet",
    ).toBeUndefined();
    firstAt = consented.smsConsentAt;
    firstVersion = consented.smsConsentVersion;
    expect(firstVersion, "it says what wording was agreed").toBeTruthy();
  });

  await test.step("removing the number stops the texts and keeps the record", async () => {
    await removePhone(page);
    await showTexts(page);
    await expect
      .poll(async () => allOff((await prefsOf(uid)).notifySms), {
        message: "the texted kinds are all off",
      })
      .toBe(true);
    const removed = await prefsOf(uid);
    expect(
      [removed.smsConsentNumber, removed.smsConsentAt],
      "the consent record survives the number leaving",
    ).toEqual([first, firstAt]);
    const row = await textsRow(page);
    expect(
      [row.on, row.disabled],
      "the switch reads off and has nothing to act on",
    ).toEqual([false, true]);
  });

  await test.step("re-adding the SAME number asks rather than resuming", async () => {
    await addPhone(page, first);
    await expect(
      page.getByText("Keep texts on?"),
      "the dialog is up",
    ).toBeVisible();
    await answerDialog(page, "No texts");
    await linger(page);
    const declined = await prefsOf(uid);
    expect(allOff(declined.notifySms), "declining leaves the kinds off").toBe(
      true,
    );
    expect(declined.smsConsentAt, "and writes nothing operative").toBe(firstAt);
  });

  let carriedAt: Plain | undefined;
  await test.step("a NEW number is asked about, and accepting names it", async () => {
    await removePhone(page);
    await addPhone(page, second);
    await expect(
      page.getByText("Keep texts on?"),
      "the dialog is up",
    ).toBeVisible();
    const asked = await bodyText(page);
    expect(asked, "it names the new number").toContain(second);
    expect(asked, "and carries the disclosures").toContain("automated texts");
    expect(asked).toContain("Reply STOP to stop, HELP for help");
    await answerDialog(page, "Text this number");
    await showTexts(page);
    await expect
      .poll(async () => (await prefsOf(uid)).smsConsentNumber, {
        message: "the operative record names the new number",
      })
      .toBe(second);
    const carried = await prefsOf(uid);
    expect(
      carried.smsConsentAt,
      "a fresh agreement, not the old one moved",
    ).not.toBe(firstAt);
    expect(carried.smsConsentVersion).toBe(firstVersion);
    expect(allOn(carried.notifySms), "every texted kind is on again").toBe(
      true,
    );
    expect(
      carried.smsConsentLog,
      "the superseded consent is kept, naming the old number",
    ).toEqual([expect.objectContaining({ number: first, at: firstAt })]);
    carriedAt = carried.smsConsentAt;
    const row = await textsRow(page);
    expect(row.on, "the switch is on").toBe(true);
    expect(row.text, "and its copy names the new number").toContain(second);
  });

  await test.step("declining for a third number changes nothing operative", async () => {
    await removePhone(page);
    await addPhone(page, third);
    await expect(
      page.getByText("Keep texts on?"),
      "the dialog is up",
    ).toBeVisible();
    await answerDialog(page, "No texts");
    await linger(page);
    await showTexts(page);
    const declined = await prefsOf(uid);
    expect(allOff(declined.notifySms), "the kinds stay off").toBe(true);
    expect(
      [declined.smsConsentNumber, declined.smsConsentAt],
      "the record still names the number it was last given for",
    ).toEqual([second, carriedAt]);
    expect(
      declined.smsConsentLog,
      "and nothing was appended for a consent never given",
    ).toHaveLength(1);
    expect((await textsRow(page)).on, "the switch reads off").toBe(false);
  });
});
