// Drives the share-link path in a real browser against the emulators, because
// nothing else can: it needs a page, a session and a portal, so lint, the unit
// suite and the rules suite all pass while it is broken. Every bug this path has
// shipped got through exactly that way.
//
// It cannot gate CI — it wants a browser and a dev server — and that is not a
// reason to skip it. Run it by hand after touching the portal, the identity
// sheet, or anything in `src/lib/auth.ts`:
//
//   cd web && bun run dev:emulated        # in one shell (serves on 3001)
//   bun run check:portal                  # in another
//
// Set KIP_ORIGIN if the dev server isn't on 3001.
//
// Exits non-zero with the first failed expectation, so it reads like a test.

import { spawn, spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";

// 3001, not the dev server's default — Erik's own dev server lives on 3000, and an
// emulated server there would quietly answer for it. `dev:emulated` pins the
// same port, so the two cannot drift apart.
const APP = process.env.KIP_ORIGIN ?? "http://localhost:3001";
const FIRESTORE = "http://127.0.0.1:8080";
// The CLIENT's project id, not the emulator's `--project` flag. Pointing the
// SDK at an emulator does not change the project it thinks it is talking to, and
// the emulator namespaces data per project — so seeding under the flag's name
// writes into a namespace the app never reads, and every link reads as dead.
const PROJECT = "hafaio-kip-dev";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
// Per run: the emulator keeps its data for as long as it is up, so a fixed host
// would find the booking an EARLIER run left behind and pass on it.
const RUN = Date.now();
const TOKEN = `portal-check-token-${RUN}`;
const HOST = `host-portal-check-${RUN}`;
const LISTING = `portal-check-listing-${RUN}`;

const failures = [];
function expect(what, ok, detail = "") {
  if (ok) console.log(`  ok   ${what}`);
  else {
    console.log(`  FAIL ${what}${detail ? ` — ${detail}` : ""}`);
    failures.push(what);
  }
}

// Admin writes: the emulator accepts `Bearer owner` and skips rules, which is
// what lets this build a host without pretending to be one.
async function put(path, fields) {
  const response = await fetch(`${DOCS}/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`seed ${path}: ${response.status}`);
}

const str = (stringValue) => ({ stringValue });
const ts = (timestampValue) => ({ timestampValue });

async function seed() {
  await put(`users/${HOST}`, {
    displayName: str("Sam Host"),
    username: str(""),
    searchable: { booleanValue: false },
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  await put(`users/${HOST}/settings/prefs`, { profilePortalId: str(TOKEN) });
  await put(`portals/${TOKEN}`, {
    scope: str("USER"),
    ownerId: str(HOST),
    ownerName: str("Sam Host"),
    ownerPhotoURL: { nullValue: null },
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  await put(`listings/${LISTING}`, {
    ownerId: str(HOST),
    title: str("The spare room"),
  location: {
    mapValue: {
      fields: {
        label: str("Lisbon"),
        lat: { doubleValue: 38.7223 },
        lng: { doubleValue: -9.1393 },
        geohash: str("eycs0p"),
      },
    },
  },
    type: str("ROOM"),
    description: str("A room"),
    photos: { arrayValue: {} },
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  // Far enough out that `isExpired` can never age the fixture into a failure —
  // the same trap `isoIn` exists to avoid in the rules suite.
  const year = new Date().getUTCFullYear() + 1;
  await put(`listings/${LISTING}/windows/w1`, {
    start: str(`${year}-10-01`),
    end: str(`${year}-10-05`),
    status: str("OPEN"),
    bookingId: { nullValue: null },
    autoAccept: { booleanValue: false },
    details: str(""),
    publicPortalId: { nullValue: null },
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
}

const PROFILE = "/tmp/kip-portal-check";

let chrome;
async function browser() {
  // A browser left behind holds the SIGNED-IN session, so the next run opens on
  // the app rather than the door and fails at step one saying nothing about why.
  // No leading dashes in the pkill pattern: it reads one as an option of its own
  // and matches nothing, which looks just like there being nothing to kill.
  spawnSync("pkill", ["-f", `user-data-dir=${PROFILE}`]);
  await new Promise((done) => setTimeout(done, 1500));
  await rm(PROFILE, { recursive: true, force: true });
  chrome = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      "--remote-debugging-port=9333",
      `--user-data-dir=${PROFILE}`,
      "--disable-gpu",
      "--no-first-run",
      "--window-size=430,932",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  process.on("exit", () => chrome?.kill());
  await new Promise((r) => setTimeout(r, 5000));
  const targets = await (await fetch("http://127.0.0.1:9333/json/list")).json();
  const ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  // Page-level events, not an in-page hook: `+error.svelte` catches a render
  // throw before any hook installed after navigation could see it.
  const thrown = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params?.exceptionDetails;
      thrown.push(detail?.exception?.description ?? detail?.text ?? "?");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      thrown.push((message.params.args ?? []).map((a) => a.description ?? a.value).join(" | "));
    }
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message.result ?? message.error);
      waiting.delete(message.id);
    }
  };
  const send = (method, params = {}) => {
    const at = ++id;
    ws.send(JSON.stringify({ id: at, method, params }));
    return new Promise((r) => waiting.set(at, r));
  };
  await send("Page.enable");
  await send("Runtime.enable");
  return {
    send,
    thrown,
    evaluate: async (expression) =>
      (
        await send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        })
      )?.result?.value,
    go: async (url, wait = 7000) => {
      await send("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, wait));
    },
  };
}

const page = await (async () => {
  await seed();
  console.log("seeded a USER-scope portal with one room and one open slot\n");
  return browser();
})();

console.log("share link resolves");
await page.go(`${APP}/portal/#${TOKEN}`, 9200);
function reportThrown() {
  if (page.thrown.length) console.log("  threw:", page.thrown.splice(0).join("\n         ").slice(0, 1200));
}
reportThrown();
const shown = await page.evaluate("document.body.innerText");
expect("does not report the link as inactive", !shown.includes("isn't active"), shown.slice(0, 90));
expect("names the host", shown.includes("Sam Host"));
expect("shows the room", shown.includes("The spare room"));
expect("offers to ask", shown.includes("Ask to be friends") || shown.includes("Request"));

console.log("\nasking opens the identity sheet");
const sheet = await page.evaluate(`
(async () => {
  const ask = [...document.querySelectorAll("button")].find(b => /ask|request/i.test(b.textContent));
  if (!ask) return "no ask control";
  ask.click();
  await new Promise(r => setTimeout(r, 1500));
  const inputs = [...document.querySelectorAll("input")].length;
  const labels = [...document.querySelectorAll("form button")].map(b => b.textContent.trim());
  return JSON.stringify({ inputs, labels, text: document.body.innerText.slice(-200) });
})()
`);
expect("a sheet with fields opens", String(sheet).includes('"inputs":2'), String(sheet).slice(0, 160));
// Google is its own path — below the submit, after a divider — because it
// authenticates FIRST and takes the name from the account rather than the form.
expect(
  "Google is offered below the submit",
  String(sheet).includes("with Google") &&
    String(sheet).indexOf("with Google") > String(sheet).indexOf("Send request"),
  String(sheet).slice(-140),
);

console.log("\nasking actually sends");
const sent = await page.evaluate(`
(async () => {
  const type = (el, v) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const inputs = [...document.querySelectorAll("input")];
  if (inputs.length < 1) return "no fields";
  type(inputs[0], "Wandering Guest");
  await new Promise(r => setTimeout(r, 400));
  const submit = document.querySelector("button[type=submit]");
  if (!submit) return "no submit";
  if (submit.disabled) return "submit disabled with a valid name";
  submit.click();
  await new Promise(r => setTimeout(r, 10000));
  return JSON.stringify({ tail: document.body.innerText.slice(-260) });
})()
`);
reportThrown();
expect("the submit went through", !String(sent).startsWith("no ") && !String(sent).includes("disabled"), String(sent).slice(0, 120));

// The point of the whole flow: a real REQUESTED booking against the host's slot,
// and a profile carrying the name that was typed a moment before it. A booking
// deliberately carries no name — the host reads it off the profile through the
// `knownBy` hop — so the two are checked separately.
async function query(collectionId, field, value) {
  const rows = await (
    await fetch(`${DOCS}:runQuery`, {
      method: "POST",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "EQUAL",
              value: { stringValue: value },
            },
          },
        },
      }),
    })
  ).json();
  return rows.filter((row) => row.document).map((row) => row.document);
}

