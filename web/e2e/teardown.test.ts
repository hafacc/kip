// The account teardown end to end against the emulators (Firestore, Auth and
// Functions): the whole claim of this design is that the SERVER finishes what
// the browser used to abandon, and nothing else here can see a trigger run.
// Run it with `bun e2e:teardown`; without the emulators it is skipped, so a
// plain `bun test` passes.
//
// Seeded under `demo-kip`, the id `emulators:exec` was started with: the
// function's Admin SDK reads `GCLOUD_PROJECT` from the emulator, and a fixture
// under any other id is invisible to it.

import { describe as bunDescribe, expect, test } from "bun:test";
import {
  accountExists,
  arr,
  bool,
  EMULATOR_PROJECT,
  EmulatedFirestore,
  type Fields,
  int,
  map,
  nul,
  signUp,
  str,
  text,
  ts,
} from "./emulators.ts";

const emulated = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST,
);
const describe = emulated ? bunDescribe : bunDescribe.skip;

const firestore = new EmulatedFirestore(EMULATOR_PROJECT);
// Covers the function's own settle delay (it waits for the notification
// triggers its writes fired to read the profile) plus a cold start.
const FINISH_TIMEOUT_MS = 120_000;

const FRIEND = "teardown-friend";
const ASKED = "teardown-asked";
const ASKER = "teardown-asker";
const HOST = "teardown-host";
const GUEST = "teardown-guest";
const PENDING_GUEST = "teardown-guest-pending";
const MINE = "teardown-listing";
const THEIRS = "teardown-host-listing";

function iso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const now = () => ts(new Date().toISOString());

