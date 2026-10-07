// Drives the HOST's side of a slot in a real browser, which is the half
// `check:portal` cannot reach: that one is a visitor asking, this one is the
// person being asked. Between them they cover both ends of one booking.
//
// It signs a host in through the email door (the Auth emulator publishes the
// link it would have mailed) and checks that returning ends in the app rather
// than on a panel about it, then seeds a place with one slot and two asks
// against it and asserts what the host actually sees — a count on the row in
// the list, and the askers themselves inside the slot.
//
//   cd web && bun run dev:emulated        # in one shell (serves on 3001)
//   bun run check:host                    # in another
//
// It ends on check-out instructions, which need a second person: the host
// writes them for a place and a room, and a guest in a browser of their own
// sees them on a confirmed stay and not on one they have only asked for.
//
// Exits non-zero on the first failed expectation, so it reads like a test.
//
// KIP_SHOTS=<dir> also saves 390px screenshots of the check-out surfaces, light
// and dark, for looking at.

import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";

const APP = process.env.KIP_ORIGIN ?? "http://localhost:3001";
const FIRESTORE = "http://127.0.0.1:8080";
const AUTH = "http://127.0.0.1:9099";
// The two emulators namespace under DIFFERENT project ids, which is worth
// knowing before hunting for a link that was definitely sent. Firestore uses
// the id the CLIENT is configured with, because pointing the SDK at an emulator
// does not change the project it thinks it is talking to. Auth uses the id the
// emulator was STARTED with — the client authenticates with a fake API key, so
// there is no project in the request for it to honour.
const PROJECT = "hafaio-kip-dev";
const AUTH_PROJECT = "demo-kip";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const LISTING = "host-check-listing";
const WINDOW = "host-check-window";
// Per run: the emulator keeps its accounts for as long as it is up, so a fixed
// address signs into the previous run's account and inherits its data.
const EMAIL = `host-check-${Date.now()}@example.com`;

const failures = [];
function expect(what, ok, detail = "") {
  if (ok) console.log(`  ok   ${what}`);
  else {
    console.log(`  FAIL ${what}${detail ? ` — ${detail}` : ""}`);
    failures.push(what);
  }
}