const bookings = await query("bookings", "ownerId", HOST);
const booking = bookings[0]?.fields;
expect("exactly one request reached the host", bookings.length === 1, JSON.stringify(bookings).slice(0, 140));
expect(
  "it is REQUESTED, never confirmed from a link",
  booking?.status?.stringValue === "REQUESTED",
  booking?.status?.stringValue,
);
expect(
  "it holds the dates that were shown",
  booking?.start?.stringValue?.endsWith("-10-01"),
  booking?.start?.stringValue,
);

const guestUid = booking?.guestId?.stringValue;
const profile = guestUid
  ? await (
      await fetch(`${DOCS}/users/${guestUid}`, {
        headers: { Authorization: "Bearer owner" },
      })
    ).json()
  : null;
expect(
  "the guest's profile carries the name they typed",
  profile?.fields?.displayName?.stringValue === "Wandering Guest",
  profile?.fields?.displayName?.stringValue,
);

console.log("\nthe field routes on what was typed, not on the mode");
// A number typed while the field reads Email must still be accepted: the mode
// sets the keyboard, not the verdict.
await page.go(`${APP}/portal/#${TOKEN}`);
const typedNumber = await page.evaluate(`
(async () => {
  const ask = [...document.querySelectorAll("button")].find(b => /ask to be friends/i.test(b.textContent));
  if (!ask) return "no connect control";
  ask.click();
  await new Promise(r => setTimeout(r, 1500));
  const type = (el, v) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const inputs = [...document.querySelectorAll("input")];
  if (inputs.length < 2) return "no reach field";
  const reach = inputs[inputs.length - 1];
  if (reach.inputMode !== "email") return "field was not in email mode: " + reach.inputMode;
  type(inputs[0], "Number Typer");
  type(reach, "(415) 555-0123");
  await new Promise(r => setTimeout(r, 600));
  const submit = document.querySelector("button[type=submit]");
  return JSON.stringify({
    disabled: submit.disabled,
    body: document.body.innerText.slice(-220),
  });
})()
`);
expect(
  "a phone number typed in email mode is accepted",
  !String(typedNumber).includes('"disabled":true') &&
    !String(typedNumber).includes("not an email or a US number"),
  String(typedNumber).slice(0, 200),
);

