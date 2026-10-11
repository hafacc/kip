// The share-link path, as a visitor: the link resolves, the ask opens the
// identity sheet, and what it leaves behind is a REQUESTED booking and a
// profile carrying the typed name. Run it after touching the portal page, the
// identity sheet, or `src/lib/auth.ts`.

import {
  EmulatedFirestore,
  type Fields,
  nul,
  str,
  text,
  ts,
} from "../emulators.ts";
import {
  bodyText,
  expect,
  FIXTURE_YEAR,
  flat,
  LISBON,
  linger,
  load,
  location,
  openWindow,
  profile,
  room,
  test,
} from "../fixtures.ts";

const firestore = new EmulatedFirestore();
// Per run: the emulator keeps its data for as long as it is up, so a fixed host
// would find the booking an earlier run left behind and pass on it.
const RUN = Date.now();

function portal(fields: Fields): Fields {
  return {
    ownerPhotoURL: nul(),
    createdAt: ts("2026-08-01T00:00:00Z"),
    ...fields,
  };
}

test("a share link resolves, and asking through it sends a request", async ({
  page,
}) => {
  const host = `host-portal-check-${RUN}`;
  const token = await seedProfileLink(host, RUN);

  await test.step("the share link resolves", async () => {
    await page.goto(`/portal/#${token}`);
    const body = page.locator("body");
    await expect(body).toContainText("Sam Host", { useInnerText: true });
    await expect(body).toContainText("The spare room", { useInnerText: true });
    const shown = await bodyText(page);
    expect(shown, "does not report the link as inactive").not.toContain(
      "isn't active",
    );
    expect(
      shown.includes("Ask to be friends") || shown.includes("Request"),
      "offers to ask",
    ).toBe(true);
  });

  const sheet = page.getByRole("dialog");
  await test.step("asking opens the identity sheet", async () => {
    await page
      .getByRole("button", { name: /ask|request/i })
      .first()
      .click();
    await expect(sheet).toBeVisible();
    await expect(
      page.locator("input"),
      "a sheet with fields opens",
    ).toHaveCount(2);
    // Google is its own path, below the submit after a divider, because it
    // authenticates FIRST and takes the name from the account, not the form.
    const words = await sheet.innerText();
    expect(words, "Google is offered").toContain("with Google");
    expect(
      words.indexOf("with Google"),
      `Google is below the submit: ${flat(words)}`,
    ).toBeGreaterThan(words.indexOf("Send request"));
    expect(words.indexOf("Send request")).toBeGreaterThan(-1);
  });

  await test.step("asking actually sends", async () => {
    await page.locator("input").first().fill("Wandering Guest");
    const submit = page.locator("button[type=submit]");
    await expect(submit, "submit is enabled with a valid name").toBeEnabled();
    await submit.click();
  });

  // A booking deliberately carries no name — the host reads it off the profile
  // through the `knownBy` hop — so the two are checked separately.
  await test.step("a REQUESTED booking reaches the host", async () => {
    await expect
      .poll(
        async () => (await firestore.where("bookings", "ownerId", host)).length,
      )
      .toBeGreaterThan(0);
    await linger(page);
    const bookings = await firestore.where("bookings", "ownerId", host);
    expect(bookings, "exactly one request reached the host").toHaveLength(1);
    const fields = bookings[0]?.fields ?? {};
    expect(
      text(fields.status),
      "it is REQUESTED, never confirmed from a link",
    ).toBe("REQUESTED");
    expect(text(fields.start), "it holds the dates that were shown").toMatch(
      /-10-01$/,
    );
    const guest = text(fields.guestId) ?? "";
    await expect
      .poll(
        async () => text((await firestore.read(`users/${guest}`))?.displayName),
        { message: "the guest's profile carries the name they typed" },
      )
      .toBe("Wandering Guest");
  });

  // Its own host, so the profile link above keeps exactly the one place it
  // asserts on. The same visitor asks, now that they have a name.
  const roomHost = `host-rooms-check-${RUN}`;
  await seedHouse(roomHost);
  const main = page.locator("main");
  await test.step("the room link shows the room and nothing else", async () => {
    await load(page, `/portal/#${ROOM_TOKEN}`);
    await expect(main).toContainText("Erik Host", { useInnerText: true });
    await expect(main, "it shows that room's open dates").toContainText(
      "Nov 6 – Nov 9",
      { useInnerText: true },
    );
    const shown = await main.innerText();
    expect(shown, "the room link resolves").not.toContain("isn't active");
    expect(shown, "it shows the room").toContain("Back bedroom");
    expect(shown).toContain("Ground floor, double bed");
    expect(shown, "it names the house it is in").toContain(
      "In The tall house · Oakland, CA",
    );
    expect(
      shown.match(/Request/g) ?? [],
      "one set of dates to ask for",
    ).toHaveLength(1);
    for (const elsewhere of [
      "Attic room",
      "Nov 13",
      "Nov 20",
      "Whole house",
      "A house with rooms",
    ]) {
      expect(shown, "and nothing else in the house").not.toContain(elsewhere);
    }
  });

  await test.step("asking through a room link lands as a request that says so", async () => {
    await main.getByRole("button", { name: "Request", exact: true }).click();
    await expect(main, "the page says it was sent").toContainText("Requested", {
      useInnerText: true,
    });
    expect(await main.innerText()).not.toContain("didn't go through");
    await expect
      .poll(
        async () =>
          (await firestore.where("bookings", "ownerId", roomHost)).length,
      )
      .toBeGreaterThan(0);
    await linger(page);
    const asks = await firestore.where("bookings", "ownerId", roomHost);
    expect(asks, "exactly one request reached that host").toHaveLength(1);
    const ask = asks[0]?.fields ?? {};
    expect(text(ask.status)).toBe("REQUESTED");
    expect(text(ask.via), "marked as coming through a room link").toBe("ROOM");
    expect(text(ask.windowId), "it is for the room's own dates").toBe("back");
    expect(text(ask.start)).toBe(`${FIXTURE_YEAR}-11-06`);
  });

  await test.step("the house's link groups dates under the whole house and each room", async () => {
    await load(page, `/portal/#${HOUSE_TOKEN}`);
    await expect(main, "the house link resolves").toContainText(
      "The tall house",
      { useInnerText: true },
    );
    // The ask made through the room's link shows here too.
    await expect
      .poll(async () => {
        const shown = await main.innerText();
        return [
          (shown.match(/Requested/g) ?? []).length,
          (shown.match(/Request\b/g) ?? []).length,
        ];
      })
      .toEqual([1, 2]);
    const shown = await main.innerText();
    // Upper-cased by CSS, and innerText reports it as drawn.
    expect(shown, "the chip counts the rooms").toMatch(/house · 2 rooms/i);
    const order = [
      "Whole house",
      "Nov 20",
      "Back bedroom",
      "Nov 6",
      "Attic room",
      "Nov 13",
    ].map((words) => shown.indexOf(words));
    expect(order[0], "the whole house is listed").toBeGreaterThan(-1);
    expect(
      order,
      `whole house first, then the rooms in order: ${flat(shown)}`,
    ).toEqual([...order].sort((left, right) => left - right));
  });
});

