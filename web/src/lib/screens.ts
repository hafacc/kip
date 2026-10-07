import type { Screen, View } from "./types";

export const HOME_SCREEN: Screen = { kind: "tab", tab: "home" };

// Its own word, not `room/new`, so no listing id can be mistaken for it.
const NEW_PLACE = "new-place";

// A record, so adding a `View` without a route fails to compile.
const TAB_ROUTES: Readonly<Record<View, true>> = {
  home: true,
  browse: true,
  places: true,
  friends: true,
  trips: true,
  settings: true,
  feedback: true,
};

function isTab(name: string): name is View {
  return name in TAB_ROUTES;
}

// The fragment rather than a path, because the app is one statically exported
// route with no server to route with. The ids are not secrets — every read they
// name is gated by the rules. The one id that IS a capability lives on
// /portal/, which the router stays off entirely (see `routable` in the store).
export function screenHash(screen: Screen): string {
  switch (screen.kind) {
    case "tab":
      return screen.tab === "home" ? "#/" : `#/${screen.tab}`;
    case "person":
      return `#/person/${encodeURIComponent(screen.id)}`;
    case "room":
      return screen.windowId === undefined
        ? `#/room/${encodeURIComponent(screen.id)}`
        : `#/room/${encodeURIComponent(screen.id)}/slot/${encodeURIComponent(
            screen.windowId,
          )}`;
    case "booking":
      return `#/booking/${encodeURIComponent(screen.id)}`;
    case "listing-form":
      return screen.id === null
        ? `#/${NEW_PLACE}`
        : `#/room/${encodeURIComponent(screen.id)}/edit`;
  }
}

// The inverse. Null for anything unrecognized, which callers read as "go home"
// rather than "render nothing".
export function screenForHash(hash: string): Screen | null {
  let segments: string[];
  try {
    segments = hash
      .replace(/^#/, "")
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
  } catch {
    return null; // a malformed %-escape names no screen either
  }
  const [first, second, third, fourth] = segments;
  switch (segments.length) {
    case 0:
      return HOME_SCREEN;
    case 1:
      if (isTab(first)) {
        return { kind: "tab", tab: first };
      } else {
        return first === NEW_PLACE ? { kind: "listing-form", id: null } : null;
      }
    case 2:
      switch (first) {
        case "person":
          return { kind: "person", id: second };
        case "room":
          return { kind: "room", id: second };
        case "booking":
          return { kind: "booking", id: second };
        default:
          return null;
      }
    case 3:
      return first === "room" && third === "edit"
        ? { kind: "listing-form", id: second }
        : null;
    case 4:
      return first === "room" && third === "slot"
        ? { kind: "room", id: second, windowId: fourth }
        : null;
    default:
      return null;
  }
}

// A fragment names only the top screen, so a pasted link gets Home seeded
// beneath it — otherwise arriving on a room means arriving with no way back.
export function stackForHash(hash: string): Screen[] {
  const screen = screenForHash(hash) ?? HOME_SCREEN;
  return screen.kind === "tab" ? [screen] : [HOME_SCREEN, screen];
}
