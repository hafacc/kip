<script lang="ts" module>
  import type { BookingStatus } from "../types";
  import type { ChipTone } from "./ui/chip.svelte";

  const STATUS: Record<BookingStatus, { label: string; tone: ChipTone }> = {
    REQUESTED: { label: "Pending", tone: "pending" },
    CONFIRMED: { label: "Confirmed", tone: "confirmed" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
  };

  const PIECE =
    "relative max-w-full truncate pl-3 before:absolute before:left-[0.2rem] before:content-['·']";
</script>

<script lang="ts">
  import LuChevronRight from "~icons/lucide/chevron-right";
  import LuMapPin from "~icons/lucide/map-pin";
  import { formatDateRange } from "../format";
  import { listingTypeIcon } from "../listing-icons";
  import { wholePlaceLabel } from "../rooms";
  import { kip } from "../store.svelte";
  import type { Booking } from "../types";
  import CoverPhoto from "./cover-photo.svelte";
  import RoomThumb from "./room-thumb.svelte";
  import { hasRooms } from "./rooms";
  import Chip from "./ui/chip.svelte";
  import Row from "./ui/row.svelte";
  import { useStayPlace } from "./use-stay-place.svelte";

  // `lead` says which of the place and the person comes first: the place tells
  // rows apart on a list spanning places, and repeats uselessly on one place's own
  // Guests list. The cover follows it for the same reason.
  let {
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
  } = $props();

  const place = useStayPlace(() => booking);
  const known = $derived(place.listing);
  const room = $derived(place.room);

  const iAmGuest = $derived(booking.guestId === kip.user?.uid);
  const otherUid = $derived(iAmGuest ? booking.ownerId : booking.guestId);
  // A pending ask authorises no read, so an unanswered stranger is "Someone".
  const otherName = $derived(
    kip.knownPerson(otherUid)?.displayName || "Someone",
  );
  const title = $derived(known?.title || "A place");
  // An unreadable place falls back to a pin: the leading slot exists either way,
  // and an empty one breaks the row rhythm.
  const PlaceIcon = $derived(known ? listingTypeIcon(known.type) : LuMapPin);
  const status = $derived(STATUS[booking.status]);
  const person = $derived(iAmGuest ? `with ${otherName}` : otherName);
  // A stay in one room leads with the room and names the house beneath, since
  // the two side by side don't fit a phone's width.
  const placeHeadline = $derived(room ? room.name : title);
  const headline = $derived(lead === "person" ? otherName : placeHeadline);
  const detail = $derived(
    lead === "person" || !showCounterpart ? "" : `${person} · `,
  );
  // On one place's own Guests list the place is given, so what tells two rows
  // apart is the room — or that it was the whole place, where there are rooms.
  const offered = $derived(
    lead === "person" && showDates && known && hasRooms(known)
      ? `${room ? room.name : wholePlaceLabel(known.type)} · `
      : "",
  );
  const when = $derived(
    showDates ? formatDateRange(booking.start, booking.end) : null,
  );
</script>

<Row
  onclick={() => kip.navigate({ kind: "booking", id: booking.id })}
  ariaLabel={headline}
>
  {#if lead === "place"}
    {#if room}
      <!-- The room's own picture or none: the house's would pass for the room. -->
      <RoomThumb photos={room.photos} />
    {:else}
      <CoverPhoto photo={known?.photos[0]} class="h-10 w-10 shrink-0">
        {#snippet fallback()}
          <span
            class="bg-accent-soft grid h-10 w-10 shrink-0 place-items-center rounded-full text-accent-ink"
          >
            <PlaceIcon width="18" height="18" />
          </span>
        {/snippet}
      </CoverPhoto>
    {/if}
  {/if}
  <div class="min-w-0 flex-1">
    <span class="block truncate text-[0.9375rem] font-semibold">
      {headline}
    </span>
    {#if lead === "place" && room}
      <!-- The house and the rest share a line where they fit and break
           between the two where they don't. Each piece carries its own
           leading dot, hung in a gutter the outer box clips — so a piece
           that starts a line shows none. -->
      <span class="block overflow-hidden text-sm text-muted">
        <span class="-ml-3 flex flex-wrap">
          <span class={PIECE}>{title}</span>
          {#if detail || when}
            <span class={PIECE}>{detail}{when}</span>
          {/if}
        </span>
      </span>
    {:else if showDates || detail || offered}
      <span class="block truncate text-sm text-muted">
        {offered}{detail}{when}
      </span>
    {/if}
  </div>
  <Chip tone={status.tone}>{status.label}</Chip>
  <LuChevronRight class="shrink-0 text-faint" />
</Row>
