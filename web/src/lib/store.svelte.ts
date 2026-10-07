import {
  signOut as fbSignOut,
  onIdTokenChanged,
  sendEmailVerification,
  signInAnonymously,
  type User,
  updateProfile,
} from "firebase/auth";
import { afterNavigate, goto } from "$app/navigation";
import { page } from "$app/state";
import {
  authSettled,
  type Door,
  doorsOf,
  googleSignIn,
  sameDoors,
} from "./auth";
import {
  type BookingOutcome,
  cancelBookingAsGuest,
  cancelBookingAsOwner,
  cancelWindowAsOwner,
  claimGuestAccess,
  claimKnownBy,
  confirmBooking,
  hideBooking as fbHideBooking,
  requestBooking as fbRequestBooking,
  hideBookings,
  watchIncomingBookings,
  watchMyTrips,
} from "./bookings";
import type { CheckoutMap } from "./checkout";
import { clientState, recordDebugEvent } from "./debug";
import { hasUnreadFeedback, readAdmin } from "./feedback";
import { auth, errorCode, onListenerLost } from "./firebase";
import { endedWithin, STAY_SIGHT_DAYS } from "./format";
import {
  setSearchable as fbSetSearchable,
  unfriend as fbUnfriend,
  fetchUserProfile,
  findUserByUsername,
  healFriendEdges,
  updateProfileIdentity,
  watchFriends,
  watchOwnProfile,
} from "./friends";
import { watchDeletion } from "./leave";
import {
  addRoom,
  addRoomWindows,
  addWindow,
  createListing as fbCreateListing,
  deleteListing as fbDeleteListing,
  removeRoom as fbRemoveRoom,
  setListingPhotos as fbSetListingPhotos,
  setRoomPhotos as fbSetRoomPhotos,
  updateListing as fbUpdateListing,
  updateRoom as fbUpdateRoom,
  updateWindow as fbUpdateWindow,
  fetchFriendListings,
  fetchListing,
  fetchWindows,
  type ListingInput,
  type NewRoom,
  type RoomInput,
  reorderRooms,
  setCheckout,
  setWindowAutoAccept,
  watchCheckout,
  watchMyListings,
  watchWindows,
} from "./listings";
import { deleteAvatar, uploadAvatar } from "./photos";
import {
  publishListingPortal as fbPublishPortal,
  publishRoomPortal as fbPublishRoomPortal,
  publishSlotPortal as fbPublishSlotPortal,
  publishUserPortal as fbPublishUserPortal,
  revokeListingPortal as fbRevokePortal,
  revokeRoomPortal as fbRevokeRoomPortal,
  revokeSlotPortal as fbRevokeSlotPortal,
  revokeUserPortal as fbRevokeUserPortal,
  ownedPortalIds,
  propagateListing,
  propagateProfile,
} from "./portals";
import {
  GATE_BACKSTOP_MS,
  type GateEvent,
  type GateState,
  gateStep,
  NO_SESSION,
} from "./profile-gate";
import { decideReattach, NO_LOSSES } from "./reattach";
import {
  declineRequest,
  acceptRequest as fbAcceptRequest,
  sendRequest as fbSendRequest,
  watchIncomingConnectRequests,
  watchOutgoingConnectRequests,
} from "./requests";
import { HOME_SCREEN, screenHash, stackForHash } from "./screens";
import {
  EMPTY_CRITERIA,
  type SavedSearch,
  type SearchCriteria,
  sameCriteria,
} from "./search";
import {
  deleteSavedSearch as fbDeleteSavedSearch,
  markSearchSeen as fbMarkSearchSeen,
  saveSearch as fbSaveSearch,
  MAX_SAVED_SEARCHES,
  watchSavedSearches,
} from "./searches";
import {
  setTextNotify as fbSetTextNotify,
  giveSmsConsent,
  requestTextCheck,
  setPrefs,
  standingConsent,
  stopTexts,
  watchPrefs,
} from "./settings";
import {
  type AvailabilityWindow,
  type Booking,
  type ConnectRequest,
  DEFAULT_PREFS,
  type DeletionRequest,
  type Friend,
  type Listing,
  type ListingPhoto,
  type NotifyKind,
  type NotifySmsKind,
  type Party,
  type Prefs,
  type Profile,
  type Screen,
  SMS_CONSENT_VERSION,
  type View,
} from "./types";
import {
  createProfile,
  claimUsername as fbClaimUsername,
  normalizeUsername,
} from "./username";

type WindowMap = Readonly<Record<string, readonly AvailabilityWindow[]>>;
type CheckoutByListing = Readonly<Record<string, CheckoutMap>>;

const EMPTY_FRIENDS: Friend[] = [];
const EMPTY_REQUESTS: ConnectRequest[] = [];
const EMPTY_LISTINGS: Listing[] = [];
const EMPTY_BOOKINGS: Booking[] = [];
const EMPTY_PROFILES: Profile[] = [];
const EMPTY_SEARCHES: SavedSearch[] = [];
const EMPTY_WINDOWS: WindowMap = {};
const EMPTY_CHECKOUT: CheckoutByListing = {};

// Applied at the two subscriptions rather than per list, so every surface
// honours a hide without each one remembering to. Only a CANCELLED booking can
// be hidden — the rules allow the hide only then — so a live stay carrying a
// stray uid is still shown rather than vanishing while it binds someone.
function shownTo(
  uid: string,
  onChange: (bookings: Booking[]) => void,
): (bookings: Booking[]) => void {
  return (bookings) =>
    onChange(
      bookings.filter(
        (booking) =>
          booking.status !== "CANCELLED" || !booking.hiddenBy.includes(uid),
      ),
    );
}

