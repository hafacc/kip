// The host's side of a slot, which is the half the portal check cannot reach:
// that one is a visitor asking, this one is the person being asked. It ends on
// check-out instructions, which need a second person: a guest in a browser of
// their own sees them on a confirmed stay and not on one they only asked for.
//
// KIP_SHOTS=<dir> also saves 390px screenshots of the check-out surfaces, light
// and dark, for looking at.

import { mkdir } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import {
  APP_ORIGIN,
  continueUrl,
  EmulatedFirestore,
  emailCode,
  idToken,
  str,
  text,
  ts,
  uidOf,
} from "../emulators.ts";
import {
  askForLink,
  bodyText,
  booking,
  expect,
  FIXTURE_YEAR,
  flat,
  freshEmail,
  LISBON,
  linger,
  load,
  openWindow,
  profile,
  room,
  signInByEmail,
  test,
  watch,
} from "../fixtures.ts";

const firestore = new EmulatedFirestore();
const LISTING = "host-check-listing";
const WINDOW = "host-check-window";
const SHOTS = process.env.KIP_SHOTS;
const PLACE_TEXT = "Strip the beds.\nBins go out on Sunday.";
const ROOM_TEXT = "Attic door code is 4821.";

/** the sheet on top */
const top = (page: Page): Locator => page.getByRole("dialog").last();

/** a button by its accessible name */
const named = (root: Page | Locator, words: string): Locator =>
  root.getByRole("button", { name: words, exact: true });

async function shut(page: Page): Promise<void> {
  const dialogs = page.getByRole("dialog");
  // Waited out on the sheet that was on top leaving, not on a count: shutting
  // one that was opened from another puts the first one back.
  while ((await dialogs.count()) > 0) {
    const leaving = await dialogs.last().elementHandle();
    await page.keyboard.press("Escape");
    await leaving?.waitForElementState("hidden");
  }
}

/** each checkbox in a sheet, as its words and whether it is ticked */
async function ticks(sheet: Locator): Promise<string[]> {
  return sheet
    .getByRole("checkbox")
    .evaluateAll((boxes) =>
      boxes.map(
        (box) =>
          `${(box as HTMLElement).innerText.replace(/\n+/g, " ")}=${box.getAttribute("aria-checked")}`,
      ),
    );
}

/** the check-out field inside a root, by its label */
const checkoutArea = (root: Page | Locator): Locator =>
  root
    .locator("label")
    .filter({ hasText: /^Check-out instructions/ })
    .locator("textarea");