const ROOM_TOKEN = `portal-check-room-token-${RUN}`;
const HOUSE_TOKEN = `portal-check-house-token-${RUN}`;

async function seedHouse(host: string): Promise<void> {
  const house = `portal-check-house-${RUN}`;
  const roomToken = ROOM_TOKEN;
  const houseToken = HOUSE_TOKEN;
  await firestore.put(`users/${host}`, profile("Erik Host"));
  await firestore.put(`listings/${house}`, {
    ownerId: str(host),
    title: str("The tall house"),
    location: location("Oakland, CA", 37.8, -122.27, "9q9p1d"),
    type: str("HOUSE"),
    description: str("A house with rooms"),
    photos: { arrayValue: {} },
    publicPortalId: str(houseToken),
    rooms: {
      mapValue: {
        fields: {
          "room-back": room(
            "Back bedroom",
            "Ground floor, double bed",
            0,
            roomToken,
          ),
          "room-attic": room("Attic room", "Up a steep ladder", 1),
        },
      },
    },
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  // What `publishRoomPortal` writes: the room's own copy, and where it is.
  await firestore.put(
    `portals/${roomToken}`,
    portal({
      scope: str("ROOM"),
      ownerId: str(host),
      ownerName: str("Erik Host"),
      listingId: str(house),
      roomId: str("room-back"),
      room: {
        mapValue: {
          fields: {
            name: str("Back bedroom"),
            note: str("Ground floor, double bed"),
            photos: { arrayValue: {} },
            houseTitle: str("The tall house"),
            houseType: str("HOUSE"),
            locationLabel: str("Oakland, CA"),
          },
        },
      },
    }),
  );
  await firestore.put(
    `portals/${houseToken}`,
    portal({
      scope: str("LISTING"),
      ownerId: str(host),
      ownerName: str("Erik Host"),
      listingId: str(house),
    }),
  );
  await firestore.put(
    `listings/${house}/windows/back`,
    openWindow("11-06", "11-09", "room-back"),
  );
  await firestore.put(
    `listings/${house}/windows/attic`,
    openWindow("11-13", "11-16", "room-attic"),
  );
  await firestore.put(
    `listings/${house}/windows/whole`,
    openWindow("11-20", "11-29"),
  );
}

// A fresh visitor: one who already has a name is never shown the field.
test("the reach field routes on what was typed, not on its mode", async ({
  page,
}) => {
  const host = `host-reach-check-${RUN}`;
  const token = await seedProfileLink(host, `reach-${RUN}`);
  const sheet = page.getByRole("dialog");
  // The mode sets the keyboard, never the verdict.
  await test.step("a phone number typed in email mode is accepted", async () => {
    await load(page, `/portal/#${token}`);
    await page.getByRole("button", { name: /ask to be friends/i }).click();
    await expect(sheet).toBeVisible();
    const inputs = page.locator("input");
    expect(
      await inputs.count(),
      "the sheet has a reach field",
    ).toBeGreaterThanOrEqual(2);
    const reach = inputs.last();
    await expect(reach, "the field starts in email mode").toHaveAttribute(
      "inputmode",
      "email",
    );
    await inputs.first().fill("Number Typer");
    await reach.fill("(415) 555-0123");
    await expect(page.locator("button[type=submit]")).toBeEnabled();
    expect(await bodyText(page)).not.toContain("not an email or a US number");
  });
});

async function seedProfileLink(
  host: string,
  run: string | number,
): Promise<string> {
  const token = `portal-check-token-${run}`;
  const listing = `portal-check-listing-${run}`;
  await firestore.put(`users/${host}`, profile("Sam Host"));
  await firestore.put(`users/${host}/settings/prefs`, {
    profilePortalId: str(token),
  });
  await firestore.put(
    `portals/${token}`,
    portal({
      scope: str("USER"),
      ownerId: str(host),
      ownerName: str("Sam Host"),
    }),
  );
  await firestore.put(`listings/${listing}`, {
    ownerId: str(host),
    title: str("The spare room"),
    location: LISBON,
    type: str("ROOM"),
    description: str("A room"),
    photos: { arrayValue: {} },
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  await firestore.put(`listings/${listing}/windows/w1`, {
    ...openWindow("10-01", "10-05"),
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  return token;
}