// Everything below is module state: one store for the page, read through `kip`
// and brought to life by `startKip`. Whole values are swapped in rather than
// mutated, so `$state.raw` throughout — nothing here needs a deep proxy, and a
// Firebase `User` must not be wrapped in one.
let user = $state.raw<User | null>(null);
// Snapshots of the User fields the app branches on. They can't be read off
// `user`: Firebase mutates that object IN PLACE and hands back the same
// reference after linking, unlinking or verifying, so assigning it again tells
// nothing that depends on it to update.
let anonymous = $state(false);
let admin = $state(false);
let unreadFeedback = $state(false);
let emailVerified = $state(false);
let email = $state<string | null>(null);
let phone = $state<string | null>(null);
let doors = $state.raw<readonly Door[]>([]);
// Lives in Firestore, not on the Auth user, so it's subscribed not derived.
let profile = $state.raw<Profile | null>(null);
let profileReady = $state(false);
let profileUnreachable = $state(false);
let deletion = $state.raw<DeletionRequest | null>(null);
let deletionReady = $state(false);
// The uid whose teardown this session has actually SEEN, so the document
// going away can be told from never having been there.
let leaving: string | null = null;
// The uid `deletionReady` was last reset for.
let deletionFor: string | null = null;
// Firebase restores a session asynchronously, so this stops the gate flashing
// the sign-in screen at someone already signed in.
let authReady = $state(false);
// Re-attaching listeners the server dropped. Bumping `generation` re-subscribes
// all of them; `reattachTimer` being non-null doubles as the guard that
// collapses a burst of losses into one retry; `gate` (profile-gate.ts) stops a
// re-attach being mistaken for a new session.
let generation = $state(0);
let listenersLost = $state(false);
let reattachState = NO_LOSSES;
let reattachTimer: ReturnType<typeof setTimeout> | null = null;
let gate: GateState = NO_SESSION;
let prefs = $state.raw<Prefs>(DEFAULT_PREFS);
let savedSearches = $state.raw<SavedSearch[]>(EMPTY_SEARCHES);
let friends = $state.raw<Friend[]>(EMPTY_FRIENDS);
let incomingRequests = $state.raw<ConnectRequest[]>(EMPTY_REQUESTS);
let outgoingRequests = $state.raw<ConnectRequest[]>(EMPTY_REQUESTS);
let myListings = $state.raw<Listing[]>(EMPTY_LISTINGS);
let myWindows = $state.raw<WindowMap>(EMPTY_WINDOWS);
let myCheckout = $state.raw<CheckoutByListing>(EMPTY_CHECKOUT);
let friendListings = $state.raw<Listing[]>(EMPTY_LISTINGS);
let friendWindows = $state.raw<WindowMap>(EMPTY_WINDOWS);
let trips = $state.raw<Booking[]>(EMPTY_BOOKINGS);
let tripListings = $state.raw<Listing[]>(EMPTY_LISTINGS);
let incomingBookings = $state.raw<Booking[]>(EMPTY_BOOKINGS);
let counterparts = $state.raw<Profile[]>(EMPTY_PROFILES);
let criteria = $state.raw<SearchCriteria>(EMPTY_CRITERIA);
// The uid all of the above belongs to.
let stateUid: string | null = null;
// Once per stay per page load; the rules can't see the booking as CONFIRMED
// inside either confirm commit.
let claimedStays = new Set<string>();
// Each browse fetch takes a ticket, and only the newest may land: an older one
// finishing late would otherwise overwrite a newer friend set, or fill in the
// last session's places after a sign-out.
let browseTicket = 0;

// Home is only the starting guess — `seedStack` reads the real stack out of the
// URL, which can't happen here because this also runs at prerender.
let stack = $state.raw<readonly Screen[]>([HOME_SCREEN]);
let popped = $state(0);
// How many history entries of ours lie behind the current one, which is how
// `back` tells "a screen of ours is behind this" from "leaving the site".
let depth = 0;
// Names the current history entry, so its scroll offset can be kept beside it.
let entry = "";
// Set by a traversal and cleared once the router has delivered the state of
// the entry it landed on.
let popPending = false;

// A texted code or a credential that already belongs to another account signs
// INTO it without signing out, so the uid changes under a live session with no
// sign-out in between. Called from the auth listener itself, in the same turn
// that sets `user`: effects run after it, so none of them can act for the new
// uid on the old account's trips and bookings first.
function resetSession(uid: string | null): void {
  stateUid = uid;
  friends = EMPTY_FRIENDS;
  incomingRequests = EMPTY_REQUESTS;
  outgoingRequests = EMPTY_REQUESTS;
  myListings = EMPTY_LISTINGS;
  myWindows = EMPTY_WINDOWS;
  myCheckout = EMPTY_CHECKOUT;
  friendListings = EMPTY_LISTINGS;
  friendWindows = EMPTY_WINDOWS;
  trips = EMPTY_BOOKINGS;
  tripListings = EMPTY_LISTINGS;
  incomingBookings = EMPTY_BOOKINGS;
  counterparts = EMPTY_PROFILES;
  prefs = DEFAULT_PREFS;
  savedSearches = EMPTY_SEARCHES;
  admin = false;
  unreadFeedback = false;
  claimedStays = new Set();
}

// The pending timer has to be cleared alongside the counters: sign-out kills
// every listener by itself, so an armed timer would re-attach against the new
// session — and, being the burst guard, swallow its first real loss.
function resetReattach(): void {
  if (reattachTimer !== null) clearTimeout(reattachTimer);
  reattachTimer = null;
  reattachState = NO_LOSSES;
  listenersLost = false;
}

// The id of `src/routes/(app)/+page.svelte`.
const APP_ROUTE = "/(app)";

// The app's one route. /portal/ and /continue/ mean something else by their
// fragment — a capability token, a sign-in link — and a route written over
// either one destroys it, within a second of load; the document pages have no
// screens at all.
function routable(): boolean {
  return page.route.id === APP_ROUTE;
}

const SCROLL_KEY = "kip.scroll";
// Set across the reload that adopts a hand-edited fragment; see `onHashChange`.
const ADOPTED_KEY = "kip.adopted";

// Whether this load is that reload. Read once: the mark is for one arrival.
function takeAdopted(): boolean {
  try {
    const adopted = sessionStorage.getItem(ADOPTED_KEY) !== null;
    sessionStorage.removeItem(ADOPTED_KEY);
    return adopted;
  } catch {
    return false;
  }
}

// Offsets for more entries than anyone goes back through in one tab.
const SCROLL_KEPT = 60;

