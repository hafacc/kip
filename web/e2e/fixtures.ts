/**
 * The Playwright `test` the browser checks share, plus the email door and the
 * seed shapes they all build on.
 */

import { test as base, expect, type Page } from "@playwright/test";
import {
  APP_ORIGIN,
  bool,
  continueUrl,
  double,
  emailCode,
  type Fields,
  int,
  map,
  nul,
  str,
  ts,
  uidOf,
  type Value,
} from "./emulators.ts";

/** Uncaught exceptions and console errors, per page. */
export type Thrown = string[];

/** collect a page's uncaught exceptions and console errors */
export function watch(page: Page, into: Thrown): void {
  page.on("pageerror", (error) => into.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      into.push(message.text());
    }
  });
}

// `+error.svelte` paints "This page couldn't load" over a render throw, so the
// stack survives only in the page's own events; a failure reports them so it
// names its cause rather than its symptom.
/** `test` with every page's exceptions attached to a failing result */
export const test = base.extend<{ thrown: Thrown }>({
  thrown: [
    async ({ context }, use, testInfo) => {
      const thrown: Thrown = [];
      for (const page of context.pages()) {
        watch(page, thrown);
      }
      context.on("page", (page) => watch(page, thrown));
      await use(thrown);
      if (testInfo.status !== testInfo.expectedStatus && thrown.length > 0) {
        await testInfo.attach("page exceptions", {
          body: thrown.join("\n\n"),
          contentType: "text/plain",
        });
      }
    },
    { auto: true },
  ],
});

export { expect };

/** an email address no earlier run has used */
export function freshEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** ask for a sign-in link on the welcome screen */
export async function askForLink(page: Page, email: string): Promise<void> {
  await page.goto(APP_ORIGIN);
  await page.locator("input").first().fill(email);
  await page.locator("button[type=submit]").click();
}

// The emulator publishes the link it would have mailed, which is the only way
// to sign someone in here unattended.
/** sign in through the email door and return the account's uid */
export async function signInByEmail(
  page: Page,
  email: string,
): Promise<string> {
  const spent = await emailCode(email);
  await askForLink(page, email);
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        code = await emailCode(email);
        return code !== undefined && code !== spent;
      },
      { message: `a sign-in link is sent to ${email}` },
    )
    .toBe(true);
  await page.goto(continueUrl(email, code ?? ""));
  await expect(page).not.toHaveURL(/\/continue\//, { timeout: 15_000 });
  let uid: string | undefined;
  await expect
    .poll(
      async () => {
        uid = await uidOf(email);
        return uid;
      },
      { message: "the link signs them in" },
    )
    .toBeTruthy();
  return uid ?? "";
}

// A fragment change is not a load: the last screen's sheets and state stay
// standing over the next one unless the page really reloads.
/** open an app URL with a real load, even when only its fragment differs */
export async function load(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}

// A wait for nothing to happen. A duplicate, or a write that should not be
// made at all, has no event to wait on, so time is the only chance it gets to
// show before the check that it did not.
/** give something that must not happen time to happen */
export async function linger(page: Page): Promise<void> {
  await page.waitForTimeout(2000);
}

/** the page's visible text */
export async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

/** text flattened onto one line, for failure messages */
export function flat(shown: string): string {
  return shown.replace(/\n+/g, " | ");
}

/** a profile document */
export function profile(displayName: string): Fields {
  return {
    displayName: str(displayName),
    username: str(""),
    searchable: bool(false),
    createdAt: ts("2026-08-01T00:00:00Z"),
  };
}

// The room page reads `listing.location.label` unguarded. Every real write path
// sets one, so a fixture without it crashes on a state that cannot exist.
/** a listing's location */
export function location(
  label: string,
  lat: number,
  lng: number,
  geohash: string,
): Value {
  return map({
    label: str(label),
    lat: double(lat),
    lng: double(lng),
    geohash: str(geohash),
  });
}

/** Lisbon, as a listing location */
export const LISBON = location("Lisbon", 38.7223, -9.1393, "eycs0p");

// Next year, far enough out that `isExpired` can never age a fixture into a
// failure.
/** the year fixture dates fall in */
export const FIXTURE_YEAR = new Date().getUTCFullYear() + 1;

/** an open set of dates in the fixture year, `start` and `end` as `MM-DD` */
export function openWindow(
  start: string,
  end: string,
  roomId: string | null = null,
): Fields {
  return {
    start: str(`${FIXTURE_YEAR}-${start}`),
    end: str(`${FIXTURE_YEAR}-${end}`),
    status: str("OPEN"),
    bookingId: nul(),
    autoAccept: bool(false),
    details: str(""),
    roomId: roomId ? str(roomId) : nul(),
    publicPortalId: nul(),
    createdAt: int(0),
  };
}

/** a booking's fields */
export function booking(fields: {
  listingId: string;
  ownerId: string;
  guestId: string;
  windowId: string;
  start: string;
  end: string;
  status: "REQUESTED" | "CONFIRMED" | "CANCELLED";
  createdAt: number;
}): Fields {
  return {
    listingId: str(fields.listingId),
    ownerId: str(fields.ownerId),
    guestId: str(fields.guestId),
    windowId: str(fields.windowId),
    start: str(fields.start),
    end: str(fields.end),
    status: str(fields.status),
    cancelledBy: nul(),
    cancelReason: nul(),
    hiddenBy: { arrayValue: {} },
    createdAt: int(fields.createdAt),
  };
}

/** a room inside a listing's `rooms` map */
export function room(
  name: string,
  note: string,
  order: number,
  token: string | null = null,
): Value {
  return map({
    name: str(name),
    note: str(note),
    photos: { arrayValue: {} },
    publicPortalId: token ? str(token) : nul(),
    order: int(order),
  });
}
