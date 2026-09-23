// When to re-attach a listener the server dropped. Split from the store because
// the effect around it needs React, Firebase and a clock, and this needs none of
// them — the same reason `messages.ts` is separate from its triggers.

// Backing off rather than retrying flat: the first failure is usually a race
// that has already resolved, and nothing still failing at six seconds is a race.
export const REATTACH_DELAYS: readonly number[] = [500, 2_000, 6_000];
// A loss this long after the previous one starts a new budget. Without it, one
// hiccup early in a long session leaves it permanently one loss from giving up.
export const REATTACH_QUIET = 60_000;

export type ReattachState = {
  // Indexes REATTACH_DELAYS, so it is also how many retries are left.
  readonly spent: number;
  readonly lastLoss: number; // 0 means no loss yet, not 1970
  // Already told the user this incident, so later losses in it stay quiet.
  readonly gaveUp: boolean;
};

export const NO_LOSSES: ReattachState = {
  spent: 0,
  lastLoss: 0,
  gaveUp: false,
};

export type ReattachDecision =
  | {
      readonly verdict: "retry";
      readonly delay: number;
      readonly next: ReattachState;
    }
  // Retrying into a standing refusal only hammers it, so the caller tells the
  // user instead — once per incident, which is what `announce` says. A loss
  // after giving up still moves `lastLoss`, so a slow bleed stays one incident.
  | {
      readonly verdict: "giveUp";
      readonly announce: boolean;
      readonly next: ReattachState;
    };

// `now` is a parameter so a test can walk the clock.
export function decideReattach(
  state: ReattachState,
  now: number,
): ReattachDecision {
  const fresh = now - state.lastLoss > REATTACH_QUIET && state.lastLoss !== 0;
  const spent = fresh ? 0 : state.spent;
  const gaveUp = fresh ? false : state.gaveUp;
  const delay = REATTACH_DELAYS[spent];
  if (delay === undefined) {
    return {
      verdict: "giveUp",
      announce: !gaveUp,
      next: { spent, lastLoss: now, gaveUp: true },
    };
  } else {
    return {
      verdict: "retry",
      delay,
      next: { spent: spent + 1, lastLoss: now, gaveUp },
    };
  }
}