function scrollOffsets(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/**
 * The scroll offset remembered for the current history entry.
 *
 * Per history entry rather than in store state, and in session storage, since
 * that's what survives a reload and a forward.
 */
export function historyScroll(): number {
  return scrollOffsets()[entry] ?? 0;
}

/** Remember a scroll offset; called by the page, the only place that knows which element scrolls. */
export function rememberScroll(offset: number): void {
  if (!routable() || !entry) return;
  const offsets = scrollOffsets();
  // Re-inserted so the entry in use is the newest, and the oldest go first.
  delete offsets[entry];
  offsets[entry] = offset;
  const kept = Object.entries(offsets).slice(-SCROLL_KEPT);
  try {
    sessionStorage.setItem(
      SCROLL_KEY,
      JSON.stringify(Object.fromEntries(kept)),
    );
  } catch {
    // Storage refused: returning lands at the top, which is where it started.
  }
}

// Through the router's own shallow navigation, never `history.pushState`: the
// router numbers every entry, and one written behind its back shares a number
// with its neighbour, which it then refuses to traverse between.
// `persistState` is what hands the stack back after a reload.
function writeEntry(next: readonly Screen[], replace: boolean): void {
  goto(screenHash(next[next.length - 1]), {
    shallow: true,
    replace,
    persistState: true,
    state: { kipStack: next, kipDepth: depth, kipEntry: entry },
  }).catch((error) => console.error("navigate", error));
}

function pushEntry(next: readonly Screen[]): void {
  if (!routable()) return;
  depth += 1;
  entry = crypto.randomUUID();
  writeEntry(next, false);
}

// The entry keeps its name, and so its scroll: a replace changes what this
// entry POINTS AT and not where the reader is standing in it.
function replaceEntry(next: readonly Screen[]): void {
  if (!routable()) return;
  writeEntry(next, true);
}

// Every forward move pushes a real history entry and back() delegates to
// history.back(), so the OS back button and the in-app one are one button.
function setView(tab: View): void {
  const next: Screen[] = [{ kind: "tab", tab }];
  pushEntry(next);
  stack = next;
}

function navigate(target: Screen): void {
  const next = [...stack, target];
  pushEntry(next);
  stack = next;
}

// Same history entry, so after creating a listing back returns to where the
// form was opened from rather than to an empty form.
function replace(target: Screen): void {
  const next = [...stack.slice(0, -1), target];
  replaceEntry(next);
  stack = next;
}

function back(): void {
  if (depth > 0) {
    window.history.back();
  } else {
    // Nothing of ours behind this entry, so Back means "up a level" rather
    // than "leave the site".
    const [base] = stack;
    const next: Screen[] = [base.kind === "tab" ? base : HOME_SCREEN];
    replaceEntry(next);
    stack = next;
  }
}

// Arriving on the app's route by anything but a traversal: a load, a reload,
// or a link from one of the document pages.
function seedStack(): void {
  // The fragment wins when the two disagree, being the half a user can edit.
  const saved = page.state.kipStack ?? [];
  const restored =
    saved.length > 0 &&
    screenHash(saved[saved.length - 1]) === window.location.hash
      ? [...saved]
      : stackForHash(window.location.hash);
  // An adopted entry has the screen the fragment was typed over behind it, so
  // Back is a real step back rather than "up a level".
  const adopted = takeAdopted();
  depth = page.state.kipDepth ?? (adopted ? 1 : 0);
  entry = page.state.kipEntry ?? crypto.randomUUID();
  // Never push: the arrival entry is ours to annotate, and pushing would leave
  // a phantom under the first Back.
  replaceEntry(restored);
  stack = restored;
}

// The owner's public identity as copied into share links. Read at CALL time:
// an action can be HELD — captured at the tap, run after the identity sheet
// writes a profile — and it must see the profile that sheet wrote.
function asParty(): Party {
  return {
    uid: profile?.uid ?? "",
    username: profile?.username ?? "",
    displayName: profile?.displayName ?? "",
    photoURL: profile?.photoURL ?? null,
  };
}

function findListing(listingId: string): Listing | undefined {
  return myListings.find((candidate) => candidate.id === listingId);
}

async function refreshBrowse(): Promise<void> {
  browseTicket += 1;
  const ticket = browseTicket;
  const uids = friendUidsKey ? friendUidsKey.split(",") : [];
  if (!user || uids.length === 0) {
    friendListings = EMPTY_LISTINGS;
    friendWindows = EMPTY_WINDOWS;
    return;
  }
  const listings = await fetchFriendListings(uids);
  const windowLists = await Promise.all(
    listings.map((listing) => fetchWindows(listing.id)),
  );
  if (ticket !== browseTicket) return;
  const windows: Record<string, readonly AvailabilityWindow[]> = {};
  listings.forEach((listing, index) => {
    windows[listing.id] = windowLists[index];
  });
  friendListings = listings;
  friendWindows = windows;
}

// One room's dates, for the screen that just changed them.
async function refreshWindows(listingId: string): Promise<void> {
  const asked = auth().currentUser?.uid;
  const windows = await fetchWindows(listingId);
  if (auth().currentUser?.uid !== asked) return;
  friendWindows = { ...friendWindows, [listingId]: windows };
}

function knownPerson(uid: string): Party | null {
  return (
    friends.find((friend) => friend.uid === uid) ??
    counterparts.find((person) => person.uid === uid) ??
    null
  );
}

// Passes the verdict through: a caller that writes a profile afterwards has
// to know whether it landed in someone else's account.
function signIn(): Promise<{ sameAccount: boolean }> {
  return googleSignIn();
}

// Signing out of a session with no credential does not end it, it DESTROYS
// it: the uid lives in this browser and nowhere else, so there is nothing to
// sign back in with. The guard lives here rather than at each surface, because
// the failure mode is a future screen adding a sign-out without the check —
// callers that mean it (the Settings exit, behind its confirm) pass `force`.
async function signOut(force = false): Promise<void> {
  if (auth().currentUser?.isAnonymous && !force) {
    throw new Error("signOut would destroy an account with no way back in");
  }
  await fbSignOut(auth());
}

// Reading `auth().currentUser` directly replaced a real session with an empty
// anonymous one: it is null for a beat after load while Firebase restores a
// persisted session. `authSettled` is that same read, held until the restore.
async function ensureAnonymous(): Promise<string> {
  const restored = await authSettled();
  // A restored session is not proof the account still EXISTS. Firebase reaps
  // idle anonymous accounts, and the browser keeps its tokens either way — so
  // a returning visitor could hold a session for a uid that is gone, claim a
  // grant as it, be refused, and see a live share link reported as turned off.
  // Forcing a refresh is what asks the server; only a real answer is trusted.
  if (restored) {
    if (!restored.isAnonymous) return restored.uid;
    try {
      await restored.getIdToken(true);
      return restored.uid;
    } catch (error) {
      // ONLY a server saying this account is gone. A network blip is not that,
      // and treating it as one hands them a brand-new uid — losing the pending
      // ask, the grant and the name this function exists to preserve.
      const code = errorCode(error);
      const gone =
        code === "auth/user-token-expired" ||
        code === "auth/user-not-found" ||
        code === "auth/user-disabled";
      if (!gone) return restored.uid;
      console.warn("ensureAnonymous: account is gone, starting a new one");
    }
  }
  return (await signInAnonymously(auth())).user.uid;
}

// Write the profile with the chosen display name, and mirror it onto the Auth
// user so anything still reading that (fallbacks) stays consistent. No handle
// is claimed here — that happens later, from Settings, and only to turn
// searchability on.
async function completeOnboarding(displayName: string): Promise<void> {
  const current = auth().currentUser;
  if (!current) throw new Error("not signed in");
  await createProfile(current.uid, {
    displayName,
    photoURL: current.photoURL ?? null,
  });
  await updateProfile(current, { displayName }).catch((error) =>
    console.error("updateProfile", error),
  );
}

// A handle already taken fails on the registry's owner-only update rule. Your
// friends' copies of you then still hold the old handle (usually ''), so they
// are healed here — after the claim, since the edge rule reads the committed
// profile. The claim has landed either way, so a failed heal is only logged.
async function claimUsername(username: string): Promise<void> {
  const current = auth().currentUser;
  if (!current) throw new Error("not signed in");
  await fbClaimUsername(current.uid, username);
  await healFriendEdges(
    current.uid,
    {
      displayName: profile?.displayName ?? "",
      photoURL: profile?.photoURL ?? null,
      username: normalizeUsername(username),
    },
    friends.map((friend) => friend.uid),
  ).catch((error) => console.error("healFriendEdges", error));
}

function setSearchable(searchable: boolean): Promise<void> {
  if (!user) throw new Error("not signed in");
  return fbSetSearchable(user.uid, searchable);
}

// Profile and friend edges first, since the edge rule reads the COMMITTED
// profile; then the links you've shared, which nobody else could fix for you.
// Bookings need nothing — they carry no names.
async function spreadIdentity(
  uid: string,
  displayName: string,
  photoURL: string | null,
): Promise<void> {
  await updateProfileIdentity(
    uid,
    { displayName, photoURL, username: profile?.username ?? "" },
    friends.map((friend) => friend.uid),
  );
  await propagateProfile(
    { ...asParty(), displayName, photoURL },
    ownedPortalIds(prefs.profilePortalId, myListings, myWindows),
  ).catch((error) => console.error("propagateProfile", error));
}

async function updateDisplayName(displayName: string): Promise<void> {
  const current = auth().currentUser;
  if (!current) throw new Error("not signed in");
  await spreadIdentity(current.uid, displayName, profile?.photoURL ?? null);
  await updateProfile(current, { displayName }).catch((error) =>
    console.error("updateProfile", error),
  );
}

// The object is deleted only after the profile stops pointing at it, so a
// failed delete leaves an invisible orphan rather than broken images.
async function setProfilePhoto(file: Blob | null): Promise<void> {
  const current = auth().currentUser;
  if (!current) throw new Error("not signed in");
  const photoURL = file
    ? await uploadAvatar(current.uid, file)
    : providerPhotoURL;
  await spreadIdentity(
    current.uid,
    profile?.displayName ?? "",
    photoURL ?? null,
  );
  if (!file) await deleteAvatar(current.uid);
}

// Resolved here so the caller gets an outcome without touching Firestore.
async function sendFriendRequest(
  username: string,
): Promise<"sent" | "not-found" | "already-friends" | "self"> {
  const me = profile;
  if (!me) throw new Error("not signed in");
  const target = await findUserByUsername(username);
  if (!target) return "not-found";
  if (target.uid === me.uid) return "self";
  const friend = friends.find((candidate) => candidate.uid === target.uid);
  if (friend) return "already-friends";
  await fbSendRequest(me, target);
  return "sent";
}

function acceptRequest(request: ConnectRequest): Promise<void> {
  if (!profile) throw new Error("not signed in");
  return fbAcceptRequest(asParty(), request);
}

function unfriend(friendUid: string): Promise<void> {
  if (!user) throw new Error("not signed in");
  return fbUnfriend(user.uid, friendUid);
}

async function saveSearch(
  label: string,
  next: SearchCriteria,
): Promise<"saved" | "full" | "duplicate"> {
  if (!user) throw new Error("not signed in");
  if (savedSearches.length >= MAX_SAVED_SEARCHES) return "full";
  // Checked here rather than only where the control is hidden: the filters
  // sit above the name field in the same sheet, so they can become a
  // duplicate of something saved while the name is being typed.
  if (savedSearches.some((saved) => sameCriteria(saved.criteria, next))) {
    return "duplicate";
  }
  await fbSaveSearch(user.uid, label, next);
  return "saved";
}

async function markSearchSeen(searchId: string): Promise<void> {
  if (!user) throw new Error("not signed in");
  await fbMarkSearchSeen(user.uid, searchId);
}

async function deleteSavedSearch(searchId: string): Promise<void> {
  if (!user) throw new Error("not signed in");
  await fbDeleteSavedSearch(user.uid, searchId);
}

function createListing(
  listingId: string,
  input: ListingInput,
  photos: readonly ListingPhoto[],
  rooms: readonly NewRoom[] = [],
  checkout = "",
): Promise<void> {
  if (!user) throw new Error("not signed in");
  return fbCreateListing(user.uid, listingId, input, photos, rooms, checkout);
}

// Rewrites the place's copy in every link that carries one.
async function updateListing(
  listingId: string,
  input: ListingInput,
): Promise<void> {
  await fbUpdateListing(listingId, input);
  const listing = findListing(listingId);
  if (!listing) return;
  await propagateListing(
    {
      ...listing,
      title: input.title,
      type: input.type,
      description: input.description,
      location: { ...listing.location, ...input.location },
    },
    myWindows[listingId] ?? [],
  ).catch((error) => console.error("propagateListing", error));
}

async function setListingPhotos(
  listingId: string,
  photos: readonly ListingPhoto[],
): Promise<void> {
  await fbSetListingPhotos(listingId, photos);
  const listing = findListing(listingId);
  if (!listing) return;
  await propagateListing(
    { ...listing, photos: [...photos] },
    myWindows[listingId] ?? [],
  ).catch((error) => console.error("propagateListing", error));
}

function requestBooking(
  listing: Listing,
  window: AvailabilityWindow,
): Promise<BookingOutcome> {
  if (!profile) throw new Error("not signed in");
  return fbRequestBooking(profile.uid, listing, window);
}

// A room edit is an edit to the place, so it reaches the same copies: the
// room's own link and any link on its dates.
async function updateRoom(
  listingId: string,
  roomId: string,
  input: RoomInput,
): Promise<void> {
  await fbUpdateRoom(listingId, roomId, input);
  const listing = findListing(listingId);
  const room = listing?.rooms[roomId];
  if (!listing || !room) return;
  await propagateListing(
    {
      ...listing,
      rooms: { ...listing.rooms, [roomId]: { ...room, ...input } },
    },
    myWindows[listingId] ?? [],
  ).catch((error) => console.error("propagateListing", error));
}

async function setRoomPhotos(
  listingId: string,
  roomId: string,
  photos: readonly ListingPhoto[],
): Promise<void> {
  await fbSetRoomPhotos(listingId, roomId, photos);
  const listing = findListing(listingId);
  const room = listing?.rooms[roomId];
  if (!listing || !room) return;
  await propagateListing(
    {
      ...listing,
      rooms: {
        ...listing.rooms,
        [roomId]: { ...room, photos: [...photos] },
      },
    },
    myWindows[listingId] ?? [],
  ).catch((error) => console.error("propagateListing", error));
}

function removeRoom(listing: Listing, roomId: string): Promise<void> {
  return fbRemoveRoom(listing, roomId, incomingBookings);
}

// The store holds the bookings live, so the caller needn't gather them.
function deleteListing(listing: Listing): Promise<void> {
  return fbDeleteListing(listing, incomingBookings);
}

function updateWindow(
  listingId: string,
  windowId: string,
  fields: { start: string; end: string; details: string },
): Promise<void> {
  return fbUpdateWindow(listingId, windowId, fields, incomingBookings);
}

function cancelWindow(listingId: string, windowId: string): Promise<void> {
  const bookingsOnWindow = incomingBookings.filter(
    (booking) =>
      booking.listingId === listingId && booking.windowId === windowId,
  );
  return cancelWindowAsOwner(listingId, windowId, bookingsOnWindow);
}

function hideBooking(bookingId: string): Promise<void> {
  if (!user) throw new Error("not signed in");
  return fbHideBooking(user.uid, bookingId);
}

function hideBookingsById(bookingIds: readonly string[]): Promise<void> {
  if (!user) throw new Error("not signed in");
  return hideBookings(user.uid, bookingIds);
}

// `trips` is already filtered to what this user sees, so no query is needed.
function hideCancelledTrips(): Promise<void> {
  if (!user) throw new Error("not signed in");
  return hideBookings(
    user.uid,
    trips.filter((trip) => trip.status === "CANCELLED").map((trip) => trip.id),
  );
}

async function setShareStays(share: boolean): Promise<void> {
  if (!user) throw new Error("not signed in");
  prefs = { ...prefs, shareStaysWithFriends: share };
  await setPrefs(user.uid, { shareStaysWithFriends: share });
}

async function setNotify(key: NotifyKind, on: boolean): Promise<void> {
  if (!user) throw new Error("not signed in");
  const notify = { ...prefs.notify, [key]: on };
  prefs = { ...prefs, notify };
  await setPrefs(user.uid, { notify });
}

async function keepTexts(number: string): Promise<void> {
  if (!user) throw new Error("not signed in");
  const standing = standingConsent(prefs);
  const notifySms = Object.fromEntries(
    Object.keys(prefs.notifySms).map((kind) => [kind, true]),
  ) as Prefs["notifySms"];
  prefs = {
    ...prefs,
    notifySms,
    smsConsentAt: Date.now(),
    smsConsentVersion: SMS_CONSENT_VERSION,
    smsConsentNumber: number,
    smsStopped: false,
  };
  await giveSmsConsent(user.uid, SMS_CONSENT_VERSION, number, standing);
}

async function setTexts(on: boolean): Promise<void> {
  if (!user) throw new Error("not signed in");
  if (on) {
    // Consent is to being texted at a number, so there has to be one. The
    // switch is disabled without it; this is the same fact where a crafted
    // caller meets it.
    if (!phone) throw new Error("no number to consent about");
    await keepTexts(phone);
  } else {
    prefs = { ...prefs, notifySms: DEFAULT_PREFS.notifySms };
    await stopTexts(user.uid);
  }
}

// Optimistic on the ASKING, never on the answer: the local write moves the
// control into its waiting state at once, and only the sender may say whether
// a text got through.
async function checkTexts(): Promise<void> {
  if (!user) throw new Error("not signed in");
  const at = Date.now();
  prefs = { ...prefs, smsProbeAt: at };
  await requestTextCheck(user.uid, at);
}

async function setTextNotify(key: NotifySmsKind, on: boolean): Promise<void> {
  if (!user) throw new Error("not signed in");
  const notifySms = { ...prefs.notifySms, [key]: on };
  prefs = { ...prefs, notifySms };
  await fbSetTextNotify(user.uid, key, on);
}

// Mail only ever goes to a verified address, so this is the way out of that.
async function resendVerification(): Promise<void> {
  const current = auth().currentUser;
  if (!current) throw new Error("not signed in");
  await sendEmailVerification(current);
}

function publishListingPortal(listing: Listing): Promise<string> {
  if (!profile) throw new Error("not signed in");
  return fbPublishPortal(listing, asParty());
}

function revokeListingPortal(listing: Listing): Promise<void> {
  return listing.publicPortalId
    ? fbRevokePortal(listing.id, listing.publicPortalId)
    : Promise.resolve();
}

function publishUserPortal(): Promise<string> {
  if (!profile) throw new Error("not signed in");
  return fbPublishUserPortal(asParty());
}

function revokeUserPortal(): Promise<void> {
  return user && prefs.profilePortalId
    ? fbRevokeUserPortal(user.uid, prefs.profilePortalId)
    : Promise.resolve();
}

function publishSlotPortal(
  listingId: string,
  window: AvailabilityWindow,
): Promise<string> {
  if (!profile) throw new Error("not signed in");
  const listing = findListing(listingId);
  if (!listing) throw new Error("listing missing");
  return fbPublishSlotPortal(listing, window, asParty());
}

function revokeSlotPortal(
  listingId: string,
  window: AvailabilityWindow,
): Promise<void> {
  return window.publicPortalId
    ? fbRevokeSlotPortal(listingId, window.id, window.publicPortalId)
    : Promise.resolve();
}

function publishRoomPortal(listing: Listing, roomId: string): Promise<string> {
  if (!profile) throw new Error("not signed in");
  return fbPublishRoomPortal(listing, roomId, asParty());
}

function revokeRoomPortal(listing: Listing, roomId: string): Promise<void> {
  const portalId = listing.rooms[roomId]?.publicPortalId;
  return portalId
    ? fbRevokeRoomPortal(listing.id, roomId, portalId)
    : Promise.resolve();
}

const screen = $derived(stack[stack.length - 1]);
const view = $derived<View>(stack[0].kind === "tab" ? stack[0].tab : "home");
const canGoBack = $derived(stack.length > 1);

// Off `providerData`, not the Auth user's `photoURL`, which is ours to
// overwrite — this is the original to fall back to. Keyed on `doors` as well,
// which is what changes when a provider is linked to the same `User`.
const providerPhotoURL = $derived.by(() => {
  void doors;
  return user?.providerData.find((held) => held.photoURL)?.photoURL ?? null;
});

// Every key below is a string so that a dependent runs when its CONTENT
// changes: a re-attach re-delivers the same listings as a new array, and would
// otherwise rebuild every listener that hangs off them.
const feedbackSeenAt = $derived(prefs.feedbackSeenAt);
const leavingNow = $derived(deletion !== null);
// The filter is because the windows read rule get()s the listing, so attaching
// before the create is acknowledged races into a permission-denied.
const watchedListingsKey = $derived(
  myListings
    .filter((listing) => listing.createdAt > 0)
    .map((listing) => listing.id)
    .join(","),
);
const friendUidsKey = $derived(friends.map((friend) => friend.uid).join(","));

// A share-link stay is at a place Browse never asks for, so without this the
// guest holds a stay against a place they can't name. Keyed on what's still
// missing, so an unreadable place stays missing rather than refetching.
const missingListingsKey = $derived.by(() => {
  const known = new Set(
    [...myListings, ...friendListings, ...tripListings].map(
      (listing) => listing.id,
    ),
  );
  return [
    ...new Set(
      trips
        .map((trip) => trip.listingId)
        .filter((listingId) => !known.has(listingId)),
    ),
  ]
    .sort()
    .join(",");
});

const unclaimedStaysKey = $derived(
  trips
    .filter((trip) => trip.status === "CONFIRMED" && !claimedStays.has(trip.id))
    .map((trip) => `${trip.id}:${trip.listingId}`)
    .sort()
    .join(","),
);

// The stay that best authorises each lookup, straight from `stayPermitsSight`:
// a REQUESTED one for the HOST only — being asked is not consent to be looked
// up, but confirming a stranger called "Someone" is the moment identity
// matters most — then a CONFIRMED one either way, but only while its checkout
// is recent enough for the rule to still honour it. Anything else would be a
// pointer the rules refuse, leaving the name unresolved.
const counterpartsKey = $derived.by(() => {
  const uid = user?.uid;
  const known = new Set([
    ...friends.map((friend) => friend.uid),
    ...counterparts.map((person) => person.uid),
  ]);
  const stays = new Map<string, { id: string; rank: number }>();
  for (const booking of [...trips, ...incomingBookings]) {
    const otherUid =
      booking.guestId === uid ? booking.ownerId : booking.guestId;
    if (!known.has(otherUid)) {
      let rank = 0;
      if (booking.status === "REQUESTED" && booking.ownerId === uid) {
        rank = 2;
      } else if (
        booking.status === "CONFIRMED" &&
        endedWithin(booking.end, STAY_SIGHT_DAYS)
      ) {
        rank = 1;
      }
      const held = stays.get(otherUid);
      if (!held || rank > held.rank) {
        stays.set(otherUid, { id: rank > 0 ? booking.id : "", rank });
      }
    }
  }
  return [...stays]
    .map(([otherUid, stay]) => `${otherUid}:${stay.id}`)
    .sort()
    .join(",");
});

/**
 * Bring the store to life: the auth listener, every Firestore subscription
 * and the history stack.
 *
 * Call once, while the root layout initializes — the effects it registers
 * belong to that component, which lives as long as the page does. During
 * prerendering it registers nothing, which is what keeps Firebase out of the
 * exported HTML.
 */
export function startKip(): void {
  $effect(() => {
    const stop = onListenerLost(() => {
      // The owned listeners die together whenever the token is what's refused,
      // so a burst has to buy ONE re-attach, not one per listener.
      if (reattachTimer !== null) return;
      const decision = decideReattach(reattachState, Date.now());
      reattachState = decision.next;
      if (decision.verdict === "giveUp") {
        // Once per incident: listeners attached after giving up (a new place's
        // windows, say) can still be lost, and each would otherwise log again.
        if (decision.announce) {
          recordDebugEvent("listeners-lost", {
            spent: decision.next.spent,
            ...clientState(),
          });
        }
        // Never cleared by a later re-attach: listeners report only their
        // failures here, and the snapshot a re-attached one delivers first may
        // come from cache, so nothing proves the data is live again. The notice
        // offers a reload, which does.
        listenersLost = true;
      } else {
        reattachTimer = setTimeout(() => {
          reattachTimer = null;
          generation += 1;
        }, decision.delay);
      }
    });
    return () => {
      stop();
      if (reattachTimer !== null) clearTimeout(reattachTimer);
    };
  });

  $effect(() => {
    // onIdTokenChanged, not onAuthStateChanged: the latter fires only on a uid
    // change, and signing up from a share link LINKS the anonymous account,
    // which keeps it. Token refreshes come through here too, which costs
    // nothing — the User reference is unchanged, so every effect holds.
    return onIdTokenChanged(auth(), (next) => {
      const uid = next?.uid ?? null;
      if (uid !== stateUid) resetSession(uid);
      if (next !== user) resetReattach();
      user = next;
      anonymous = next?.isAnonymous ?? false;
      emailVerified = next?.emailVerified ?? false;
      email = next?.email ?? null;
      phone = next?.phoneNumber ?? null;
      // A fresh array every refresh would wake everything reading the doors
      // for nothing: the primitives above compare by value, this one has to
      // be told how.
      const opened = doorsOf(next);
      if (!sameDoors(doors, opened)) doors = opened;
      authReady = true;
    });
  });

  // Off the token, so it costs nothing and needs no rule to authorise. It runs
  // on `user` rather than inside the auth listener because reading the claims
  // is async: `settled` is what stops a sign-out being overtaken by the
  // previous account's answer landing late.
  $effect(() => {
    const current = user;
    if (!current) {
      admin = false;
      return;
    }
    let settled = false;
    void readAdmin(current).then((yes) => {
      if (!settled) admin = yes;
    });
    return () => {
      settled = true;
    };
  });

  // Re-asked whenever the seen mark moves, which is what clears the dot: opening
  // the inbox writes the mark, the prefs listener carries it back, and this runs
  // again. Only for the operator — nobody else may read the collection.
  $effect(() => {
    if (!admin) {
      unreadFeedback = false;
      return;
    }
    let settled = false;
    void hasUnreadFeedback(feedbackSeenAt).then((any) => {
      if (!settled) unreadFeedback = any;
    });
    return () => {
      settled = true;
    };
  });

  // Feeds `gateStep` and mirrors the result into state. The listener is the
  // only source; `watchOwnProfile` settles a cached absence itself.
  $effect(() => {
    // Read only to depend on it: bumping it is how a lost listener gets
    // re-attached.
    void generation;
    const current = user;
    if (!current) {
      gate = gateStep(gate, { kind: "signedOut" });
      profile = null;
      profileReady = false;
      profileUnreachable = false;
      return;
    }
    const { uid } = current;
    const apply = (event: GateEvent): void => {
      gate = gateStep(gate, event);
      profileReady = gate.openFor === uid;
      profileUnreachable = gate.unreachable;
    };
    const silence = (code: string): void => {
      const known = gate.unreachable;
      apply({ kind: "silence", uid });
      // Only the flip: retries repeat the failure, not the incident.
      if (!known && gate.unreachable) {
        recordDebugEvent("profile-unreachable", { code, ...clientState() });
      }
    };
    apply({ kind: "attach", uid });
    // A session swap must not show the old profile while the new one loads; a
    // re-attach for the same open session must not blank it.
    if (gate.openFor !== uid) profile = null;
    const stop = watchOwnProfile(
      uid,
      (next) => {
        profile = next;
        apply({ kind: "answered", uid });
      },
      silence,
    );
    const timer = setTimeout(() => silence("backstop"), GATE_BACKSTOP_MS);
    return () => {
      clearTimeout(timer);
      stop();
    };
  });

  // Watched beside the profile rather than with the owned bundle below, which
  // this one pauses: everything in that bundle is being deleted, so a listener
  // on it spends the re-attach budget reporting a teardown that is going to
  // plan. Silence is not fatal — after the backstop the app renders anyway,
  // since blocking everyone on a listener that never answered would be a worse
  // failure than the rare screen this gate exists to show.
  $effect(() => {
    void generation;
    const current = user;
    if (!current) {
      deletion = null;
      deletionReady = true;
      leaving = null;
      deletionFor = null;
      return;
    }
    const { uid } = current;
    // Only for a new session. A `generation` re-attach for the same one must
    // not shut this: the page splashes while it is false, which would blank
    // an open sheet and any half-typed form — the profile gate's rule too.
    if (deletionFor !== uid) {
      deletionFor = uid;
      deletion = null;
      deletionReady = false;
    }
    const stop = watchDeletion(
      uid,
      (request) => {
        deletion = request;
        deletionReady = true;
        if (request) {
          // Only while it is still running. A teardown that has GIVEN UP can be
          // cleared from the screen it puts up — the rule allows exactly that
          // one delete — so its disappearance is somebody choosing to stay, and
          // reading it as the ending signed them out of an account that is
          // still there. The function never deletes a request it wrote an error
          // on, so nothing else can arrive at this absence.
          leaving = request.failed ? null : uid;
        } else if (leaving === uid) {
          // The document is deleted last, after the Auth account it belongs to,
          // so this is the ending. Straight to Firebase, since `signOut`'s guard
          // would refuse an account destroyed on purpose.
          leaving = null;
          fbSignOut(auth()).catch((error) => console.error("signOut", error));
        }
      },
      () => {
        deletionReady = true;
      },
    );
    const timer = setTimeout(() => {
      deletionReady = true;
    }, GATE_BACKSTOP_MS);
    return () => {
      clearTimeout(timer);
      stop();
    };
  });

  // Subscribe to everything owned by the signed-in user. Signing out needs no
  // branch here: `resetSession` has already emptied every list.
  $effect(() => {
    void generation;
    const current = user;
    if (!current || leavingNow) return;
    const { uid } = current;
    const unsubs = [
      watchFriends(uid, (next) => {
        friends = next;
      }),
      watchIncomingConnectRequests(uid, (next) => {
        incomingRequests = next;
      }),
      watchOutgoingConnectRequests(uid, (next) => {
        outgoingRequests = next;
      }),
      watchMyListings(uid, (next) => {
        myListings = next;
      }),
      watchMyTrips(
        uid,
        shownTo(uid, (next) => {
          trips = next;
        }),
      ),
      watchIncomingBookings(
        uid,
        shownTo(uid, (next) => {
          incomingBookings = next;
        }),
      ),
      watchPrefs(uid, (next) => {
        prefs = next;
      }),
      watchSavedSearches(uid, (next) => {
        savedSearches = next;
      }),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  });

  // Live windows and check-out instructions for each of my own listings.
  $effect(() => {
    void generation;
    if (!user) return;
    const listingIds = watchedListingsKey ? watchedListingsKey.split(",") : [];
    const unsubs = listingIds.flatMap((listingId) => [
      watchWindows(listingId, (windows) => {
        myWindows = { ...myWindows, [listingId]: windows };
      }),
      watchCheckout(listingId, (checkout) => {
        myCheckout = { ...myCheckout, [listingId]: checkout };
      }),
    ]);
    return () => {
      for (const unsub of unsubs) unsub();
    };
  });

  // Friends' places are fetched, not live: the working set is small and this
  // sidesteps dynamic multi-collection listeners. This is the only automatic
  // trigger — screens don't ask on mount, since one wanting a single room would
  // pull every friend's places. The friend list changing is the only thing that
  // makes the set stale, and it re-keys this.
  $effect(() => {
    void user;
    void friendUidsKey;
    refreshBrowse().catch((error) => console.error("refreshBrowse", error));
  });

  $effect(() => {
    if (!user || !missingListingsKey) return;
    Promise.all(missingListingsKey.split(",").map(fetchListing))
      .then((found) => {
        const listings = found.filter((listing) => listing !== null);
        if (listings.length > 0) {
          tripListings = [...tripListings, ...listings];
        }
      })
      .catch((error) => console.error("fetchListing", error));
  });

  $effect(() => {
    const current = user;
    if (!current || !unclaimedStaysKey) return;
    for (const pair of unclaimedStaysKey.split(",")) {
      const [bookingId, listingId] = pair.split(":");
      claimedStays.add(bookingId);
      claimGuestAccess(listingId, current.uid, bookingId).catch((error) =>
        console.error("claimGuestAccess", error),
      );
    }
  });

  // A booking names two uids and nothing else, and the two may not be able to
  // read each other — the `knownBy` pointer written below IS the authorisation
  // for the fetch that follows it, which is why they run in order. Keyed on the
  // stay too, so confirming re-runs a resolution refused while it was pending.
  $effect(() => {
    const current = user;
    if (!current || !counterpartsKey) return;
    Promise.all(
      counterpartsKey.split(",").map(async (pair) => {
        const [otherUid, bookingId] = pair.split(":");
        if (bookingId) {
          await claimKnownBy(current.uid, otherUid, bookingId).catch((error) =>
            console.error("claimKnownBy", error),
          );
        }
        return fetchUserProfile(otherUid);
      }),
    )
      .then((found) => {
        const people = found.filter((person) => person !== null);
        if (people.length > 0) {
          counterparts = [...counterparts, ...people];
        }
      })
      .catch((error) => console.error("fetchUserProfile", error));
  });

  // The address is attached from ANOTHER browser, by a REST call this session
  // never sees — so nothing would otherwise tell it. `reload` refreshes the user
  // and `getIdToken(true)` mints the token the rules read, which is what makes
  // `identities` non-empty for `hasCredential()`. Both are needed: the flag this
  // app branches on and the claim Firestore checks are different things.
  $effect(() => {
    if (!anonymous) return;
    const check = (): void => {
      const current = auth().currentUser;
      if (!current?.isAnonymous) return;
      current
        .reload()
        .then(() => current.getIdToken(true))
        .catch(() => undefined);
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  });

  // A traversal is the router's to read: it hands the landed entry's state to
  // `page.state` a moment after `popstate`, and the effect below adopts it.
  // Nothing here ever writes history, which is what stops the double-entry
  // echo.
  $effect(() => {
    function onPop(event: PopStateEvent): void {
      // An entry the browser made for a hand-edited fragment carries no state
      // at all, and `onHashChange` answers for it.
      if (event.state !== null) popPending = true;
    }
    // A fragment typed into the address bar. The browser has already pushed an
    // entry the router knows nothing about, so the page is loaded again on it:
    // `seedStack` then reads the fragment and the entry is an ordinary arrival.
    function onHashChange(): void {
      if (!routable() || popPending) return;
      if (screenHash(stack[stack.length - 1]) === window.location.hash) return;
      try {
        sessionStorage.setItem(ADOPTED_KEY, "1");
      } catch {
        // Storage refused: Back from the new screen goes up a level instead.
      }
      window.location.reload();
    }
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHashChange);
    };
  });

  $effect(() => {
    const landed = page.state;
    if (!popPending) return;
    popPending = false;
    if (!routable()) return;
    const stacked = landed.kipStack;
    stack =
      stacked && stacked.length > 0
        ? [...stacked]
        : stackForHash(window.location.hash);
    depth = landed.kipDepth ?? 0;
    entry = landed.kipEntry ?? crypto.randomUUID();
    // Bumped so the page can tell one pop from the next even on the same screen.
    popped += 1;
  });

  afterNavigate((navigation) => {
    // Our own writes, and traversals, which the effect above settles.
    if (navigation.shallow || navigation.type === "popstate") return;
    if (routable()) seedStack();
  });
}

/**
 * Everything the app knows and can do: the session, the signed-in user's live
 * data, friends' places, the screen stack, and every action on them.
 *
 * Read fields off it where they are used (`kip.friends`) — they are reactive
 * getters, so destructuring one takes a snapshot that never updates. The
 * actions are plain functions and may be passed around freely.
 */
export const kip = {
  get authReady(): boolean {
    return authReady;
  },
  /**
   * Live data stopped arriving and re-attaching didn't fix it, so what's on
   * screen is the last snapshot rather than the truth.
   */
  get listenersLost(): boolean {
    return listenersLost;
  },
  get user(): User | null {
    return user;
  },
  /** Snapshot of `user.isAnonymous`; never read it off `user`. */
  get anonymous(): boolean {
    return anonymous;
  },
  /** Snapshot of `user.emailVerified`; never read it off `user`. */
  get emailVerified(): boolean {
    return emailVerified;
  },
  /**
   * Whether this account operates kip, which draws exactly one menu row. False
   * until asked, so the row appears a beat late rather than flashing for
   * everyone — and the rules refuse the reads behind it either way.
   */
  get admin(): boolean {
    return admin;
  },
  /**
   * Anything in the inbox written since the operator last opened it. One
   * document at most is read to answer it, since it draws a dot and not a count.
   */
  get unreadFeedback(): boolean {
    return unreadFeedback;
  },
  get email(): string | null {
    return email;
  },
  /**
   * E.164, and the only address a text can go to: kip never stores a number to
   * reach someone, so the Auth account is the whole record of one.
   */
  get phone(): string | null {
    return phone;
  },
  /** Every way in this account has, in the order Firebase reports them. */
  get doors(): readonly Door[] {
    return doors;
  },
  get profile(): Profile | null {
    return profile;
  },
  /** Distinguishes "still loading" from "loaded, needs a name". */
  get profileReady(): boolean {
    return profileReady;
  },
  /**
   * Their account is being dismantled by the trigger that watches
   * `deletions/{uid}`, and the phase it last reported. Null means no such
   * document, which is both "not leaving" and "finished".
   */
  get deletion(): DeletionRequest | null {
    return deletion;
  },
  /**
   * Whether that has been answered at all — the app renders behind it, so a
   * teardown must never be raced past by a screen drawn before the answer.
   */
  get deletionReady(): boolean {
    return deletionReady;
  },
  /**
   * The profile gate could not be settled: no answer is coming right now.
   * Self-healing — a late answer still opens the gate. Distinct from
   * `listenersLost`, which is data going stale AFTER it arrived.
   */
  get profileUnreachable(): boolean {
    return profileUnreachable;
  },
  get prefs(): Prefs {
    return prefs;
  },
  get friends(): Friend[] {
    return friends;
  },
  get incomingRequests(): ConnectRequest[] {
    return incomingRequests;
  },
  get outgoingRequests(): ConnectRequest[] {
    return outgoingRequests;
  },
  get myListings(): Listing[] {
    return myListings;
  },
  get myWindows(): WindowMap {
    return myWindows;
  },
  /**
   * Check-out instructions for each of my places, by listing id. A place is
   * absent until its first answer arrives.
   */
  get myCheckout(): CheckoutByListing {
    return myCheckout;
  },
  get friendListings(): Listing[] {
    return friendListings;
  },
  get friendWindows(): WindowMap {
    return friendWindows;
  },
  get trips(): Booking[] {
    return trips;
  },
  /**
   * Places a stay points at that aren't a friend's — readable only through the
   * guest pointer, so nothing else fetches them.
   */
  get tripListings(): Listing[] {
    return tripListings;
  },
  get incomingBookings(): Booking[] {
    return incomingBookings;
  },
  /**
   * The friend edge where there is one (no read), else the profile resolved
   * through the shared stay. Null when they can't be read at all.
   */
  knownPerson,
  get view(): View {
    return view;
  },
  get screen(): Screen {
    return screen;
  },
  get canGoBack(): boolean {
    return canGoBack;
  },
  /** Increments on back/forward, so arriving can be told from returning. */
  get popped(): number {
    return popped;
  },
  get criteria(): SearchCriteria {
    return criteria;
  },
  get savedSearches(): readonly SavedSearch[] {
    return savedSearches;
  },
  saveSearch,
  markSearchSeen,
  deleteSavedSearch,
  setView,
  navigate,
  replace,
  back,
  setCriteria(next: SearchCriteria): void {
    criteria = next;
  },
  refreshBrowse,
  refreshWindows,
  signIn,
  signOut,
  /**
   * For the share-link page only, whose live reads need an identity to hang a
   * grant on. Never replaces a real session.
   */
  ensureAnonymous,
  completeOnboarding,
  updateDisplayName,
  /** Null drops back to the provider's photo. Either way every copy is healed. */
  setProfilePhoto,
  get providerPhotoURL(): string | null {
    return providerPhotoURL;
  },
  claimUsername,
  setSearchable,
  sendFriendRequest,
  acceptRequest,
  declineRequest,
  cancelRequest: declineRequest,
  unfriend,
  createListing,
  updateListing,
  setListingPhotos,
  deleteListing,
  /**
   * Resolves to the new room's id. Pass `roomId` (from `newRoomId`) and
   * `photos` when they were uploaded before the room existed.
   */
  addRoom,
  /** `key` is PLACE_KEY or a room id; blank text removes the instructions. */
  setCheckout,
  updateRoom,
  setRoomPhotos,
  reorderRooms,
  /** Cancels the room's future stays and asks, and deletes its dates and links. */
  removeRoom,
  addWindow,
  /** The same dates in each of several rooms, in one commit. */
  addRoomWindows,
  setWindowAutoAccept,
  updateWindow,
  cancelWindow,
  requestBooking,
  confirmBooking,
  cancelTrip: cancelBookingAsGuest,
  declineBooking: cancelBookingAsOwner,
  /** A hide, not a delete — the other party keeps their copy. */
  hideBooking,
  hideCancelledTrips,
  hideBookingsById,
  publishListingPortal,
  revokeListingPortal,
  publishUserPortal,
  revokeUserPortal,
  publishSlotPortal,
  revokeSlotPortal,
  /** Publishing again regenerates: the room's previous link dies with it. */
  publishRoomPortal,
  revokeRoomPortal,
  setShareStays,
  setNotify,
  /**
   * One answer for every SMS kind, since one switch collects the consent they
   * all ride on.
   */
  setTexts,
  checkTexts,
  /** One kind, once texts are on at all. */
  setTextNotify,
  /**
   * The same act as switching them on, for a number that has just arrived: the
   * dialog it comes from carries the current disclosures, so this is a fresh
   * consent naming the new phone and not the old one transferred onto it. The
   * number is passed rather than read off `phone`, which the link that produced
   * it may not have reached yet.
   */
  keepTexts,
  resendVerification,
};