// Light and dark at phone width, then back to the size the checks run at.
async function shots(page: Page, name: string): Promise<void> {
  if (SHOTS) {
    await mkdir(SHOTS, { recursive: true });
    const size = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}.png` });
    }
    await page.emulateMedia({ colorScheme: null });
    if (size) {
      await page.setViewportSize(size);
    }
  }
}

async function houseWindows(house: string) {
  return firestore.list(`listings/${house}/windows`);
}

test("a host sees who asked, manages rooms, and writes check-out instructions", async ({
  page,
  browser,
  thrown,
}) => {
  // Per run: the emulator keeps its accounts for as long as it is up, so a
  // fixed address signs into the previous run's account and inherits its data.
  const email = freshEmail("host-check");
  let uid = "";

  await test.step("the host gets in through the email door", async () => {
    await askForLink(page, email);
    let code: string | undefined;
    await expect
      .poll(
        async () => {
          code = await emailCode(email);
          return code;
        },
        { message: "the emulator captured the link" },
      )
      .toBeTruthy();
    expect(await bodyText(page), "a link is sent").not.toContain("Couldn't");
    await page.goto(continueUrl(email, code ?? ""));
    // The link's whole job is to put someone back in kip.
    await expect(page, "returning lands in the app").not.toHaveURL(
      /\/continue\//,
    );
    await expect
      .poll(async () => (await uidOf(email)) ?? "", {
        message: "the link signs the host in",
      })
      .not.toBe("");
    uid = (await uidOf(email)) ?? "";
    // The app's own navigation first, which renders only behind the sign-in
    // gate, so the absence below is read off a page that has finished arriving.
    await expect(
      page.locator('nav [aria-current="page"]').first(),
    ).toBeAttached();
    // The button every failed or stalled link ends on.
    expect(await bodyText(page), "and not on an interstitial").not.toContain(
      "Open kip",
    );
    // The code is spent by now: carrying it into the app's URL would leave a
    // dead one-time link in history for Back to find.
    expect(page.url(), "the one-time code is left behind").not.toMatch(
      /oobCode/,
    );
    await page.goBack();
    expect(page.url(), "Back does not return to the spent link").not.toMatch(
      /\/continue\//,
    );
  });

  const year = FIXTURE_YEAR;
  await firestore.put(`users/${uid}`, profile("Host Under Test"));
  await firestore.put(`listings/${LISTING}`, {
    ownerId: str(uid),
    title: str("The tested room"),
    location: LISBON,
    type: str("ROOM"),
    description: str("A room"),
    photos: { arrayValue: {} },
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  const { roomId: _roomId, ...slot } = openWindow("11-01", "11-05");
  await firestore.put(`listings/${LISTING}/windows/${WINDOW}`, slot);
  for (const [id, guest, name, at] of [
    ["host-check-ask-1", "guest-early", "Early Asker", 1000],
    ["host-check-ask-2", "guest-late", "Late Asker", 2000],
  ] as const) {
    await firestore.put(`users/${guest}`, profile(name));
    await firestore.put(
      `bookings/${id}`,
      booking({
        listingId: LISTING,
        ownerId: uid,
        guestId: guest,
        windowId: WINDOW,
        start: `${year}-11-01`,
        end: `${year}-11-05`,
        status: "REQUESTED",
        createdAt: at,
      }),
    );
  }

  await test.step("the list says the slot has been asked about", async () => {
    // Reloaded: the app has sat since sign-in on an account with no profile,
    // so the name sheet it offers such an account is still up.
    await load(page, `/#/room/${LISTING}`);
    await expect(
      page.locator("body"),
      "the room is the host's own view",
    ).toContainText("Availability", { useInnerText: true });
    // Without this a slot two people are waiting on looks exactly like an
    // untouched one.
    await expect(page.locator("body"), "the row carries a count").toContainText(
      /2 asked/,
      { useInnerText: true },
    );
  });

  await test.step("opening the slot shows who asked", async () => {
    await page
      .locator("[role=button], button")
      .filter({ hasText: /asked/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog").first();
    await expect(sheet).toContainText("Late Asker");
    const shown = await sheet.innerText();
    expect(shown, "both askers are named").toContain("Early Asker");
    // Oldest first: who asked first is the only ordering the host has reason
    // to read.
    expect(shown.indexOf("Early Asker"), "oldest first").toBeLessThan(
      shown.indexOf("Late Asker"),
    );
    // Above the date fields, so the confirm that cancels them is legible
    // before a date is touched.
    expect(
      shown.indexOf("Early Asker"),
      "they sit above the dates",
    ).toBeLessThan(shown.indexOf("From"));
    // The sheet is component state: leaving for a booking and coming back has
    // to go through the URL.
    expect(
      await page.evaluate(() => location.hash),
      "the open slot is in the URL",
    ).toContain(`/slot/${WINDOW}`);
  });

  // Confirming does not cancel the losers — `confirmBooking` touches only the
  // winner and the window — and nothing else reaches them from these dates.
  await test.step("a booked slot still shows who missed out, below the stay", async () => {
    await firestore.put(
      "bookings/host-check-won",
      booking({
        listingId: LISTING,
        ownerId: uid,
        guestId: "guest-early",
        windowId: WINDOW,
        start: `${year}-11-01`,
        end: `${year}-11-05`,
        status: "CONFIRMED",
        createdAt: 500,
      }),
    );
    await firestore.put(`listings/${LISTING}/windows/${WINDOW}`, {
      ...slot,
      status: str("BOOKED"),
      bookingId: str("host-check-won"),
    });
    await load(page, `/#/room/${LISTING}/slot/${WINDOW}`);
    await expect(page.locator("body"), "the stay is named").toContainText(
      "Confirmed",
      { useInnerText: true },
    );
    await expect(
      page.locator("body"),
      "the losers are still listed",
    ).toContainText(/people asked/, { useInnerText: true });
    const held = await bodyText(page);
    // The stay that HOLDS the nights outranks the asks that missed them.
    expect(held.indexOf("Confirmed"), "the stay comes first").toBeLessThan(
      held.indexOf("people asked"),
    );
    // These can never be confirmed, since `bookingMatchesOpenSlot` requires an
    // OPEN slot, and the sheet has to say so.
    expect(held, "and says they can only be declined").toContain(
      "went to someone else",
    );
  });

  // A sheet is an overlay on the room, not a different screen. Counted as one,
  // the page under it jumped to the top on open and again on close.
  await test.step("opening a slot keeps the host's place in the list", async () => {
    await firestore.put(`listings/${LISTING}/windows/${WINDOW}`, slot);
    await load(page, `/#/room/${LISTING}`);
    const row = page
      .locator("[role=button], button")
      .filter({ hasText: /nights/ })
      .first();
    await expect(row).toBeVisible();
    const where = () =>
      page.evaluate(() => {
        const scroller =
          document.querySelector("main") ?? document.scrollingElement;
        return Math.round(scroller?.scrollTop || window.scrollY);
      });
    await page.evaluate(() => {
      const scroller =
        document.querySelector("main") ?? document.scrollingElement;
      scroller?.scrollTo({ top: 400, behavior: "instant" });
      window.scrollTo({ top: 400, behavior: "instant" });
    });
    await expect
      .poll(where, { message: "the page scrolls at this size" })
      .toBeGreaterThan(0);
    const before = await where();
    await row.evaluate((element) => (element as HTMLElement).click());
    // Without this the check passes by doing nothing: a click that never
    // opened the sheet never navigates, so nothing could have scrolled.
    await expect(page.locator("body"), "the sheet opened").toContainText(
      "Save changes",
      { useInnerText: true },
    );
    await expect(page, "and it is in the URL").toHaveURL(/\/slot\//);
    await linger(page);
    expect(
      Math.abs((await where()) - before),
      "the scroll position survives opening a slot",
    ).toBeLessThan(40);
  });

  // Per run: this section ADDS dates, so a fixed id would clash with the ones
  // an earlier run left.
  const house = `host-check-house-${Date.now()}`;
  await firestore.put(`listings/${house}`, {
    ownerId: str(uid),
    title: str("The tested house"),
    location: LISBON,
    type: str("HOUSE"),
    description: str("A house"),
    photos: { arrayValue: {} },
    rooms: {
      mapValue: {
        fields: {
          "room-back": room("Back bedroom", "Ground floor", 0),
          "room-attic": room("Attic room", "", 1),
          "room-garden": room("Garden studio", "", 2),
        },
      },
    },
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  // Seeded attic-first, so the order on screen is the sort's doing and not the
  // order the documents arrived in.
  await firestore.put(
    `listings/${house}/windows/a-attic`,
    openWindow("11-06", "11-09", "room-attic"),
  );
  await firestore.put(
    `listings/${house}/windows/b-back`,
    openWindow("11-06", "11-09", "room-back"),
  );
  await firestore.put(
    `listings/${house}/windows/c-whole`,
    openWindow("11-20", "11-29"),
  );
  await firestore.put(`listings/${house}/windows/d-back-taken`, {
    ...openWindow("10-09", "10-12", "room-back"),
    status: str("BOOKED"),
    bookingId: str(`${house}-stay`),
  });
  const houseBooking = (
    windowId: string,
    start: string,
    end: string,
    status: "REQUESTED" | "CONFIRMED",
    guestId = "guest-early",
  ) =>
    booking({
      listingId: house,
      ownerId: uid,
      guestId,
      windowId,
      start: `${year}-${start}`,
      end: `${year}-${end}`,
      status,
      createdAt: 1000,
    });
  await firestore.put(
    `bookings/${house}-stay`,
    houseBooking("d-back-taken", "10-09", "10-12", "CONFIRMED"),
  );
  await firestore.put(
    `bookings/${house}-ask`,
    houseBooking("b-back", "11-06", "11-09", "REQUESTED"),
  );

  await test.step("a house with rooms lists them, and says what each set of dates offers", async () => {
    await page.goto(`/#/room/${house}`);
    await expect(page.locator("body")).toContainText("Garden studio", {
      useInnerText: true,
    });
    await expect(page.locator("body")).toContainText(/Back bedroom · Nov 6/, {
      useInnerText: true,
    });
    const shown = await bodyText(page);
    const rows = await page
      .locator("button")
      .filter({ hasText: /nights/ })
      .evaluateAll((buttons) =>
        buttons.map((button) =>
          (button as HTMLElement).innerText.replace(/\n+/g, " | "),
        ),
      );
    // The chip is upper-cased by CSS, and innerText reports it as drawn.
    expect(shown, "the type chip counts the rooms").toMatch(/house · 3 rooms/i);
    const order = ["Back bedroom", "Attic room", "Garden studio"].map((words) =>
      shown.indexOf(words),
    );
    expect(order[0], "the rooms are listed").toBeGreaterThan(-1);
    expect(order, "the rooms are listed in order").toEqual(
      [...order].sort((left, right) => left - right),
    );
    const offers = (...patterns: RegExp[]) =>
      rows.some((row) => patterns.every((pattern) => pattern.test(row)));
    expect(
      offers(/Nov 20/, /Whole house/) &&
        offers(/Nov 6/, /Attic room/) &&
        offers(/Oct 9/, /Back bedroom/, /Booked/),
      `each set of dates says what it offers: ${rows.join(" || ")}`,
    ).toBe(true);
    // By start date, then in the Rooms list's order, so two rooms offering the
    // same nights sit together the same way round every time.
    const nov6 = rows.filter((row) => /Nov 6/.test(row));
    expect(nov6, "same dates sort by room order").toHaveLength(2);
    expect(nov6[0]).toMatch(/Back bedroom/);
    expect(nov6[1]).toMatch(/Attic room/);
    expect(shown, "a guest's row names the room").toMatch(
      /Back bedroom · Oct 9/,
    );
    expect(shown).toMatch(/Back bedroom · Nov 6/);
  });

  await test.step("add dates starts on every room, and adds one set for each", async () => {
    await named(page, "Add dates").first().click();
    const sheet = top(page);
    await expect(sheet.getByRole("checkbox")).toHaveCount(3);
    const ticked = await ticks(sheet);
    expect(
      ticked.every((tick) => tick.endsWith("=true")),
      `every room starts ticked: ${ticked}`,
    ).toBe(true);
    const before = await sheet.innerText();
    expect(before, "there is no every-room row").not.toMatch(/Every room/);
    expect(before, "the caption counts the sets").toContain(
      "Adds 3 sets of dates, one for each room.",
    );
    const dates = sheet.locator("input[type=date]");
    await dates.nth(0).fill(`${year}-12-04`);
    await dates.nth(1).fill(`${year}-12-07`);
    const add = named(sheet, "Add dates").last();
    await expect(add).toBeEnabled();
    await add.click();
    await expect(
      page.getByRole("dialog"),
      "the sheet closes once added",
    ).toHaveCount(0);
    await expect
      .poll(
        async () => {
          const added = (await houseWindows(house)).filter(
            (document) => text(document.fields?.start) === `${year}-12-04`,
          );
          const rooms = added.map((document) => text(document.fields?.roomId));
          return [
            added.length,
            new Set(rooms).size,
            rooms.every((id) => id?.startsWith("room-")),
          ];
        },
        { message: "one set of dates per room reached the database" },
      )
      .toEqual([3, 3, true]);
  });

  await test.step("the whole house can't be free on nights a room has its own dates", async () => {
    await named(page, "Add dates").first().click();
    const sheet = top(page);
    await expect(sheet.getByRole("checkbox")).toHaveCount(3);
    await named(sheet, "Whole house").click();
    await expect(
      sheet.getByRole("checkbox"),
      "choosing the whole house hides the rooms",
    ).toHaveCount(0);
    const dates = sheet.locator("input[type=date]");
    await dates.nth(0).fill(`${year}-11-04`);
    await dates.nth(1).fill(`${year}-11-08`);
    await expect(sheet, "the clash names the room and says why").toContainText(
      "Overlaps the Back bedroom's Nov 6 – Nov 9 dates. The whole house can't be free while a room has its own dates.",
    );
    await expect(
      named(sheet, "Add dates").last(),
      "and the dates can't be added",
    ).toBeDisabled();
    await shut(page);
  });

  await test.step("add dates from one room's sheet ticks only that room", async () => {
    await named(page, "Attic room").first().click();
    const roomSheet = top(page);
    await expect(roomSheet).toContainText("Remove room");
    const roomText = await roomSheet.innerText();
    for (const words of [
      "Share this room",
      "Create link for this room",
      "Add dates",
      "Remove room",
    ]) {
      expect(
        roomText,
        "the room sheet offers its link, dates and removal",
      ).toContain(words);
    }
    await named(roomSheet, "Add dates").click();
    const sheet = top(page);
    await expect(sheet.getByRole("checkbox")).toHaveCount(3);
    expect(
      (await ticks(sheet)).filter((tick) => tick.endsWith("=true")),
      "only that room is ticked",
    ).toEqual(["Attic room=true"]);
    expect(await sheet.innerText(), "and the caption says one set").toContain(
      "Adds 1 set of dates.",
    );
    await shut(page);
  });

  await test.step("removing a room says what it cancels, then cancels it", async () => {
    await firestore.put(`listings/${house}/checkout/room-back`, {
      text: str("Leave the back door key."),
    });
    await named(page, "Back bedroom").first().click();
    const roomSheet = top(page);
    await named(roomSheet, "Remove room").click();
    const confirm = top(page);
    await expect(
      confirm,
      "the confirm counts the stays and asks",
    ).toContainText("It cancels 1 upcoming stay and 1 ask");
    await named(confirm, "Remove room").last().click();
    await expect(
      page.getByRole("dialog"),
      "the room leaves the page",
    ).toHaveCount(0);
    await expect(page.locator("body")).toContainText(/house · 2 rooms/i, {
      useInnerText: true,
    });
    await expect
      .poll(
        async () => {
          const after = await firestore.read(`listings/${house}`);
          const rooms = after?.rooms;
          return rooms && "mapValue" in rooms
            ? Object.keys(rooms.mapValue.fields ?? {}).sort()
            : [];
        },
        { message: "the room is gone from the place" },
      )
      .toEqual(["room-attic", "room-garden"]);
    await expect
      .poll(
        async () => {
          const left = await houseWindows(house);
          return [
            left.some(
              (document) => text(document.fields?.roomId) === "room-back",
            ),
            left.some(
              (document) => text(document.fields?.roomId) === "room-attic",
            ),
            left.some((document) => document.name.endsWith("/c-whole")),
          ];
        },
        { message: "its dates went with it, and nobody else's" },
      )
      .toEqual([false, true, true]);
    // A removed room's instructions would otherwise sit under an id nothing
    // names.
    expect(
      await firestore.read(`listings/${house}/checkout/room-back`),
      "its check-out instructions went with it",
    ).toBeNull();
    for (const id of [`${house}-stay`, `${house}-ask`]) {
      const fields = (await firestore.read(`bookings/${id}`)) ?? {};
      expect(
        [
          text(fields.status),
          text(fields.cancelledBy),
          text(fields.cancelReason),
        ],
        `${id.endsWith("stay") ? "the stay" : "the ask"} is cancelled as the host's doing`,
      ).toEqual(["CANCELLED", uid, "SLOT_CANCELLED"]);
    }
  });

  await test.step("the host writes check-out instructions for the place and for a room", async () => {
    await page.goto(`/#/room/${house}/edit`);
    const area = checkoutArea(page);
    await expect(area).toBeEnabled();
    expect(
      await area.locator("xpath=ancestor::label").innerText(),
      "the place form has the field and says who sees it",
    ).toContain("Only guests with a confirmed stay see this.");
    await area.fill(PLACE_TEXT);
    await area.scrollIntoViewIfNeeded();
    await shots(page, "form-field");
    await named(page, "Save changes").click();
    await expect
      .poll(async () => firestore.read(`listings/${house}/checkout/place`), {
        message: "the place's instructions reached the database",
      })
      .toEqual({ text: { stringValue: PLACE_TEXT } });
    await expect(page, "the host's own page shows what is set").toHaveURL(
      /#\/room\/[^/]+$/,
    );
    await expect(page.locator("body")).toContainText("Check-out instructions", {
      useInnerText: true,
    });
    await expect(page.locator("body")).toContainText("Bins go out on Sunday.", {
      useInnerText: true,
    });

    await named(page, "Attic room").first().click();
    const roomArea = checkoutArea(top(page));
    await expect(roomArea).toBeEnabled();
    expect(
      await roomArea.locator("xpath=ancestor::label").innerText(),
      "the room sheet has the field too",
    ).toContain("Only guests with a confirmed stay see this.");
    await roomArea.fill(ROOM_TEXT);
    await roomArea.scrollIntoViewIfNeeded();
    await shots(page, "room-sheet");
    await named(top(page), "Save changes").click();
    await expect
      .poll(
        async () =>
          text(
            (await firestore.read(`listings/${house}/checkout/room-attic`))
              ?.text,
          ),
        { message: "the room's instructions reached the database" },
      )
      .toBe(ROOM_TEXT);
    await shut(page);
    // Every friend reads the listing, so the text must not have landed on it.
    const listing = JSON.stringify(await firestore.read(`listings/${house}`));
    expect(listing, "none of it is on the listing itself").not.toContain(
      "4821",
    );
    expect(listing).not.toContain("Bins go out");
  });

  await test.step("a new place carries its instructions, and its rooms' with it", async () => {
    await page.goto("/#/new-place");
    await page.locator("#listing-title").fill("Made with instructions");
    await named(page, "House").click();
    await page.locator("input[aria-label=Address]").fill("Lisbon");
    await checkoutArea(page).fill("Lock up when you go.");
    await named(page, "Add a room").click();
    const sheet = top(page);
    await sheet.locator("input").first().fill("Box room");
    await checkoutArea(sheet).fill("Window latch sticks.");
    await named(sheet, "Add room").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await named(page, "Add place").click();
    // Longer than the default: adding the place looks "Lisbon" up over the
    // network first.
    await expect(page, "the place is created").toHaveURL(/#\/room\/[^/]+$/, {
      timeout: 60_000,
    });
    const made = /#\/room\/([^/]+)$/.exec(page.url())?.[1] ?? "";
    await expect
      .poll(
        async () => {
          const rooms = (await firestore.read(`listings/${made}`))?.rooms;
          const roomIds =
            rooms && "mapValue" in rooms
              ? Object.keys(rooms.mapValue.fields ?? {})
              : [];
          const saved = await firestore.list(`listings/${made}/checkout`);
          return Object.fromEntries(
            saved.map((document) => [
              document.name.split("/").pop() === roomIds[0]
                ? "room"
                : document.name.split("/").pop(),
              text(document.fields?.text),
            ]),
          );
        },
        {
          message: "the place's and the room's instructions were saved with it",
        },
      )
      .toEqual({ place: "Lock up when you go.", room: "Window latch sticks." });
  });

  const guestEmail = freshEmail("host-check-guest");
  const guestContext = await browser.newContext({
    viewport: { width: 430, height: 932 },
  });
  const guest = await guestContext.newPage();
  watch(guest, thrown);
  const stay = `${house}-guest-stay`;
  const ask = `${house}-guest-ask`;

  let guestUid = "";
  await test.step("a guest signs in, with a stay and an ask", async () => {
    guestUid = await signInByEmail(guest, guestEmail);
    await firestore.put(`users/${guestUid}`, profile("Guest Under Test"));
    await firestore.put(`listings/${house}/windows/e-attic-stay`, {
      ...openWindow("09-02", "09-05", "room-attic"),
      status: str("BOOKED"),
      bookingId: str(stay),
    });
    await firestore.put(
      `bookings/${stay}`,
      houseBooking("e-attic-stay", "09-02", "09-05", "CONFIRMED", guestUid),
    );
    // The ask is at the OTHER place, where this guest has no stay at all, so it
    // is the rules refusing them, not just the page declining to ask.
    await firestore.put(`listings/${LISTING}/checkout/place`, {
      text: str("Never shown to an asker."),
    });
    await firestore.put(
      `bookings/${ask}`,
      booking({
        listingId: LISTING,
        ownerId: uid,
        guestId: guestUid,
        windowId: WINDOW,
        start: `${year}-11-01`,
        end: `${year}-11-05`,
        status: "REQUESTED",
        createdAt: 3000,
      }),
    );
  });

  await test.step("a guest reads them on a confirmed stay", async () => {
    // The app claims the guest's pointer off their trips. Until it lands the
    // place cannot be read, and a page loaded before then names no room.
    await expect
      .poll(() => firestore.exists(`listings/${house}/guests/${guestUid}`))
      .toBe(true);
    await load(guest, `${APP_ORIGIN}/#/booking/${stay}`);
    const section = guest.locator("section").filter({
      has: guest.getByRole("heading", { name: "Checking out", exact: true }),
    });
    await expect(section).toContainText(ROOM_TEXT);
    await section.scrollIntoViewIfNeeded();
    expect(await bodyText(guest), "the stay is confirmed and theirs").toMatch(
      /Your stay is all set/,
    );
    const shown = await section.innerText();
    expect(shown, "it has a Checking out section").toMatch(/^Checking out/);
    expect(shown, "the place's comes first").toContain("Strip the beds.");
    expect(
      shown.indexOf("Bins go out on Sunday."),
      `then the room's: ${flat(shown)}`,
    ).toBeLessThan(shown.indexOf(ROOM_TEXT));
    expect(
      shown.slice(
        shown.indexOf("Bins go out on Sunday."),
        shown.indexOf(ROOM_TEXT),
      ),
      "the room's part is named for the room",
    ).toContain("Attic room");
    expect(shown, "line breaks survive").toMatch(
      /Strip the beds\.\n+Bins go out/,
    );
    const wraps = await section
      .locator("p")
      .evaluateAll((paragraphs) =>
        paragraphs.map((paragraph) => getComputedStyle(paragraph).whiteSpace),
      );
    expect(
      wraps.every((wrap) => wrap === "pre-wrap"),
      `every part keeps its line breaks: ${JSON.stringify(wraps)}`,
    ).toBe(true);
    await shots(guest, "guest-booking");
  });

  await test.step("and is shown none on a stay they only asked for", async () => {
    await guest.goto(`${APP_ORIGIN}/#/booking/${ask}`);
    await expect(guest.locator("body"), "the ask is pending").toContainText(
      /Waiting on/,
      { useInnerText: true },
    );
    await linger(guest);
    const shown = await bodyText(guest);
    expect(shown, "a pending ask shows no instructions").not.toMatch(
      /Checking out/,
    );
    expect(shown).not.toMatch(/Never shown/);
  });

  // Asked for directly, as a crafted client would: the rules are what keep an
  // asker out, and a guest of one place out of another's.
  await test.step("the rules refuse them any instructions but their own stay's", async () => {
    const asGuest = {
      headers: { Authorization: `Bearer ${await idToken(guestEmail)}` },
    };
    const status = async (path: string) =>
      (await fetch(`${firestore.root}/${path}`, asGuest)).status;
    expect(
      await status(`listings/${LISTING}/checkout/place`),
      "the rules refuse them the document",
    ).toBe(403);
    // The same token against their own stay's, or the 403 above proves only
    // that the token was no good.
    expect(
      await status(`listings/${house}/checkout/place`),
      "while allowing them their own stay's",
    ).toBe(200);
    expect(
      await status(`listings/${house}/checkout/room-garden`),
      "but not another room's",
    ).toBe(403);
  });
  await guestContext.close();
});