console.log("\na room's link shows that room and nothing else in the house");
// Its own host, so the profile link above keeps exactly the one place it
// asserts on.
const HOST2 = `host-rooms-check-${RUN}`;
const HOUSE = `portal-check-house-${RUN}`;
const ROOM_TOKEN = `portal-check-room-token-${RUN}`;
const HOUSE_TOKEN = `portal-check-house-token-${RUN}`;
const houseYear = new Date().getUTCFullYear() + 1;
const room = (name, note, order, token) => ({
  mapValue: {
    fields: {
      name: str(name),
      note: str(note),
      photos: { arrayValue: {} },
      publicPortalId: token ? str(token) : { nullValue: null },
      order: { integerValue: String(order) },
    },
  },
});
await put(`users/${HOST2}`, {
  displayName: str("Erik Host"),
  username: str(""),
  searchable: { booleanValue: false },
  createdAt: ts("2026-08-01T00:00:00Z"),
});
await put(`listings/${HOUSE}`, {
  ownerId: str(HOST2),
  title: str("The tall house"),
  location: {
    mapValue: {
      fields: {
        label: str("Oakland, CA"),
        lat: { doubleValue: 37.8 },
        lng: { doubleValue: -122.27 },
        geohash: str("9q9p1d"),
      },
    },
  },
  type: str("HOUSE"),
  description: str("A house with rooms"),
  photos: { arrayValue: {} },
  publicPortalId: str(HOUSE_TOKEN),
  rooms: {
    mapValue: {
      fields: {
        "room-back": room("Back bedroom", "Ground floor, double bed", 0, ROOM_TOKEN),
        "room-attic": room("Attic room", "Up a steep ladder", 1, null),
      },
    },
  },
  createdAt: ts("2026-08-01T00:00:00Z"),
});
// What `publishRoomPortal` writes: the room's own copy, and where it is.
await put(`portals/${ROOM_TOKEN}`, {
  scope: str("ROOM"),
  ownerId: str(HOST2),
  ownerName: str("Erik Host"),
  ownerPhotoURL: { nullValue: null },
  listingId: str(HOUSE),
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
  createdAt: ts("2026-08-01T00:00:00Z"),
});
await put(`portals/${HOUSE_TOKEN}`, {
  scope: str("LISTING"),
  ownerId: str(HOST2),
  ownerName: str("Erik Host"),
  ownerPhotoURL: { nullValue: null },
  listingId: str(HOUSE),
  createdAt: ts("2026-08-01T00:00:00Z"),
});
const slot = (start, end, roomId) => ({
  start: str(`${houseYear}-${start}`),
  end: str(`${houseYear}-${end}`),
  status: str("OPEN"),
  bookingId: { nullValue: null },
  autoAccept: { booleanValue: false },
  details: str(""),
  roomId: roomId ? str(roomId) : { nullValue: null },
  publicPortalId: { nullValue: null },
  createdAt: ts("2026-08-01T00:00:00Z"),
});
await put(`listings/${HOUSE}/windows/back`, slot("11-06", "11-09", "room-back"));
await put(`listings/${HOUSE}/windows/attic`, slot("11-13", "11-16", "room-attic"));
await put(`listings/${HOUSE}/windows/whole`, slot("11-20", "11-29", null));

