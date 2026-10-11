// Feedback, both halves: somebody sending one, and the operator reading and
// clearing them. The rules suite proves who MAY read the collection; only a
// browser proves the menu row appears for the right person, that the list
// query the screen issues is the one the rules allow, and that a report typed
// into the sheet lands at all.

import type { Page } from "@playwright/test";
import { EmulatedFirestore, setClaims, str, text, ts } from "../emulators.ts";
import {
  bodyText,
  expect,
  freshEmail,
  linger,
  profile,
  signInByEmail,
  test,
} from "../fixtures.ts";

const firestore = new EmulatedFirestore();

/** the account menu's button, on whichever header is showing */
const you = (page: Page) =>
  page.locator('button[aria-label="You"]').filter({ visible: true }).first();

/** every button's words while the account menu is open, then shut it again */
async function menuRows(page: Page): Promise<string> {
  // Waited for, because the menu renders only once the profile has a name, and
  // a read taken before it opens lists no rows, which "not offered the inbox"
  // would then pass on without having looked.
  await you(page).click();
  await expect(
    page.getByRole("menuitem", { name: "Sign out", exact: true }),
  ).toBeVisible();
  const rows = (await page.locator("button").allInnerTexts())
    .map((row) => row.trim())
    .join("|");
  // Shut again: navigating to a FRAGMENT does not reload, so a menu left open
  // sits over the next screen and its rows land in every innerText after.
  // Dispatched, since the open menu's backdrop covers the avatar.
  await you(page).dispatchEvent("click");
  await expect(
    page.getByRole("menuitem", { name: "Sign out", exact: true }),
  ).toBeHidden();
  return rows;
}

// Counted by the screen-reader text each mark carries. `span.sr-only` and not
// every span reading "unread": the dot WRAPS that text, so counting both
// doubles every mark. And kip renders two AuthMenus at once, one per
// breakpoint, so the avatar dot is checked for presence rather than counted.
async function dots(page: Page): Promise<{ marks: number; onAvatar: number }> {
  return page.evaluate(() => ({
    marks: [...document.querySelectorAll("span.sr-only")].filter(
      (span) => span.textContent === "unread",
    ).length,
    onAvatar: document.querySelectorAll(
      'button[aria-label="You"] span.rounded-full.bg-accent',
    ).length,
  }));
}