async function seed(leaver: string): Promise<void> {
  await firestore.put(`users/${leaver}`, {
    displayName: str("Leaver"),
    username: str(""),
    searchable: bool(false),
    createdAt: now(),
  });
  await firestore.put(`users/${leaver}/settings/prefs`, {
    profilePortalId: str("teardown-portal-user"),
    shareStaysWithFriends: bool(true),
  });
  await firestore.put(`users/${leaver}/searches/s1`, { label: str("Lisbon") });
  await firestore.put(`users/${leaver}/knownBy/${HOST}`, {
    bookingId: str("teardown-booking-guest"),
  });
  // The other direction, the half that used to be left behind: notes OTHER
  // people hold about the leaver, and a marker under someone else's listing,
  // both keyed by a uid that is about to mean nobody.
  await firestore.put(`users/${HOST}/knownBy/${leaver}`, {
    bookingId: str("teardown-booking-guest"),
  });
  // Planted by a stay that has already BEEN. Nothing cancels it, so the cancel
  // loop would never reach it, which is why the sweep reads every booking.
  await firestore.put(`listings/${THEIRS}/guests/${leaver}`, {
    bookingId: str("teardown-booking-past"),
  });

  // Both sides of one friendship: a one-sided delete leaves a row that renders
  // a name and never answers.
  await firestore.put(`users/${leaver}/friends/${FRIEND}`, {
    displayName: str("Friend"),
    username: str("friend_h"),
    photoURL: nul(),
    since: now(),
  });
  await firestore.put(`users/${FRIEND}/friends/${leaver}`, {
    displayName: str("Leaver"),
    username: str(""),
    photoURL: nul(),
    since: now(),
  });

  await firestore.put(`connectRequests/${leaver}_${ASKED}`, {
    from: str(leaver),
    to: str(ASKED),
    fromName: str("Leaver"),
    fromUsername: str(""),
    createdAt: now(),
  });
  await firestore.put(`connectRequests/${ASKER}_${leaver}`, {
    from: str(ASKER),
    to: str(leaver),
    fromName: str("Asker"),
    fromUsername: str("asker_h"),
    createdAt: now(),
  });

  await firestore.put("portals/teardown-portal-user", {
    scope: str("USER"),
    ownerId: str(leaver),
    ownerName: str("Leaver"),
    ownerPhotoURL: nul(),
    createdAt: int(0),
  });
  await firestore.put("portals/teardown-portal-listing", {
    scope: str("LISTING"),
    ownerId: str(leaver),
    ownerName: str("Leaver"),
    ownerPhotoURL: nul(),
    listingId: str(MINE),
    createdAt: int(0),
  });
  // A visitor's proof they hold the link. Deleting the portal does not delete
  // what hangs off it, so this is somebody ELSE's uid left in the leaver's data.
  await firestore.put("portals/teardown-portal-user/grants/visitor-uid", {
    expires: int(0),
  });

  await firestore.put(`listings/${MINE}`, {
    ownerId: str(leaver),
    title: str("Spare room"),
    type: str("ROOM"),
    description: str(""),
    location: map({ label: str("Lisbon"), lat: nul(), lng: nul() }),
    photos: arr([
      map({ id: str("p1"), url: str("https://example.invalid/p1") }),
    ]),
    publicPortalId: str("teardown-portal-listing"),
    createdAt: int(1),
  });
  const slot = (
    start: number,
    end: number,
    bookingId: string | null,
  ): Fields => ({
    start: str(iso(start)),
    end: str(iso(end)),
    status: str(bookingId ? "BOOKED" : "OPEN"),
    autoAccept: bool(false),
    details: str(""),
    bookingId: bookingId ? str(bookingId) : nul(),
    createdAt: int(1),
  });
  await firestore.put(`listings/${MINE}/windows/w1`, slot(10, 14, null));
  await firestore.put(
    `listings/${MINE}/windows/w2`,
    slot(20, 24, "teardown-booking-incoming"),
  );
  await firestore.put(`listings/${MINE}/guests/${GUEST}`, {
    bookingId: str("teardown-booking-incoming"),
  });
  await firestore.put(`listings/${MINE}/checkout/place`, {
    text: str("Bins out on Sunday."),
  });
  await firestore.put(`listings/${MINE}/checkout/some-room`, {
    text: str("Door code 1234."),
  });

  // Someone else's place, where the leaver is the guest: the one slot that has
  // to be HANDED BACK rather than deleted.
  await firestore.put(`listings/${THEIRS}`, {
    ownerId: str(HOST),
    title: str("Their flat"),
    type: str("FLAT"),
    description: str(""),
    location: map({ label: str("Porto"), lat: nul(), lng: nul() }),
    photos: arr([]),
    publicPortalId: nul(),
    createdAt: int(1),
  });
  await firestore.put(
    `listings/${THEIRS}/windows/hw1`,
    slot(30, 34, "teardown-booking-guest"),
  );

  const bookings: Record<
    string,
    [
      listingId: string,
      ownerId: string,
      guestId: string,
      windowId: string,
      start: number,
      end: number,
      status: string,
    ]
  > = {
    // As guest, still ahead: cancelled, and its slot released.
    "teardown-booking-guest": [
      THEIRS,
      HOST,
      leaver,
      "hw1",
      30,
      34,
      "CONFIRMED",
    ],
    // As guest, already been: a record for both parties, not an obligation.
    "teardown-booking-past": [
      THEIRS,
      HOST,
      leaver,
      "hw0",
      -20,
      -16,
      "CONFIRMED",
    ],
    // As host, confirmed: the guest hears their stay was called off.
    "teardown-booking-incoming": [
      MINE,
      leaver,
      GUEST,
      "w2",
      20,
      24,
      "CONFIRMED",
    ],
    // As host, still pending: an ask that can never now be answered.
    "teardown-booking-pending": [
      MINE,
      leaver,
      PENDING_GUEST,
      "w1",
      10,
      14,
      "REQUESTED",
    ],
  };
  for (const [
    id,
    [listingId, ownerId, guestId, windowId, start, end, status],
  ] of Object.entries(bookings)) {
    await firestore.put(`bookings/${id}`, {
      listingId: str(listingId),
      ownerId: str(ownerId),
      guestId: str(guestId),
      windowId: str(windowId),
      start: str(iso(start)),
      end: str(iso(end)),
      status: str(status),
      cancelledBy: nul(),
      cancelReason: nul(),
      hiddenBy: arr([]),
      createdAt: now(),
    });
  }
}

