"use client";

import { type ReactElement, useState } from "react";
import { LuCheck } from "react-icons/lu";
import { isExpired, todayIso } from "../utils/format";
import { findOverlaps, roomList, wholePlaceLabel } from "../utils/rooms";
import { useKip } from "../utils/store";
import type { AvailabilityWindow, Listing } from "../utils/types";
import { useAction } from "./dialog";
import { clashNote } from "./rooms";
import Button from "./ui/button";
import FieldNote from "./ui/field-note";
import Segmented from "./ui/segmented";
import Sheet from "./ui/sheet";
import Switch from "./ui/switch";

export const DATE_FIELD =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

type Offering = "whole" | "rooms";

/**
 * The sheet that offers new dates at a place.
 *
 * A place with rooms chooses what the dates offer: the whole place, or one set
 * per ticked room. It opens on rooms with every one ticked; pass `roomId` to
 * open with only that room ticked. A place with no rooms shows no such choice.
 */
export default function AddDatesSheet({
  listing,
  existing,
  roomId = null,
  onClose,
}: {
  listing: Listing;
  existing: readonly AvailabilityWindow[];
  roomId?: string | null;
  onClose: () => void;
}): ReactElement {
  const { addWindow, addRoomWindows } = useKip();
  const run = useAction();
  const rooms = roomList(listing);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [details, setDetails] = useState("");
  const [autoAccept, setAutoAccept] = useState(false);
  const [offering, setOffering] = useState<Offering>(
    rooms.length > 0 ? "rooms" : "whole",
  );
  const [ticked, setTicked] = useState<readonly string[]>(() =>
    roomId ? [roomId] : rooms.map((room) => room.id),
  );

  // In the owner's order whatever order they were ticked in, and never a room
  // removed while the sheet was open.
  const chosen = rooms
    .map((room) => room.id)
    .filter((id) => ticked.includes(id));
  const targets: readonly (string | null)[] =
    offering === "whole" ? [null] : chosen;
  const ranged = Boolean(start && end && end > start);
  const [first] = ranged ? findOverlaps(existing, { start, end }, targets) : [];
  // `min` on the pickers is a hint a typed date walks straight past, and a slot
  // that's expired the moment it exists is availability nobody can ever book.
  const gone = Boolean(end) && isExpired(end);
  const valid = ranged && !first && !gone && targets.length > 0;

  function toggle(id: string): void {
    setTicked((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  }

  function add(): void {
    if (!valid) return;
    const dates = { start, end, autoAccept, details: details.trim() };
    run(async () => {
      if (offering === "whole") {
        await addWindow(listing.id, dates);
      } else {
        await addRoomWindows(listing.id, chosen, dates);
      }
      onClose();
    });
  }

  const caption =
    chosen.length === 0
      ? "Tick at least one room."
      : chosen.length === 1
        ? "Adds 1 set of dates."
        : `Adds ${chosen.length} sets of dates, one for each room.`;

  return (
    <Sheet open onClose={onClose} title="Add dates">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            From
            <input
              type="date"
              className={DATE_FIELD}
              min={todayIso()}
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            To
            <input
              type="date"
              className={DATE_FIELD}
              min={start || todayIso()}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>

        {rooms.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">What's free</span>
            <Segmented
              ariaLabel="What's free"
              value={offering}
              onChange={setOffering}
              options={[
                { value: "whole", label: wholePlaceLabel(listing.type) },
                { value: "rooms", label: "Rooms" },
              ]}
            />
            {offering === "rooms" ? (
              <>
                <div className="overflow-hidden rounded-2xl bg-surface-muted divide-y divide-border">
                  {rooms.map((room) => {
                    const on = ticked.includes(room.id);
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: a native checkbox can't hold the two-line label and the drawn tick as one tap target
                      <button
                        key={room.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(room.id)}
                        className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2 text-left"
                      >
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-[0.5rem] text-white ${
                            on
                              ? "bg-gradient-accent"
                              : "border-[1.5px] border-faint bg-surface"
                          }`}
                        >
                          {on ? <LuCheck size={16} strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.9375rem] font-semibold">
                            {room.name}
                          </span>
                          {room.note ? (
                            <span className="block truncate text-sm text-muted">
                              {room.note}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <FieldNote>{caption}</FieldNote>
              </>
            ) : null}
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Notes for these dates
          <input
            className={DATE_FIELD}
            placeholder="e.g. flexible check-in, I'll be away"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </label>
        <div className="rounded-2xl bg-surface-muted">
          <Switch
            checked={autoAccept}
            onChange={setAutoAccept}
            label="Instant book"
            description="Friends book these dates instantly (first come, first served)."
          />
        </div>
        {first ? (
          <FieldNote tone="danger">
            {clashNote(listing, first.roomId, first.clash, chosen.length > 1)}
          </FieldNote>
        ) : gone ? (
          <FieldNote tone="danger">Those dates have already passed.</FieldNote>
        ) : null}
        <Button size="lg" onClick={add} disabled={!valid}>
          Add dates
        </Button>
      </div>
    </Sheet>
  );
}