test("feedback is sent by anyone and read and cleared by the operator alone", async ({
  page,
}) => {
  // The emulator keeps its data for as long as it is up, and the unread count
  // below is over the whole collection.
  for (const left of await firestore.list("feedback")) {
    await firestore.remove(`feedback/${left.name.split("/").pop()}`);
  }
  const email = freshEmail("feedback-check");
  const uid = await signInByEmail(page, email);
  await firestore.put(`users/${uid}`, profile("Reporter Under Test"));
  // The nonce is what every assertion matches on: a generic prefix matched a
  // report left behind by an earlier run, and passed once with nothing sent.
  const nonce = `r${Date.now()}`;
  const report = `the room page went blank ${nonce}`;
  const older = "a calendar view would be nice";
  const body = page.locator("body");

  await test.step("an ordinary account is offered Send feedback, not the inbox", async () => {
    await page.goto("/");
    const menu = await menuRows(page);
    expect(menu, "an ordinary account is offered Send feedback").toMatch(
      /Send feedback/,
    );
    // The row it must NOT have, which is the whole point of the role.
    expect(menu, "and is not offered the inbox").not.toMatch(/Feedback inbox/);
  });

  await test.step("sending one", async () => {
    await you(page).click();
    await page
      .getByRole("menuitem", { name: "Send feedback", exact: true })
      .click();
    await page.locator("textarea").fill(report);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(body, "the sheet says it landed").toContainText(
      /Thank you|That's with us/,
      { useInnerText: true },
    );
    await expect
      .poll(
        async () => {
          const stored = await firestore.list("feedback");
          const mine = stored.find(
            (document) => text(document.fields?.text) === report,
          );
          return mine ? text(mine.fields?.uid) : null;
        },
        { message: "the report reached the database, carrying the sender" },
      )
      .toBe(uid);
  });

  // A second report, older and from somebody else, so ordering is observable.
  await firestore.put("feedback/seed_older", {
    uid: str("someone-else"),
    text: str(older),
    at: ts(new Date(Date.now() - 86_400_000).toISOString()),
  });

  // The fragment is guessable, so the refusal is demonstrated, not reasoned.
  await test.step("a non-operator opening the inbox sees a refusal and no reports", async () => {
    await page.goto("about:blank");
    await page.goto("/#/feedback");
    // Positive first, so the absence below is a refusal rather than a blank
    // page or a load in flight.
    await expect(body, "they are told the reports couldn't load").toContainText(
      "Couldn't load these",
      { useInnerText: true },
    );
    const shown = await bodyText(page);
    expect(shown, "and not also told they are still loading").not.toContain(
      "Loading…",
    );
    expect(shown, "and no reports on it").not.toContain("calendar view");
    expect(shown).not.toContain(nonce);
  });

  // The role is a claim on the ACCOUNT, and it rides in the token: a reload
  // reuses the cached one and would show nothing, so the operator signs out
  // and back in, exactly as they have to by hand.
  await test.step("granted the role, the operator signs in again", async () => {
    const granted = await setClaims(uid, { admin: true });
    expect(granted.ok, "the claim is set on the account").toBe(true);
    await page.goto("/");
    await you(page).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(body, "signed out again").toContainText(
      "Spare rooms and empty flats",
      { useInnerText: true },
    );
    await signInByEmail(page, email);
    await page.goto("about:blank");
    await page.goto("/");
    expect(await menuRows(page), "the operator is offered the inbox").toMatch(
      /Feedback inbox/,
    );
  });

  // SLACK, not whether anything wrapped: headless renders this text a shade
  // narrower than a real browser, so the wrap that shipped could not be
  // reproduced here at all. "Feedback inbox" had exactly 0px of it, fitting
  // only while font metrics agreed to the pixel, so the margin is what gets
  // pinned, and it catches the next label somebody adds.
  await test.step("no menu row runs to its edge", async () => {
    await you(page).click();
    // Anchored on a row's own text: a class selector matched some other
    // rounded box and measured ITS buttons, passing with the defect put back.
    const anchor = page
      .getByRole("menuitem", { name: "Send feedback", exact: true })
      .filter({ visible: true })
      .first();
    const rows = await anchor.evaluate((sent) =>
      [...(sent.parentElement?.children ?? [])]
        .filter((element) => element.tagName === "BUTTON")
        .flatMap((row) => {
          const label = [...row.children].find(
            (child) =>
              child.tagName === "SPAN" &&
              child.textContent?.trim() &&
              !child.className.includes("sr-only"),
          );
          if (!label) return [];
          const style = getComputedStyle(row);
          const used = [...row.children].reduce(
            (sum, child) => sum + child.getBoundingClientRect().width,
            0,
          );
          const gaps =
            (row.children.length - 1) *
            Number.parseFloat(style.columnGap || "0");
          const inner =
            row.clientWidth -
            Number.parseFloat(style.paddingLeft) -
            Number.parseFloat(style.paddingRight);
          return [
            {
              label: label.textContent?.trim() ?? "",
              slack: Math.round(inner - used - gaps),
            },
          ];
        }),
    );
    await you(page).dispatchEvent("click");
    expect(rows.length, JSON.stringify(rows)).toBeGreaterThanOrEqual(5);
    expect(
      rows.filter((row) => row.slack < 16),
      "every row keeps 16px of slack",
    ).toEqual([]);
  });

  await test.step("the avatar carries a dot while reports are unread", async () => {
    // Waited for: the dot is drawn two answers after the page is, the token's
    // claims and then the newest report.
    await expect
      .poll(async () => (await dots(page)).onAvatar)
      .toBeGreaterThan(0);
  });

  await test.step("reading them", async () => {
    await page.goto("/#/feedback");
    await expect(body, "both reports are listed").toContainText(nonce, {
      useInnerText: true,
    });
    await expect(body).toContainText("calendar view", { useInnerText: true });
    // Both reports are new to this operator, so both are marked.
    expect((await dots(page)).marks, "every unread report is marked").toBe(2);
    const listed = await bodyText(page);
    // Newest first, which is the only ordering a reader has.
    expect(listed.indexOf(nonce), "newest first").toBeLessThan(
      listed.indexOf("calendar view"),
    );
    // The same document the dot was just seen on, since getting here was a
    // fragment move: it going is the unread answer changing, where a page that
    // has not asked yet has no dot either.
    await expect
      .poll(async () => (await dots(page)).onAvatar, {
        message: "showing them is what clears the dot",
      })
      .toBe(0);
  });

  await test.step("clearing one", async () => {
    // One tap, and it is gone: there is no confirm behind this.
    await page.locator('button[aria-label="Delete"]').first().click();
    await expect(body, "it leaves the screen").not.toContainText(nonce, {
      useInnerText: true,
    });
    await expect
      .poll(
        async () =>
          (await firestore.list("feedback")).map((document) =>
            text(document.fields?.text),
          ),
        { message: "and the database, without taking the other with it" },
      )
      .toEqual([older]);
  });

  // A full load, so the answer comes from the stored mark and not from state
  // the last screen left behind.
  await test.step("and it stays cleared on the next load", async () => {
    expect(
      (await firestore.read(`users/${uid}/settings/prefs`))?.feedbackSeenAt,
      "the seen mark is stored",
    ).toBeTruthy();
    await page.goto("about:blank");
    await page.goto("/");
    // A fresh page has no dot before it has asked, either. The inbox row is
    // drawn off the same claims the question waits on, so once it shows the
    // question is out, and nothing on screen says when the answer is back.
    expect(await menuRows(page), "the operator's claims are read").toMatch(
      /Feedback inbox/,
    );
    await linger(page);
    expect((await dots(page)).onAvatar, "no dot once it has been read").toBe(0);
  });

  // `backdrop-filter` makes an element a containing block for its `fixed`
  // descendants, and the DESKTOP top bar carries one, so a sheet rendered in
  // the menu that lives there is trapped in the bar. Only ≥md can show it.
  await test.step("the sheet covers the app, not the header", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("about:blank");
    await page.goto("/");
    await you(page).click();
    await page
      .getByRole("menuitem", { name: "Send feedback", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    const backdrop = page.locator('button[aria-label="Dismiss"]');
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await page.waitForTimeout(900);
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    const back = await backdrop.boundingBox();
    const sheet = await panel.boundingBox();
    expect(Math.round(back?.y ?? -1), "the backdrop covers the viewport").toBe(
      0,
    );
    expect(back?.height ?? 0).toBeGreaterThanOrEqual(viewport.height - 2);
    // Centered, so it sits in the middle of the app rather than under the bar.
    expect(
      sheet?.y ?? 0,
      "the sheet sits in the middle of the page",
    ).toBeGreaterThan(viewport.height / 8);
  });

  await firestore.remove("feedback/seed_older");
});