async function put(path, fields) {
  const response = await fetch(`${DOCS}/${path}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`seed ${path}: ${response.status}`);
}

const str = (stringValue) => ({ stringValue });
const ts = (timestampValue) => ({ timestampValue });
const int = (n) => ({ integerValue: String(n) });

const PROFILE = "/tmp/kip-host-check";
const GUEST_PROFILE = "/tmp/kip-host-check-guest";
const SHOTS = process.env.KIP_SHOTS;

let chrome;
async function browser(profile = PROFILE, port = 9334) {
  // A browser left behind holds the SIGNED-IN session, so the next run opens on
  // the app rather than the door and fails at step one saying nothing about why.
  // No leading dashes in the pkill pattern: it reads one as an option of its own
  // and matches nothing, which looks just like there being nothing to kill.
  // The trailing space keeps the host's pattern from matching the guest's.
  spawnSync("pkill", ["-f", `user-data-dir=${profile} `]);
  await new Promise((done) => setTimeout(done, 1500));
  await rm(profile, { recursive: true, force: true });
  const launched = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--disable-gpu",
      "--no-first-run",
      "--window-size=430,932",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  chrome ??= launched;
  process.on("exit", () => launched.kill());
  await new Promise((r) => setTimeout(r, 5000));
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  // Page-level events, not just replies. An exception that trips the app's own
  // error boundary is caught before any in-page hook can install, so the only
  // place its stack survives is here.
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
    thrown,
    send,
    evaluate: async (expression) =>
      (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))
        ?.result?.value,
    go: async (url, wait = 7000) => {
      await send("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, wait));
    },
  };
}

// Light and dark at phone width, then back to the size the checks run at.
async function shots(view, name) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await view.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  for (const scheme of ["light", "dark"]) {
    await view.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme }],
    });
    await new Promise((r) => setTimeout(r, 900));
    const shot = await view.send("Page.captureScreenshot", { format: "png" });
    await writeFile(`${SHOTS}/${name}-${scheme}.png`, Buffer.from(shot.data, "base64"));
  }
  await view.send("Emulation.setEmulatedMedia", { features: [] });
  await view.send("Emulation.clearDeviceMetricsOverride");
}

const page = await browser();

console.log("the host gets in through the email door");
await page.go(APP);
const asked = await page.evaluate(`
(async () => {
  const type = (el, v) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const field = document.querySelector("input");
  if (!field) return "no field on the welcome screen";
  type(field, ${JSON.stringify(EMAIL)});
  await new Promise(r => setTimeout(r, 400));
  const submit = document.querySelector("button[type=submit]");
  if (!submit || submit.disabled) return "submit unavailable";
  submit.click();
  await new Promise(r => setTimeout(r, 6000));
  return "SENT::" + document.body.innerText.slice(0, 300);
})()
`);
expect("a link is sent", String(asked).startsWith("SENT::") && !String(asked).includes("Couldn't"), String(asked).slice(0, 260));

// The emulator publishes the link it would have mailed, which is the whole
// reason this can run unattended.
const codes = await (await fetch(`${AUTH}/emulator/v1/projects/${AUTH_PROJECT}/oobCodes`)).json();
const link = codes.oobCodes?.findLast((sent) => sent.email === EMAIL)?.oobLink;
expect("the emulator captured it", Boolean(link), JSON.stringify(codes).slice(0, 160));
if (!link) {
  console.log(`\n${failures.length} failed`);
  chrome?.kill();
  process.exit(1);
}

// The link points at the emulator's own action page, which would redirect. The
// app's `/continue/` is what has to handle the code, so hand it there directly —
// the same query Firebase's redirect would arrive with.
const followed = new URL(link);
const code = followed.searchParams.get("oobCode");
await page.go(
  `${APP}/continue/?mode=signIn&lang=en&apiKey=fake-api-key&oobCode=${encodeURIComponent(code)}#email=${encodeURIComponent(EMAIL)}`,
  10000,
);

// Asked of the emulator, not of the browser. The SDK moves a session between
// localStorage and IndexedDB as it sees fit, so scraping storage reported a uid
// that was real once and wrong by the next page load — and everything seeded
// against it then belonged to nobody.
const accounts = await (
  await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${AUTH_PROJECT}/accounts:query`,
    {
      method: "POST",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  )
).json();
const uid = accounts.userInfo?.find((u) => u.email === EMAIL)?.localId;
expect("the link signs the host in", Boolean(uid), JSON.stringify(accounts).slice(0, 200));
if (!uid) {
  console.log(`\n${failures.length} failed`);
  chrome?.kill();
  process.exit(1);
}

// The link's whole job is to put someone back in kip, so returning ends in the
// app.
const landed = JSON.parse(
  await page.evaluate(
    `JSON.stringify({ href: location.href, text: document.body.innerText.slice(0, 200) })`,
  ),
);
expect("returning lands in the app", !/\/continue\//.test(landed.href), landed.href);
// Matched on the panel's own words: the app's Home greets a returning host
// with "Welcome back" too, so that phrase proves nothing either way.
expect(
  "and not on an interstitial",
  !/Open kip|signed in on this device/.test(landed.text),
  landed.text.replace(/\n+/g, " | ").slice(0, 160),
);
// The code is spent by the time this lands: carrying it into the app's URL
// would leave a dead one-time link in history for a Back to find.
expect("the one-time code is left behind", !/oobCode/.test(landed.href), landed.href);
await page.evaluate(`history.back(); "going"`);
await new Promise((r) => setTimeout(r, 2000));
const behind = await page.evaluate(`location.href`);
expect(
  "Back does not return to the spent link",
  !/\/continue\//.test(String(behind)),
  String(behind),
);

console.log("\nseeding a place with one slot and two asks");
const year = new Date().getUTCFullYear() + 1;
await put(`users/${uid}`, {
  displayName: str("Host Under Test"),
  username: str(""),
  searchable: { booleanValue: false },
  createdAt: ts("2026-08-01T00:00:00Z"),
});
await put(`listings/${LISTING}`, {
  ownerId: str(uid),
  title: str("The tested room"),
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
await put(`listings/${LISTING}/windows/${WINDOW}`, {
  start: str(`${year}-11-01`),
  end: str(`${year}-11-05`),
  status: str("OPEN"),
  bookingId: { nullValue: null },
  autoAccept: { booleanValue: false },
  details: str(""),
  publicPortalId: { nullValue: null },
  createdAt: int(0),
});
for (const [id, guest, at] of [
  ["host-check-ask-1", "guest-early", 1000],
  ["host-check-ask-2", "guest-late", 2000],
]) {
  await put(`users/${guest}`, {
    displayName: str(guest === "guest-early" ? "Early Asker" : "Late Asker"),
    username: str(""),
    searchable: { booleanValue: false },
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  await put(`bookings/${id}`, {
    listingId: str(LISTING),
    ownerId: str(uid),
    guestId: str(guest),
    windowId: str(WINDOW),
    start: str(`${year}-11-01`),
    end: str(`${year}-11-05`),
    status: str("REQUESTED"),
    cancelledBy: { nullValue: null },
    cancelReason: { nullValue: null },
    hiddenBy: { arrayValue: {} },
    createdAt: int(at),
  });
}

console.log("\nthe list says the slot has been asked about");
// Reloaded, not just re-addressed: a fragment change is not a load, and the app
// has sat since sign-in on an account with no profile — so the name sheet it
// offers such an account is still up, over everything that follows.
await page.go(`${APP}/#/room/${LISTING}`, 1500);
await page.evaluate(`location.reload(); "reloading"`);
await new Promise((r) => setTimeout(r, 9000));
const row = await page.evaluate(`
(async () => {
  for (let i = 0; i < 20; i++) {
    if (/Availability/.test(document.body.innerText)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  return document.body.innerText;
})()
`);
// An exception here trips the app's error boundary, which renders a tidy
// "couldn't load" over the failure — so the stack is worth printing before the
// assertions describe the symptom instead of the cause.
if (page.thrown.length)
  console.log("  threw:", page.thrown.join("\n         ").slice(0, 1200));
expect(
  "the room is the host's own view",
  String(row).includes("Availability"),
  String(row).replace(/\n+/g, " | ").slice(0, 200),
);
// Without this a slot two people are waiting on looks exactly like an untouched
// one, and the requests inside the sheet are unreachable without opening every
// slot in turn.
expect("the row carries a count", /2 asked/.test(String(row)), String(row).slice(0, 400));

console.log("\nopening the slot shows who asked");
const sheet = await page.evaluate(`
(async () => {
  const row = [...document.querySelectorAll("[role=button], button")]
    .find(el => /asked/.test(el.innerText || ""));
  if (!row) return "no slot row";
  row.click();
  await new Promise(r => setTimeout(r, 2500));
  const dialog = document.querySelector("[role=dialog]") || document.body;
  return dialog.innerText;
})()
`);
expect("both askers are named", String(sheet).includes("Early Asker") && String(sheet).includes("Late Asker"), String(sheet).slice(0, 300));
// Oldest first: they are queueing for one slot and who asked first is the only
// ordering the host has reason to read.
expect(
  "oldest first",
  String(sheet).indexOf("Early Asker") < String(sheet).indexOf("Late Asker"),
  String(sheet).slice(0, 300),
);
// Naming who is waiting ABOVE the date fields is what makes the confirm that
// cancels them legible before the host touches a date.
expect(
  "they sit above the dates",
  String(sheet).indexOf("Early Asker") < String(sheet).indexOf("From"),
  String(sheet).slice(0, 300),
);
// The sheet is component state, so leaving for a booking and coming back has to
// go through the URL or the host lands on a room that forgot which slot was open.
const addressed = await page.evaluate(`location.hash`);
expect("the open slot is in the URL", String(addressed).includes(`/slot/${WINDOW}`), String(addressed));

console.log("\na booked slot still shows who missed out, below the stay itself");
// Confirming does not cancel the losers — `confirmBooking` touches only the
// winner and the window — and nothing else ever reaches them from these dates.
// The order is the assertion: the stay that HOLDS the nights outranks the asks
// that missed them, and reversing it reads as though nobody has these dates.
await put(`bookings/host-check-won`, {
  listingId: str(LISTING),
  ownerId: str(uid),
  guestId: str("guest-early"),
  windowId: str(WINDOW),
  start: str(`${year}-11-01`),
  end: str(`${year}-11-05`),
  status: str("CONFIRMED"),
  cancelledBy: { nullValue: null },
  cancelReason: { nullValue: null },
  hiddenBy: { arrayValue: {} },
  createdAt: int(500),
});
await put(`listings/${LISTING}/windows/${WINDOW}`, {
  start: str(`${year}-11-01`),
  end: str(`${year}-11-05`),
  status: str("BOOKED"),
  bookingId: str("host-check-won"),
  autoAccept: { booleanValue: false },
  details: str(""),
  publicPortalId: { nullValue: null },
  createdAt: int(0),
});
await page.go(`${APP}/#/room/${LISTING}/slot/${WINDOW}`, 10000);
const held = await page.evaluate(`
(async () => {
  for (let i = 0; i < 20; i++) {
    if (/Confirmed/.test(document.body.innerText)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  return document.body.innerText;
})()
`);
expect("the stay is named", String(held).includes("Confirmed"), String(held).replace(/\n+/g, " | ").slice(0, 200));
expect(
  "the losers are still listed",
  /people asked/.test(String(held)),
  String(held).replace(/\n+/g, " | ").slice(0, 200),
);
expect(
  "the stay comes first",
  String(held).indexOf("Confirmed") < String(held).indexOf("people asked"),
  String(held).replace(/\n+/g, " | ").slice(0, 240),
);
// A dead end has to say so: these can never be confirmed, because
// `bookingMatchesOpenSlot` requires an OPEN slot.
expect(
  "and says they can only be declined",
  String(held).includes("went to someone else"),
  String(held).replace(/\n+/g, " | ").slice(0, 240),
);

console.log("\nopening a slot keeps the host's place in the list");
// A sheet is an overlay on the room, not a different screen. It was counted as
// one, so the page under it jumped to the top on open and again on close — and
// a host with a year of dates lost their place on every tap.
await put(`listings/${LISTING}/windows/${WINDOW}`, {
  start: str(`${year}-11-01`),
  end: str(`${year}-11-05`),
  status: str("OPEN"),
  bookingId: { nullValue: null },
  autoAccept: { booleanValue: false },
  details: str(""),
  publicPortalId: { nullValue: null },
  createdAt: int(0),
});
await page.go(`${APP}/#/room/${LISTING}`, 9000);
const kept = await page.evaluate(`
(async () => {
  const scroller = document.querySelector("main") || document.scrollingElement;
  const where = () => Math.round(scroller.scrollTop || window.scrollY);
  scroller.scrollTo({ top: 400, behavior: "instant" });
  window.scrollTo({ top: 400, behavior: "instant" });
  await new Promise(r => setTimeout(r, 600));
  const before = where();
  if (before === 0) return "the page does not scroll at this size";
  const row = [...document.querySelectorAll("[role=button], button")]
    .find(el => /nights/.test(el.innerText || ""));
  if (!row) return "no slot row";
  row.click();
  await new Promise(r => setTimeout(r, 2500));
  // Without this the probe passes by doing nothing at all: a click that never
  // opened the sheet also never navigates, so nothing could have scrolled.
  if (!/Save changes/.test(document.body.innerText)) return "the sheet did not open";
  return JSON.stringify({ before, after: where(), hash: location.hash });
})()
`);
expect(
  "the scroll position survives opening a slot",
  !String(kept).startsWith("no ") &&
    !String(kept).includes("does not scroll") &&
    !String(kept).includes("did not open") &&
    (() => {
      const seen = JSON.parse(String(kept));
      return Math.abs(seen.after - seen.before) < 40;
    })(),
  String(kept).slice(0, 160),
);

console.log("\na house with rooms lists them, and says what each set of dates offers");
// Per run: the emulator keeps its data, and this section ADDS dates, so a fixed
// id would find the ones an earlier run left and clash with them.
const HOUSE = `host-check-house-${Date.now()}`;
const roomFields = (name, note, order) => ({
  mapValue: {
    fields: {
      name: str(name),
      note: str(note),
      photos: { arrayValue: {} },
      publicPortalId: { nullValue: null },
      order: int(order),
    },
  },
});
await put(`listings/${HOUSE}`, {
  ownerId: str(uid),
  title: str("The tested house"),
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
  type: str("HOUSE"),
  description: str("A house"),
  photos: { arrayValue: {} },
  rooms: {
    mapValue: {
      fields: {
        "room-back": roomFields("Back bedroom", "Ground floor", 0),
        "room-attic": roomFields("Attic room", "", 1),
        "room-garden": roomFields("Garden studio", "", 2),
      },
    },
  },
  createdAt: ts("2026-08-01T00:00:00Z"),
});
const houseWindow = (start, end, roomId, extra = {}) => ({
  start: str(`${year}-${start}`),
  end: str(`${year}-${end}`),
  status: str("OPEN"),
  bookingId: { nullValue: null },
  autoAccept: { booleanValue: false },
  details: str(""),
  roomId: roomId ? str(roomId) : { nullValue: null },
  publicPortalId: { nullValue: null },
  createdAt: int(0),
  ...extra,
});
// Seeded attic-first, so the order on screen is the sort's doing and not the
// order the documents happened to arrive in.
await put(`listings/${HOUSE}/windows/a-attic`, houseWindow("11-06", "11-09", "room-attic"));
await put(`listings/${HOUSE}/windows/b-back`, houseWindow("11-06", "11-09", "room-back"));
await put(`listings/${HOUSE}/windows/c-whole`, houseWindow("11-20", "11-29", null));
await put(
  `listings/${HOUSE}/windows/d-back-taken`,
  houseWindow("10-09", "10-12", "room-back", {
    status: str("BOOKED"),
    bookingId: str(`${HOUSE}-stay`),
  }),
);
const houseBooking = (windowId, start, end, status) => ({
  listingId: str(HOUSE),
  ownerId: str(uid),
  guestId: str("guest-early"),
  windowId: str(windowId),
  start: str(`${year}-${start}`),
  end: str(`${year}-${end}`),
  status: str(status),
  cancelledBy: { nullValue: null },
  cancelReason: { nullValue: null },
  hiddenBy: { arrayValue: {} },
  createdAt: int(1000),
});
await put(`bookings/${HOUSE}-stay`, houseBooking("d-back-taken", "10-09", "10-12", "CONFIRMED"));
await put(`bookings/${HOUSE}-ask`, houseBooking("b-back", "11-06", "11-09", "REQUESTED"));

async function read(path) {
  const response = await fetch(`${DOCS}/${path}`, { headers: { Authorization: "Bearer owner" } });
  return response.ok ? response.json() : null;
}
async function houseWindows() {
  return (await read(`listings/${HOUSE}/windows`))?.documents ?? [];
}

// Helpers the page-side snippets share: find a control by its words, type into
// a field the way React hears it, and read whichever sheet is on top.
const IN_PAGE = `
  const nap = (ms) => new Promise(r => setTimeout(r, ms));
  const type = (el, v) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const top = () => [...document.querySelectorAll("[role=dialog]")].at(-1);
  const named = (root, words) => [...root.querySelectorAll("button")]
    .find(b => (b.getAttribute("aria-label") || b.innerText || "").trim() === words);
  const shut = async () => {
    while (top()) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await nap(400);
    }
  };
`;

await page.go(`${APP}/#/room/${HOUSE}`, 9000);
const house = JSON.parse(
  await page.evaluate(`
(async () => {
  ${IN_PAGE}
  for (let i = 0; i < 20; i++) {
    if (/Garden studio/.test(document.body.innerText)) break;
    await nap(500);
  }
  const rows = [...document.querySelectorAll("button")]
    .filter(b => /nights/.test(b.innerText || ""))
    .map(b => b.innerText.replace(/\\n+/g, " | "));
  return JSON.stringify({ text: document.body.innerText, rows });
})()
`),
);
if (page.thrown.length)
  console.log("  threw:", page.thrown.splice(0).join("\n         ").slice(0, 1200));
const flat = house.text.replace(/\n+/g, " | ");
// The chip is upper-cased by CSS, and innerText reports it as drawn.
expect("the type chip counts the rooms", /house · 3 rooms/i.test(house.text), flat.slice(0, 200));
expect(
  "the rooms are listed in order",
  house.text.indexOf("Back bedroom") > -1 &&
    house.text.indexOf("Back bedroom") < house.text.indexOf("Attic room") &&
    house.text.indexOf("Attic room") < house.text.indexOf("Garden studio"),
  flat.slice(0, 300),
);
expect(
  "each set of dates says what it offers",
  house.rows.some((row) => /Nov 20/.test(row) && /Whole house/.test(row)) &&
    house.rows.some((row) => /Nov 6/.test(row) && /Attic room/.test(row)) &&
    house.rows.some((row) => /Oct 9/.test(row) && /Back bedroom/.test(row) && /Booked/.test(row)),
  house.rows.join(" || "),
);
// By start date, then in the Rooms list's order — so two rooms offering the
// same nights sit together, the same way round every time.
const nov6 = house.rows.filter((row) => /Nov 6/.test(row));
expect(
  "same dates sort by room order",
  nov6.length === 2 && /Back bedroom/.test(nov6[0]) && /Attic room/.test(nov6[1]),
  nov6.join(" || "),
);
expect(
  "a guest's row names the room",
  /Back bedroom · Oct 9/.test(house.text) && /Back bedroom · Nov 6/.test(house.text),
  flat.slice(-400),
);

console.log("\nadd dates starts on every room, and adds one set for each");
const adding = JSON.parse(
  await page.evaluate(`
(async () => {
  ${IN_PAGE}
  named(document, "Add dates").click();
  await nap(1200);
  const sheet = top();
  if (!sheet) return JSON.stringify({ error: "no sheet" });
  const ticks = [...sheet.querySelectorAll("[role=checkbox]")]
    .map(b => b.innerText.replace(/\\n+/g, " ") + "=" + b.getAttribute("aria-checked"));
  const before = sheet.innerText;
  const [from, to] = sheet.querySelectorAll("input[type=date]");
  type(from, "${year}-12-04");
  type(to, "${year}-12-07");
  await nap(600);
  const add = [...sheet.querySelectorAll("button")].filter(b => b.innerText.trim() === "Add dates").at(-1);
  const disabled = add.disabled;
  add.click();
  await nap(3500);
  return JSON.stringify({ ticks, before, disabled, stillOpen: Boolean(top()) });
})()
`),
);
expect(
  "every room starts ticked",
  adding.ticks?.length === 3 && adding.ticks.every((tick) => tick.endsWith("=true")),
  JSON.stringify(adding).slice(0, 300),
);
expect(
  "there is no every-room row",
  !/Every room/.test(adding.before ?? ""),
  String(adding.before).replace(/\n+/g, " | ").slice(0, 200),
);
expect(
  "the caption counts the sets",
  String(adding.before).includes("Adds 3 sets of dates, one for each room."),
  String(adding.before).replace(/\n+/g, " | ").slice(0, 300),
);
expect("the sheet closes once added", adding.disabled === false && adding.stillOpen === false, JSON.stringify(adding).slice(-80));
const added = (await houseWindows()).filter((doc) => doc.fields.start.stringValue === `${year}-12-04`);
expect(
  "one set of dates per room reached the database",
  added.length === 3 &&
    new Set(added.map((doc) => doc.fields.roomId?.stringValue)).size === 3 &&
    added.every((doc) => doc.fields.roomId?.stringValue?.startsWith("room-")),
  JSON.stringify(added.map((doc) => doc.fields.roomId)).slice(0, 200),
);

console.log("\nthe whole house can't be free on nights a room has its own dates");
const clash = JSON.parse(
  await page.evaluate(`
(async () => {
  ${IN_PAGE}
  named(document, "Add dates").click();
  await nap(1200);
  const sheet = top();
  if (!sheet) return JSON.stringify({ error: "no sheet" });
  named(sheet, "Whole house").click();
  await nap(300);
  const boxes = sheet.querySelectorAll("[role=checkbox]").length;
  const [from, to] = sheet.querySelectorAll("input[type=date]");
  type(from, "${year}-11-04");
  type(to, "${year}-11-08");
  await nap(600);
  const add = [...sheet.querySelectorAll("button")].filter(b => b.innerText.trim() === "Add dates").at(-1);
  const out = { boxes, text: sheet.innerText, disabled: add.disabled };
  await shut();
  return JSON.stringify(out);
})()
`),
);
expect("choosing the whole house hides the rooms", clash.boxes === 0, JSON.stringify(clash).slice(0, 120));
expect(
  "the clash names the room and says why",
  String(clash.text).includes("Overlaps the Back bedroom's Nov 6 – Nov 9 dates. The whole house can't be free while a room has its own dates."),
  String(clash.text).replace(/\n+/g, " | ").slice(-260),
);
expect("and the dates can't be added", clash.disabled === true, String(clash.disabled));

console.log("\nadd dates from one room's sheet ticks only that room");
const fromRoom = JSON.parse(
  await page.evaluate(`
(async () => {
  ${IN_PAGE}
  named(document, "Attic room").click();
  await nap(1200);
  const room = top();
  if (!room) return JSON.stringify({ error: "no room sheet" });
  const roomText = room.innerText;
  named(room, "Add dates").click();
  await nap(1200);
  const sheet = top();
  const ticks = [...sheet.querySelectorAll("[role=checkbox]")]
    .map(b => b.innerText.replace(/\\n+/g, " ") + "=" + b.getAttribute("aria-checked"));
  const text = sheet.innerText;
  await shut();
  return JSON.stringify({ roomText, ticks, text });
})()
`),
);
expect(
  "the room sheet offers its link, dates and removal",
  ["Share this room", "Create link for this room", "Add dates", "Remove room"].every((words) =>
    String(fromRoom.roomText).includes(words),
  ),
  String(fromRoom.roomText).replace(/\n+/g, " | ").slice(0, 300),
);
expect(
  "only that room is ticked",
  fromRoom.ticks?.filter((tick) => tick.endsWith("=true")).join() === "Attic room=true",
  JSON.stringify(fromRoom.ticks),
);
expect(
  "and the caption says one set",
  String(fromRoom.text).includes("Adds 1 set of dates."),
  String(fromRoom.text).replace(/\n+/g, " | ").slice(0, 300),
);

console.log("\nremoving a room says what it cancels, then cancels it");
await put(`listings/${HOUSE}/checkout/room-back`, { text: str("Leave the back door key.") });
const removing = JSON.parse(
  await page.evaluate(`
(async () => {
  ${IN_PAGE}
  named(document, "Back bedroom").click();
  await nap(1200);
  const room = top();
  if (!room) return JSON.stringify({ error: "no room sheet" });
  named(room, "Remove room").click();
  await nap(1200);
  const ask = top();
  const text = ask.innerText;
  const confirm = [...ask.querySelectorAll("button")].filter(b => b.innerText.trim() === "Remove room").at(-1);
  confirm.click();
  await nap(5000);
  return JSON.stringify({ text, open: Boolean(top()), body: document.body.innerText });
})()
`),
);
if (page.thrown.length)
  console.log("  threw:", page.thrown.splice(0).join("\n         ").slice(0, 1200));
expect(
  "the confirm counts the stays and asks",
  String(removing.text).includes("It cancels 1 upcoming stay and 1 ask"),
  String(removing.text).replace(/\n+/g, " | ").slice(0, 300),
);
expect(
  "the room leaves the page",
  removing.open === false && /house · 2 rooms/i.test(String(removing.body)),
  String(removing.body).replace(/\n+/g, " | ").slice(0, 200),
);
const after = await read(`listings/${HOUSE}`);
expect(
  "the room is gone from the place",
  after && !("room-back" in (after.fields.rooms?.mapValue?.fields ?? {})) &&
    "room-attic" in (after.fields.rooms?.mapValue?.fields ?? {}),
  JSON.stringify(after?.fields?.rooms).slice(0, 200),
);
const left = await houseWindows();
expect(
  "its dates went with it, and nobody else's",
  !left.some((doc) => doc.fields.roomId?.stringValue === "room-back") &&
    left.some((doc) => doc.fields.roomId?.stringValue === "room-attic") &&
    left.some((doc) => doc.name.endsWith("/c-whole")),
  left.map((doc) => doc.name.split("/").pop()).join(),
);
// A removed room's instructions would otherwise sit under an id nothing names.
expect(
  "its check-out instructions went with it",
  (await read(`listings/${HOUSE}/checkout/room-back`)) === null,
);
for (const id of [`${HOUSE}-stay`, `${HOUSE}-ask`]) {
  const booking = await read(`bookings/${id}`);
  expect(
    `${id.endsWith("stay") ? "the stay" : "the ask"} is cancelled as the host's doing`,
    booking?.fields?.status?.stringValue === "CANCELLED" &&
      booking?.fields?.cancelledBy?.stringValue === uid &&
      booking?.fields?.cancelReason?.stringValue === "SLOT_CANCELLED",
    JSON.stringify(booking?.fields?.status),
  );
}

console.log("\nthe host writes check-out instructions for the place and for a room");
const PLACE_TEXT = "Strip the beds.\nBins go out on Sunday.";
const ROOM_TEXT = "Attic door code is 4821.";
const AREA = `
  const typeArea = (el, v) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const checkoutArea = (root) => [...root.querySelectorAll("label")]
    .find(l => (l.innerText || "").startsWith("Check-out instructions"))?.querySelector("textarea");
  const ready = async (root) => {
    for (let i = 0; i < 20; i++) {
      const area = checkoutArea(root());
      if (area && !area.disabled) return area;
      await nap(300);
    }
    return null;
  };
`;
await page.go(`${APP}/#/room/${HOUSE}/edit`, 3000);
const placeField = JSON.parse(
  await page.evaluate(`
(async () => {
  ${IN_PAGE}
  ${AREA}
  const area = await ready(() => document);
  if (!area) return JSON.stringify({ error: "no check-out field on the form" });
  const label = area.closest("label").innerText;
  typeArea(area, ${JSON.stringify(PLACE_TEXT)});
  await nap(400);
  area.scrollIntoView({ block: "center" });
  return JSON.stringify({ label });
})()
`),
);
expect(
  "the place form has the field and says who sees it",
  String(placeField.label).includes("Only guests with a confirmed stay see this."),
  JSON.stringify(placeField).slice(0, 200),
);
await shots(page, "form-field");
await page.evaluate(`
(async () => {
  ${IN_PAGE}
  named(document, "Save changes").click();
  await nap(3500);
  return "saved";
})()
`);
const placeDoc = await read(`listings/${HOUSE}/checkout/place`);
expect(
  "the place's instructions reached the database",
  placeDoc?.fields?.text?.stringValue === PLACE_TEXT &&
    Object.keys(placeDoc.fields).join() === "text",
  JSON.stringify(placeDoc?.fields).slice(0, 200),
);
const ownerPage = await page.evaluate(`document.body.innerText`);
expect(
  "the host's own page shows what is set",
  /#\/room\/[^/]+$/.test(String(await page.evaluate(`location.hash`))) &&
    String(ownerPage).includes("Check-out instructions") &&
    String(ownerPage).includes("Bins go out on Sunday."),
  String(ownerPage).replace(/\n+/g, " | ").slice(0, 300),
);

const roomField = JSON.parse(
  await page.evaluate(`
(async () => {
  ${IN_PAGE}
  ${AREA}
  named(document, "Attic room").click();
  await nap(1200);
  const area = await ready(top);
  if (!area) return JSON.stringify({ error: "no check-out field in the room sheet" });
  typeArea(area, ${JSON.stringify(ROOM_TEXT)});
  await nap(400);
  area.scrollIntoView({ block: "center" });
  return JSON.stringify({ label: area.closest("label").innerText });
})()
`),
);
expect(
  "the room sheet has the field too",
  String(roomField.label).includes("Only guests with a confirmed stay see this."),
  JSON.stringify(roomField).slice(0, 200),
);
await shots(page, "room-sheet");
await page.evaluate(`
(async () => {
  ${IN_PAGE}
  named(top(), "Save changes").click();
  await nap(3000);
  await shut();
  return "saved";
})()
`);
if (page.thrown.length)
  console.log("  threw:", page.thrown.splice(0).join("\n         ").slice(0, 1200));
const roomDoc = await read(`listings/${HOUSE}/checkout/room-attic`);
expect(
  "the room's instructions reached the database",
  roomDoc?.fields?.text?.stringValue === ROOM_TEXT,
  JSON.stringify(roomDoc?.fields).slice(0, 200),
);
const houseAfter = await read(`listings/${HOUSE}`);
// Every friend reads the listing, so the text must not have landed on it.
expect(
  "none of it is on the listing itself",
  !JSON.stringify(houseAfter).includes("4821") && !JSON.stringify(houseAfter).includes("Bins go out"),
);

console.log("\na new place carries its instructions, and its rooms' with it");
await page.go(`${APP}/#/new-place`, 3000);
const made = JSON.parse(
  await page.evaluate(`
(async () => {
  ${IN_PAGE}
  ${AREA}
  type(document.querySelector("#listing-title"), "Made with instructions");
  named(document, "House").click();
  type(document.querySelector("input[aria-label=Address]"), "Lisbon");
  typeArea(checkoutArea(document), "Lock up when you go.");
  await nap(400);
  named(document, "Add a room").click();
  await nap(1200);
  const sheet = top();
  if (!sheet) return JSON.stringify({ error: "no room sheet" });
  type(sheet.querySelector("input"), "Box room");
  typeArea(checkoutArea(sheet), "Window latch sticks.");
  await nap(400);
  named(sheet, "Add room").click();
  await nap(1200);
  named(document, "Add place").click();
  for (let i = 0; i < 30; i++) {
    if (/#\\/room\\//.test(location.hash)) break;
    await nap(500);
  }
  await nap(1500);
  return JSON.stringify({ hash: location.hash });
})()
`),
);
if (page.thrown.length)
  console.log("  threw:", page.thrown.splice(0).join("\n         ").slice(0, 1200));
const madeId = /#\/room\/([^/]+)$/.exec(String(made.hash))?.[1];
expect("the place is created", Boolean(madeId), JSON.stringify(made).slice(0, 200));
const madeDocs = madeId ? ((await read(`listings/${madeId}/checkout`))?.documents ?? []) : [];
const madeRooms = Object.keys((await read(`listings/${madeId}`))?.fields?.rooms?.mapValue?.fields ?? {});
expect(
  "the place's and the room's instructions were saved with it",
  madeDocs.length === 2 &&
    madeDocs.some((doc) => doc.name.endsWith("/place") && doc.fields.text.stringValue === "Lock up when you go.") &&
    madeDocs.some((doc) => doc.name.endsWith(`/${madeRooms[0]}`) && doc.fields.text.stringValue === "Window latch sticks."),
  JSON.stringify(madeDocs.map((doc) => [doc.name.split("/").pop(), doc.fields.text.stringValue])),
);

console.log("\na guest sees them on a confirmed stay, and not on one they only asked for");
const GUEST_EMAIL = `host-check-guest-${Date.now()}@example.com`;
const guest = await browser(GUEST_PROFILE, 9335);
await guest.go(APP);
await guest.evaluate(`
(async () => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  const field = document.querySelector("input");
  set.call(field, ${JSON.stringify(GUEST_EMAIL)});
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  document.querySelector("button[type=submit]").click();
  await new Promise(r => setTimeout(r, 6000));
  return "sent";
})()
`);
const guestCodes = await (await fetch(`${AUTH}/emulator/v1/projects/${AUTH_PROJECT}/oobCodes`)).json();
const guestLink = guestCodes.oobCodes?.findLast((sent) => sent.email === GUEST_EMAIL)?.oobLink;
const guestCode = guestLink ? new URL(guestLink).searchParams.get("oobCode") : "";
await guest.go(
  `${APP}/continue/?mode=signIn&lang=en&apiKey=fake-api-key&oobCode=${encodeURIComponent(guestCode)}#email=${encodeURIComponent(GUEST_EMAIL)}`,
  10000,
);
const everyone = await (
  await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${AUTH_PROJECT}/accounts:query`,
    {
      method: "POST",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  )
).json();
const guestUid = everyone.userInfo?.find((u) => u.email === GUEST_EMAIL)?.localId;
expect("the guest is signed in", Boolean(guestUid));
if (!guestUid) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
await put(`users/${guestUid}`, {
  displayName: str("Guest Under Test"),
  username: str(""),
  searchable: { booleanValue: false },
  createdAt: ts("2026-08-01T00:00:00Z"),
});
const STAY = `${HOUSE}-guest-stay`;
const ASK = `${HOUSE}-guest-ask`;
await put(
  `listings/${HOUSE}/windows/e-attic-stay`,
  houseWindow("09-02", "09-05", "room-attic", { status: str("BOOKED"), bookingId: str(STAY) }),
);
await put(`bookings/${STAY}`, {
  ...houseBooking("e-attic-stay", "09-02", "09-05", "CONFIRMED"),
  guestId: str(guestUid),
});
// The ask is at the OTHER place, where this guest has no stay at all — so it is
// the rules refusing them, not just the page declining to ask.
await put(`listings/${LISTING}/checkout/place`, { text: str("Never shown to an asker.") });
await put(`bookings/${ASK}`, {
  listingId: str(LISTING),
  ownerId: str(uid),
  guestId: str(guestUid),
  windowId: str(WINDOW),
  start: str(`${year}-11-01`),
  end: str(`${year}-11-05`),
  status: str("REQUESTED"),
  cancelledBy: { nullValue: null },
  cancelReason: { nullValue: null },
  hiddenBy: { arrayValue: {} },
  createdAt: int(3000),
});

await guest.go(`${APP}/#/booking/${STAY}`, 1500);
await guest.evaluate(`location.reload(); "reloading"`);
await new Promise((r) => setTimeout(r, 9000));
const stayPage = JSON.parse(
  await guest.evaluate(`
(async () => {
  for (let i = 0; i < 30; i++) {
    if (/Checking out/.test(document.body.innerText)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const heading = [...document.querySelectorAll("h2")].find(h => h.innerText.trim() === "Checking out");
  const section = heading?.closest("section");
  section?.scrollIntoView({ block: "center" });
  return JSON.stringify({
    body: document.body.innerText,
    section: section?.innerText ?? "",
    wraps: [...(section?.querySelectorAll("p") ?? [])].map(p => getComputedStyle(p).whiteSpace),
  });
})()
`),
);
if (guest.thrown.length)
  console.log("  threw:", guest.thrown.splice(0).join("\n         ").slice(0, 1200));
const shown = String(stayPage.section);
expect("the stay is confirmed and theirs", /Your stay is all set/.test(stayPage.body), String(stayPage.body).replace(/\n+/g, " | ").slice(0, 200));
expect("it has a Checking out section", shown.startsWith("Checking out"), shown.replace(/\n+/g, " | ").slice(0, 200));
expect(
  "the place's comes first, then the room's",
  shown.includes("Strip the beds.") &&
    shown.indexOf("Bins go out on Sunday.") < shown.indexOf(ROOM_TEXT),
  shown.replace(/\n+/g, " | ").slice(0, 300),
);
expect(
  "the room's part is named for the room",
  shown.slice(shown.indexOf("Bins go out on Sunday."), shown.indexOf(ROOM_TEXT)).includes("Attic room"),
  shown.replace(/\n+/g, " | ").slice(0, 300),
);
expect(
  "line breaks survive",
  /Strip the beds\.\n+Bins go out/.test(shown) && stayPage.wraps.every((wrap) => wrap === "pre-wrap"),
  JSON.stringify(stayPage.wraps),
);
await shots(guest, "guest-booking");

await guest.go(`${APP}/#/booking/${ASK}`, 6000);
const askPage = await guest.evaluate(`
(async () => {
  for (let i = 0; i < 20; i++) {
    if (/Waiting on/.test(document.body.innerText)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  await new Promise(r => setTimeout(r, 2500));
  return document.body.innerText;
})()
`);
expect("the ask is pending", /Waiting on/.test(String(askPage)), String(askPage).replace(/\n+/g, " | ").slice(0, 200));
expect(
  "a pending ask shows no instructions",
  !/Checking out/.test(String(askPage)) && !/Never shown/.test(String(askPage)),
  String(askPage).replace(/\n+/g, " | ").slice(0, 300),
);
// Asked for directly, as a crafted client would: the rules are what keep an
// asker out, and a friend-less guest of one place out of another's.
const asGuest = { headers: { Authorization: `Bearer ${await guestToken()}` } };
const refused = await fetch(`${DOCS}/listings/${LISTING}/checkout/place`, asGuest);
expect("and the rules refuse them the document", refused.status === 403, String(refused.status));
// The same token against their own stay's, or a 403 above proves only that the
// token was no good.
const allowed = await fetch(`${DOCS}/listings/${HOUSE}/checkout/place`, asGuest);
expect("while allowing them their own stay's", allowed.status === 200, String(allowed.status));
const otherRoom = await fetch(`${DOCS}/listings/${HOUSE}/checkout/room-garden`, asGuest);
expect("but not another room's", otherRoom.status === 403, String(otherRoom.status));

async function guestToken() {
  const minted = await (
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=fake-api-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: GUEST_EMAIL, oobCode: await freshCode() }),
    })
  ).json();
  return minted.idToken;
}
async function freshCode() {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "EMAIL_SIGNIN", email: GUEST_EMAIL, continueUrl: APP }),
  });
  const sent = await (await fetch(`${AUTH}/emulator/v1/projects/${AUTH_PROJECT}/oobCodes`)).json();
  return new URL(sent.oobCodes.findLast((entry) => entry.email === GUEST_EMAIL).oobLink).searchParams.get("oobCode");
}

if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall good");
process.exit(0);
