import { describe, expect, test } from "bun:test";
import {
  canHaveRooms,
  findOverlap,
  findOverlaps,
  nextRoomOrder,
  offeredType,
  offerLabel,
  roomList,
  roomOf,
  toPortalRoom,
  toRooms,
  wholePlaceLabel,
} from "../utils/rooms";
import type { AvailabilityWindow, Room } from "../utils/types";

function room(id: string, order: number, extra: Partial<Room> = {}): Room {
  return {
    id,
    name: id,
    note: "",
    photos: [],
    publicPortalId: null,
    order,
    ...extra,
  };
}

// The clash rule compares ISO strings with each other and never with today,
// so fixed dates are safe here.
function dates(
  id: string,
  start: string,
  end: string,
  roomId: string | null,
): AvailabilityWindow {
  return {
    id,
    listingId: "house",
    start,
    end,
    status: "OPEN",
    autoAccept: false,
    details: "",
    roomId,
    bookingId: null,
    publicPortalId: null,
    createdAt: 0,
  };
}

describe("a room and the whole place aren't free at the same time", () => {
  const existing = [
    dates("whole", "2030-01-10", "2030-01-15", null),
    dates("back", "2030-02-10", "2030-02-15", "back"),
    dates("front", "2030-03-10", "2030-03-15", "front"),
  ];
  const range = (start: string, end: string, roomId?: string | null) => ({
    start,
    end,
    roomId,
  });

  test("the whole place clashes with any range on it, and says which", () => {
    expect(findOverlap(existing, range("2030-02-12", "2030-02-20", null))?.id).toBe("back");
    expect(findOverlap(existing, range("2030-03-01", "2030-03-11", null))?.roomId).toBe("front");
    expect(findOverlap(existing, range("2030-01-12", "2030-01-13", null))?.roomId).toBeNull();
  });

  test("a room clashes with its own ranges and with the whole place's", () => {
    expect(findOverlap(existing, range("2030-02-14", "2030-02-18", "back"))?.id).toBe("back");
    expect(findOverlap(existing, range("2030-01-14", "2030-01-18", "back"))?.id).toBe("whole");
  });

  test("two different rooms overlap freely", () => {
    expect(findOverlap(existing, range("2030-03-10", "2030-03-15", "back"))).toBeNull();
    expect(findOverlap(existing, range("2030-02-10", "2030-02-15", "front"))).toBeNull();
  });

  test("ranges that only touch are allowed, since the end is exclusive", () => {
    expect(findOverlap(existing, range("2030-01-15", "2030-01-20", null))).toBeNull();
    expect(findOverlap(existing, range("2030-02-05", "2030-02-10", "back"))).toBeNull();
    expect(findOverlap(existing, range("2030-01-05", "2030-01-10", "front"))).toBeNull();
  });

  test("a range does not clash with itself when being edited", () => {
    expect(findOverlap(existing, range("2030-02-11", "2030-02-16", "back"), "back")).toBeNull();
    expect(findOverlap(existing, range("2030-01-11", "2030-01-16", null), "whole")).toBeNull();
  });

  test("a range with no room named is the whole place", () => {
    expect(findOverlap(existing, { start: "2030-02-12", end: "2030-02-13" })?.id).toBe("back");
  });

  test("one range ticked for several rooms reports each clash", () => {
    const clashes = findOverlaps(
      existing,
      { start: "2030-02-12", end: "2030-03-12" },
      ["back", "front", "attic"],
    );
    expect(clashes.map(({ roomId, clash }) => [roomId, clash.id])).toEqual([
      ["back", "back"],
      ["front", "front"],
    ]);
    expect(
      findOverlaps(existing, { start: "2030-01-01", end: "2030-01-12" }, ["back", null]).map(
        ({ roomId, clash }) => [roomId, clash.roomId],
      ),
    ).toEqual([
      ["back", null],
      [null, null],
    ]);
  });
});

describe("a place's rooms", () => {
  const rooms = {
    c: room("c", 2, { name: "Attic" }),
    a: room("a", 0, { name: "Back bedroom", publicPortalId: "token" }),
    b: room("b", 1, { name: "Front bedroom" }),
  };

  test("come out in the owner's order, ties by name", () => {
    expect(roomList({ rooms }).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    const tied = { x: room("x", 0, { name: "Zed" }), y: room("y", 0, { name: "Alpha" }) };
    expect(roomList({ rooms: tied }).map((entry) => entry.id)).toEqual(["y", "x"]);
    expect(roomList({ rooms: {} })).toEqual([]);
  });

  test("a new room goes last", () => {
    expect(nextRoomOrder(rooms)).toBe(3);
    expect(nextRoomOrder({})).toBe(0);
  });

  test("only a flat or a house can have them", () => {
    expect(canHaveRooms("HOUSE")).toBe(true);
    expect(canHaveRooms("FLAT")).toBe(true);
    expect(canHaveRooms("ROOM")).toBe(false);
  });

  test("dates are labelled by their room, or as the whole place", () => {
    expect(wholePlaceLabel("HOUSE")).toBe("Whole house");
    expect(wholePlaceLabel("FLAT")).toBe("Whole flat");
    expect(offerLabel({ rooms, type: "HOUSE" }, "a")).toBe("Back bedroom");
    expect(offerLabel({ rooms, type: "FLAT" }, null)).toBe("Whole flat");
    // A room since removed has no name left to show.
    expect(roomOf({ rooms }, "gone")).toBeNull();
    expect(offerLabel({ rooms, type: "HOUSE" }, "gone")).toBe("Whole house");
  });

  test("a room's dates count as a room; the whole place's as the place", () => {
    expect(offeredType({ type: "HOUSE" }, { roomId: "a" })).toBe("ROOM");
    expect(offeredType({ type: "HOUSE" }, { roomId: null })).toBe("HOUSE");
    expect(offeredType({ type: "FLAT" }, { roomId: null })).toBe("FLAT");
  });

  test("the stored map reads back with ids and defaults", () => {
    expect(toRooms(undefined)).toEqual({});
    expect(toRooms({ a: { name: "Back bedroom" } })).toEqual({
      a: room("a", 0, { name: "Back bedroom" }),
    });
  });

  test("what a link visitor sees of a room carries no token", () => {
    expect(toPortalRoom(rooms.a)).toEqual({
      id: "a",
      name: "Back bedroom",
      note: "",
      photos: [],
    });
  });
});
