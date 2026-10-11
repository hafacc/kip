// The client half of leaving, which the teardown test cannot reach: that one
// is the server finishing the job, this one is the person watching it happen.

import { EmulatedFirestore, int, str, ts } from "../emulators.ts";
import {
  expect,
  freshEmail,
  linger,
  profile,
  signInByEmail,
  test,
} from "../fixtures.ts";

const firestore = new EmulatedFirestore();
// The welcome screen's tagline, which renders nowhere else.
const WELCOME = "Spare rooms and empty flats";

test("the app stands aside for leaving, and lets a stalled one be undone", async ({
  page,
}) => {
  const uid = await signInByEmail(page, freshEmail("leave-check"));
  await firestore.put(`users/${uid}`, profile("Leaver Under Test"));
  const body = page.locator("body");
  const requested = () => ts(new Date().toISOString());
  const gaveUp = () => ({
    requestedAt: requested(),
    phase: str("friends"),
    attempts: int(5),
    error: str("gave-up"),
  });

  await test.step("the app renders normally first", async () => {
    await page.goto("/");
    await expect(page.locator("nav [aria-current=page]").first()).toBeVisible();
    await expect(body).not.toContainText("Deleting your kip", {
      useInnerText: true,
    });
  });

  await test.step("the teardown starts while they are looking at it", async () => {
    await firestore.put(`deletions/${uid}`, { requestedAt: requested() });
    await expect(body, "kip stands aside for it, live").toContainText(
      "Deleting your kip",
      { useInnerText: true },
    );
    await expect(body, "and says it no longer needs them").toContainText(
      "finishes on its own",
      { useInnerText: true },
    );
    // The phase is the function's word, and this is what the app makes of it.
    await firestore.put(`deletions/${uid}`, {
      requestedAt: requested(),
      phase: str("friends"),
    });
    await expect(body, "the bar follows the phase").toContainText(
      "step 3 of 5",
      { useInnerText: true },
    );
  });

  // The state that used to read as onboarding.
  await test.step("and on a reload, with the profile already deleted", async () => {
    await firestore.remove(`users/${uid}`);
    await page.goto("about:blank");
    await page.goto("/");
    await expect(
      body,
      "it is still the teardown, never onboarding",
    ).toContainText("Deleting your kip", { useInnerText: true });
  });

  // The trigger has stopped trying, and this document is what the app gates
  // on — with no way to clear it the account was locked out of kip on every
  // device, and only an operator with the Admin SDK could undo it.
  await test.step("the teardown gives up", async () => {
    await firestore.put(`deletions/${uid}`, gaveUp());
    await expect(body, "it says so rather than spinning").toContainText(
      "couldn't finish",
      { useInnerText: true },
    );
    await expect(body, "and says what already happened").toContainText(
      "doesn't come back",
      { useInnerText: true },
    );
    await expect(body, "both ways out are offered").toContainText(
      "Try deleting again",
      { useInnerText: true },
    );
    await expect(body).toContainText("Keep my account", { useInnerText: true });
  });

  await test.step("keeping the account hands the app back, still signed in", async () => {
    await page.getByRole("button", { name: /Keep my account/ }).click();
    await expect
      .poll(() => firestore.exists(`deletions/${uid}`), {
        message: "keeping the account clears the request",
      })
      .toBe(false);
    // Not merely "no longer the deletion screen": clearing the request used to
    // read as the teardown FINISHING, signing them out of an account that is
    // still there. So it asks for the app's own navigation, which renders only
    // behind the sign-in gate (not the account menu, which waits for a display
    // name, and the profile was deleted above).
    const nav = page.locator('nav [aria-current="page"]').first();
    await expect(nav).toBeAttached();
    // The sign-out it used to cause came a beat after the app reappeared.
    await linger(page);
    await expect(nav, "and it stays").toBeAttached();
    await expect(body).not.toContainText("couldn't finish", {
      useInnerText: true,
    });
    await expect(body).not.toContainText(WELCOME, { useInnerText: true });
  });

  // A delete and a fresh create, so the function's attempt budget starts over
  // rather than resuming a dead one.
  await test.step("asking again from the failed state", async () => {
    await firestore.put(`deletions/${uid}`, gaveUp());
    await expect(body, "the failed state comes back").toContainText(
      "couldn't finish",
      { useInnerText: true },
    );
    // Dispatched rather than clicked: the profile is gone, so keeping the
    // account opened the name sheet, and `NameGate` declines to OPEN for a
    // deletion but does not close one already up, so it covers these controls.
    await page
      .getByRole("button", { name: /Try deleting again/ })
      .dispatchEvent("click");
    await expect(body, "asking again puts the teardown back").toContainText(
      "Deleting your kip",
      { useInnerText: true },
    );
    await expect
      .poll(
        async () => {
          const request = await firestore.read(`deletions/${uid}`);
          return request !== null && !("error" in request);
        },
        { message: "and the request is standing again" },
      )
      .toBe(true);
  });

  await test.step("the trigger finishes", async () => {
    await firestore.remove(`deletions/${uid}`);
    await expect(
      body,
      "the session ends rather than dropping them into a nameless kip",
    ).toContainText(WELCOME, { useInnerText: true });
    await expect(body).not.toContainText("Deleting your kip", {
      useInnerText: true,
    });
  });
});
