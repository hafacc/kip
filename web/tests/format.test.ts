import { describe, expect, test } from "bun:test";
import { endedWithin, STAY_SIGHT_DAYS, todayIso } from "../utils/format";

describe("todayIso", () => {
  test("is the local calendar date, not UTC", () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    expect(todayIso()).toBe(`${now.getFullYear()}-${month}-${day}`);
  });
});

describe("endedWithin", () => {
  // Noon UTC, so the UTC date is unambiguous.
  const now = Date.parse("2026-09-22T12:00:00Z");

  test("counts back whole UTC days, inclusive of the boundary", () => {
    expect(endedWithin("2026-07-24", STAY_SIGHT_DAYS, now)).toBe(true);
    expect(endedWithin("2026-07-23", STAY_SIGHT_DAYS, now)).toBe(false);
  });

  test("a stay not yet over is always within", () => {
    expect(endedWithin("2027-01-01", STAY_SIGHT_DAYS, now)).toBe(true);
  });
});
