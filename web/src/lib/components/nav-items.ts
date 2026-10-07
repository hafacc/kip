import LuDoorOpen from "~icons/lucide/door-open";
import LuHouse from "~icons/lucide/house";
import LuLuggage from "~icons/lucide/luggage";
import LuSearch from "~icons/lucide/search";
import LuUsers from "~icons/lucide/users";
import type { Icon } from "../listing-icons";
import { kip } from "../store.svelte";
import type { View } from "../types";

export type NavItem = {
  readonly view: View;
  readonly label: string;
  readonly icon: Icon;
  readonly badge: number;
};

// The primary destinations, shared by the desktop top bar and the mobile dock.
// Settings lives in the profile menu (AuthMenu) instead, to keep it to five
// thumb-sized tabs. Reads the store, so call it from a `$derived`.
export function navItems(): NavItem[] {
  const pendingBookings = kip.incomingBookings.filter(
    (booking) => booking.status === "REQUESTED",
  ).length;

  return [
    { view: "home", label: "Home", icon: LuHouse, badge: 0 },
    { view: "browse", label: "Browse", icon: LuSearch, badge: 0 },
    {
      view: "places",
      label: "Places",
      icon: LuDoorOpen,
      // Stays people are asking for. Friend asks are counted on Friends, not
      // here — they were double-counted when the two request kinds merged names.
      badge: pendingBookings,
    },
    { view: "trips", label: "Trips", icon: LuLuggage, badge: 0 },
    {
      view: "friends",
      label: "Friends",
      icon: LuUsers,
      badge: kip.incomingRequests.length,
    },
  ];
}
