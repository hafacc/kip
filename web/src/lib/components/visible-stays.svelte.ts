import { fetchBookingIfVisible } from "../bookings";
import { isExpired } from "../format";
import { kip } from "../store.svelte";
import type { AvailabilityWindow, Booking } from "../types";

/**
 * The stays behind a place's taken dates that the reader may see, by booking id.
 *
 * One read per taken slot, never a query: a query returning even one unreadable
 * document is refused whole, so the misses have to be taken individually. The
 * reader's own stays come from `trips` instead of costing a read each.
 *
 * Call while a component initializes, passing the dates as a function so a
 * change is followed; read `held` off the result where it is used.
 */
export function visibleStays(windows: () => readonly AvailabilityWindow[]): {
  readonly held: ReadonlyMap<string, Booking>;
} {
  let fetched = $state.raw<ReadonlyMap<string, Booking>>(new Map());
  const mine = $derived(
    new Map(
      kip.trips
        .filter((trip) => trip.status === "CONFIRMED")
        .map((trip) => [trip.id, trip] as const),
    ),
  );
  // Joined into one string so the effect follows the SET of ids, not the array,
  // which is rebuilt on every snapshot.
  const wanted = $derived(
    windows()
      .filter(
        (window) =>
          window.status !== "OPEN" &&
          window.bookingId != null &&
          !mine.has(window.bookingId) &&
          !isExpired(window.end),
      )
      .map((window) => window.bookingId as string)
      .sort()
      .join(","),
  );

  $effect(() => {
    if (!wanted) {
      fetched = new Map();
      return;
    }
    let live = true;
    Promise.all(
      wanted
        .split(",")
        .map(async (id) => [id, await fetchBookingIfVisible(id)] as const),
    )
      .then((pairs) => {
        if (!live) return;
        fetched = new Map(
          pairs.filter((pair): pair is [string, Booking] => pair[1] !== null),
        );
      })
      .catch((error) => console.error("visibleStays", error));
    return () => {
      live = false;
    };
  });

  const held = $derived(new Map([...mine, ...fetched]));
  return {
    get held() {
      return held;
    },
  };
}