/** wait for the request to vanish, collecting the phases it reports on the way */
async function waitForFinish(
  leaver: string,
): Promise<{ finished: boolean; seen: string[]; error?: string }> {
  const seen: string[] = [];
  const deadline = Date.now() + FINISH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const request = await firestore.read(`deletions/${leaver}`);
    if (!request) {
      return { finished: true, seen };
    }
    const phase = text(request.phase);
    if (phase && seen.at(-1) !== phase) {
      seen.push(phase);
    }
    if (request.error) {
      return { finished: false, seen, error: text(request.error) };
    }
    await Bun.sleep(250);
  }
  return { finished: false, seen, error: "timed out" };
}

describe("leaving", () => {
  test(
    "the teardown finishes on its own, and leaves other people's records whole",
    async () => {
      const leaver = await signUp(`teardown-${Date.now()}@example.com`);
      await seed(leaver);
      // The client's whole part in leaving: one document, and it may close the
      // tab.
      await firestore.put(`deletions/${leaver}`, { requestedAt: now() });
      const { finished, seen, error } = await waitForFinish(leaver);

      expect({ finished, error }).toEqual({ finished: true, error: undefined });
      // It reported its progress on the way.
      expect(seen.length).toBeGreaterThan(0);
      for (const phase of seen) {
        expect(["stays", "places", "friends", "profile", "account"]).toContain(
          phase,
        );
      }

      const gone = async (path: string) =>
        (await firestore.read(path)) === null;
      // What the leaver had.
      for (const path of [
        `users/${leaver}`,
        `users/${leaver}/settings/prefs`,
        `users/${leaver}/searches/s1`,
        `users/${leaver}/knownBy/${HOST}`,
        `listings/${MINE}`,
        `listings/${MINE}/windows/w1`,
        `listings/${MINE}/windows/w2`,
        `listings/${MINE}/checkout/place`,
        `listings/${MINE}/checkout/some-room`,
        `listings/${MINE}/guests/${GUEST}`,
        "portals/teardown-portal-user",
        "portals/teardown-portal-listing",
        "portals/teardown-portal-user/grants/visitor-uid",
        // Nobody is left holding a note about them, including from a stay that
        // already happened.
        `users/${HOST}/knownBy/${leaver}`,
        `listings/${THEIRS}/guests/${leaver}`,
        // What other people had: both sides of the friendship, and requests
        // both ways.
        `users/${FRIEND}/friends/${leaver}`,
        `users/${leaver}/friends/${FRIEND}`,
        `connectRequests/${leaver}_${ASKED}`,
        `connectRequests/${ASKER}_${leaver}`,
      ]) {
        expect({ path, gone: await gone(path) }).toEqual({ path, gone: true });
      }
      expect(await accountExists(leaver)).toBe(false);

      const stamp = async (id: string) => {
        const fields = (await firestore.read(`bookings/${id}`)) ?? {};
        return [
          text(fields.status),
          text(fields.cancelledBy),
          text(fields.cancelReason),
        ];
      };
      // Their stay at someone else's place is cancelled, by them.
      expect(await stamp("teardown-booking-guest")).toEqual([
        "CANCELLED",
        leaver,
        "STAY_CANCELLED",
      ]);
      // That host has their nights back.
      const released =
        (await firestore.read(`listings/${THEIRS}/windows/hw1`)) ?? {};
      expect(text(released.status)).toBe("OPEN");
      expect(released.bookingId).toEqual(nul());
      // Their guest's confirmed stay is cancelled.
      const [incomingStatus, incomingBy] = await stamp(
        "teardown-booking-incoming",
      );
      expect([incomingStatus, incomingBy]).toEqual(["CANCELLED", leaver]);
      // A pending ask against their place is cancelled.
      const [pendingStatus, , pendingReason] = await stamp(
        "teardown-booking-pending",
      );
      expect([pendingStatus, pendingReason]).toEqual([
        "CANCELLED",
        "SLOT_CANCELLED",
      ]);
      // The line between a record and an obligation: cancelling a visit that
      // already happened would tell someone their stay was called off after
      // they had been.
      expect((await stamp("teardown-booking-past"))[0]).toBe("CONFIRMED");
    },
    FINISH_TIMEOUT_MS + 60_000,
  );
});
