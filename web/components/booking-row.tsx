"use client";

import type { ReactElement } from "react";
import { LuChevronRight, LuMapPin } from "react-icons/lu";
import { formatDateRange } from "../utils/format";
import { listingTypeIcon } from "../utils/listings";
import { wholePlaceLabel } from "../utils/rooms";
import { useKip } from "../utils/store";
import type { Booking, BookingStatus } from "../utils/types";
import CoverPhoto from "./cover-photo";
import { hasRooms, RoomThumb } from "./rooms";
import Chip, { type ChipTone } from "./ui/chip";
import { Row } from "./ui/list";
import { useStayPlace } from "./use-stay-place";

const STATUS: Record<BookingStatus, { label: string; tone: ChipTone }> = {
  REQUESTED: { label: "Pending", tone: "pending" },
  CONFIRMED: { label: "Confirmed", tone: "confirmed" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const PIECE =
  "relative max-w-full truncate pl-3 before:absolute before:left-[0.2rem] before:content-['·']";

// `lead` says which of the place and the person comes first: the place tells
// rows apart on a list spanning places, and repeats uselessly on one place's own
// Guests list. The cover follows it for the same reason.
export default function BookingRow({
  booking,
  lead = "place",
  showCounterpart = true,
  showDates = true,
}: {
  booking: Booking;
  lead?: "place" | "person";
  // Off on a list that is already about one person — naming them on every row
  // says nothing, and on a stay you're only watching there is no "with" to it.
  showCounterpart?: boolean;
  // Off inside one slot's own sheet, where the dates are the title. An ask is
  // written against the slot's dates and `updateWindow` cancels any ask the
  // dates move out from under, so repeating them there says nothing. Note the
  // rules pin the two together only at create and at confirm, not in between —
  // so this is about noise, and not a claim that they cannot differ.
  showDates?: boolean;
}): ReactElement {
  const { user, knownPerson, navigate } = useKip();
  const { listing: known, room } = useStayPlace(booking);

  const iAmGuest = booking.guestId === user?.uid;
  const otherUid = iAmGuest ? booking.ownerId : booking.guestId;
  // A pending ask authorises no read, so an unanswered stranger is "Someone".
  const otherName = knownPerson(otherUid)?.displayName || "Someone";
  const title = known?.title || "A place";
  // An unreadable place falls back to a pin: the leading slot exists either way,
  // and an empty one breaks the row rhythm.
  const PlaceIcon = known ? listingTypeIcon(known.type) : LuMapPin;
  const status = STATUS[booking.status];
  const person = iAmGuest ? `with ${otherName}` : otherName;
  // A stay in one room leads with the room and names the house beneath, since
  // the two side by side don't fit a phone's width.
  const headline = lead === "person" ? otherName : room ? room.name : title;
  const detail = lead === "person" || !showCounterpart ? "" : `${person} · `;
  // On one place's own Guests list the place is given, so what tells two rows
  // apart is the room — or that it was the whole place, where there are rooms.
  const offered =
    lead === "person" && showDates && known && hasRooms(known)
      ? `${room ? room.name : wholePlaceLabel(known.type)} · `
      : "";
  const when = showDates ? formatDateRange(booking.start, booking.end) : null;

  return (
    <Row
      onClick={() => navigate({ kind: "booking", id: booking.id })}
      ariaLabel={headline}
    >
      {lead !== "place" ? null : room ? (
        // The room's own picture or none: the house's would pass for the room.
        <RoomThumb photos={room.photos} />
      ) : (
        <CoverPhoto
          photo={known?.photos[0]}
          className="h-10 w-10 shrink-0"
          fallback={
            <span className="bg-accent-soft grid h-10 w-10 shrink-0 place-items-center rounded-full text-accent-ink">
              <PlaceIcon size={18} />
            </span>
          }
        />
      )}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold">
          {headline}
        </span>
        {lead === "place" && room ? (
          // The house and the rest share a line where they fit and break
          // between the two where they don't. Each piece carries its own
          // leading dot, hung in a gutter the outer box clips — so a piece
          // that starts a line shows none.
          <span className="block overflow-hidden text-sm text-muted">
            <span className="-ml-3 flex flex-wrap">
              <span className={PIECE}>{title}</span>
              {detail || when ? (
                <span className={PIECE}>
                  {detail}
                  {when}
                </span>
              ) : null}
            </span>
          </span>
        ) : showDates || detail || offered ? (
          <span className="block truncate text-sm text-muted">
            {offered}
            {detail}
            {when}
          </span>
        ) : null}
      </div>
      <Chip tone={status.tone}>{status.label}</Chip>
      <LuChevronRight className="shrink-0 text-faint" />
    </Row>
  );
}
