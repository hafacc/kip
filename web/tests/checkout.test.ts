import { describe, expect, it } from "bun:test";
import { checkoutParts, stayOpensCheckout } from "../utils/checkout";

describe("checkoutParts", () => {
  it("shows nothing when nothing is written", () => {
    expect(checkoutParts(null, null, "Attic")).toEqual([]);
  });

  it("shows the place's alone, unlabelled", () => {
    expect(checkoutParts("Bins out.", null, null)).toEqual([
      { label: null, text: "Bins out." },
    ]);
  });

  // Naming the only block would be a heading over nothing to tell it from.
  it("shows the room's alone, unlabelled", () => {
    expect(checkoutParts(null, "Code 1234.", "Attic")).toEqual([
      { label: null, text: "Code 1234." },
    ]);
  });

  it("puts the place first and names the room's part when both exist", () => {
    expect(checkoutParts("Bins out.", "Code 1234.", "Attic")).toEqual([
      { label: null, text: "Bins out." },
      { label: "Attic", text: "Code 1234." },
    ]);
  });

  it("keeps the room's part when its name can't be read", () => {
    expect(checkoutParts("Bins out.", "Code 1234.", null)).toEqual([
      { label: null, text: "Bins out." },
      { label: null, text: "Code 1234." },
    ]);
  });
});

describe("stayOpensCheckout", () => {
  const now = Date.UTC(2026, 8, 22, 12);

  it("opens for a confirmed stay that is still to come", () => {
    expect(
      stayOpensCheckout({ status: "CONFIRMED", end: "2026-10-01" }, now),
    ).toBe(true);
  });

  it("stays open sixty days after check-out and shuts the day after", () => {
    expect(
      stayOpensCheckout({ status: "CONFIRMED", end: "2026-07-24" }, now),
    ).toBe(true);
    expect(
      stayOpensCheckout({ status: "CONFIRMED", end: "2026-07-23" }, now),
    ).toBe(false);
  });

  it("is shut for an ask and for a cancelled stay", () => {
    expect(
      stayOpensCheckout({ status: "REQUESTED", end: "2026-10-01" }, now),
    ).toBe(false);
    expect(
      stayOpensCheckout({ status: "CANCELLED", end: "2026-10-01" }, now),
    ).toBe(false);
  });
});