// A fragment change is not a load, so each link is opened by a real reload:
// otherwise the last page's sheet and state are still standing over this one.
async function open(token) {
  await page.go(`${APP}/portal/#${token}`, 1000);
  await page.evaluate(`location.reload(); "reloading"`);
  await new Promise((r) => setTimeout(r, 9000));
  reportThrown();
  return page.evaluate("document.querySelector('main').innerText");
}

const roomPage = String(await open(ROOM_TOKEN));
const roomFlat = roomPage.replace(/\n+/g, " | ");
expect("the room link resolves", !roomPage.includes("isn't active") && roomPage.includes("Erik Host"), roomFlat.slice(0, 120));
expect("it shows the room", roomPage.includes("Back bedroom") && roomPage.includes("Ground floor, double bed"), roomFlat.slice(0, 240));
expect("it names the house it is in", roomPage.includes("In The tall house · Oakland, CA"), roomFlat.slice(0, 240));
expect(
  "it shows that room's open dates",
  roomPage.includes("Nov 6 – Nov 9") && (roomPage.match(/Request/g) ?? []).length === 1,
  roomFlat.slice(0, 300),
);
expect(
  "and nothing else in the house",
  !roomPage.includes("Attic room") &&
    !roomPage.includes("Nov 13") &&
    !roomPage.includes("Nov 20") &&
    !roomPage.includes("Whole house") &&
    !roomPage.includes("A house with rooms"),
  roomFlat.slice(0, 300),
);

console.log("\nasking through a room link lands as a request that says so");
const asked = await page.evaluate(`
(async () => {
  const ask = [...document.querySelectorAll("main button")].find(b => b.textContent.trim() === "Request");
  if (!ask) return "no request control";
  ask.click();
  await new Promise(r => setTimeout(r, 8000));
  return document.querySelector("main").innerText;
})()
`);
reportThrown();
expect(
  "the page says it was sent",
  String(asked).includes("Requested") && !String(asked).includes("didn't go through"),
  String(asked).replace(/\n+/g, " | ").slice(-260),
);
const roomAsks = await query("bookings", "ownerId", HOST2);
const roomAsk = roomAsks[0]?.fields;
expect("exactly one request reached that host", roomAsks.length === 1, JSON.stringify(roomAsks).slice(0, 140));
expect(
  "it is REQUESTED and marked as coming through a room link",
  roomAsk?.status?.stringValue === "REQUESTED" && roomAsk?.via?.stringValue === "ROOM",
  JSON.stringify({ status: roomAsk?.status, via: roomAsk?.via }),
);
expect(
  "it is for the room's own dates",
  roomAsk?.windowId?.stringValue === "back" && roomAsk?.start?.stringValue?.endsWith("-11-06"),
  JSON.stringify({ window: roomAsk?.windowId, start: roomAsk?.start }),
);

console.log("\nthe house's link groups dates under the whole house and each room");
const housePage = String(await open(HOUSE_TOKEN));
const houseFlat = housePage.replace(/\n+/g, " | ");
expect("the house link resolves", housePage.includes("The tall house"), houseFlat.slice(0, 160));
// Upper-cased by CSS, and innerText reports it as drawn.
expect("the chip counts the rooms", /house · 2 rooms/i.test(housePage), houseFlat.slice(0, 200));
const at = (words) => housePage.indexOf(words);
expect(
  "whole house first, then the rooms in order",
  at("Whole house") > -1 &&
    at("Whole house") < at("Nov 20") &&
    at("Nov 20") < at("Back bedroom") &&
    at("Back bedroom") < at("Nov 6") &&
    at("Nov 6") < at("Attic room") &&
    at("Attic room") < at("Nov 13"),
  houseFlat.slice(0, 400),
);
expect(
  "the ask made through the room's link shows here too",
  (housePage.match(/Requested/g) ?? []).length === 1 && (housePage.match(/Request\b/g) ?? []).length === 2,
  houseFlat.slice(0, 400),
);

reportThrown();
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall good");
process.exit(0);
