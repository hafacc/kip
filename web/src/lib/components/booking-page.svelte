<script lang="ts" module>
  import type { CancelReason } from "../types";

  // `byMe` is the only axis needed, because the reason and the side always agree —
  // every reason but STAY_CANCELLED belongs to exactly one party.
  function cancelNote(
    reason: CancelReason | null,
    byMe: boolean,
    otherName: string,
  ): string {
    switch (reason) {
      case "DECLINED":
        return byMe
          ? "You declined this request"
          : `${otherName} couldn't host these dates`;
      case "WITHDRAWN":
        return byMe
          ? "You took this request back"
          : `${otherName} took this request back`;
      case "SLOT_MOVED":
        return byMe
          ? "You moved these dates, so this request was cancelled"
          : `${otherName} moved these dates, so this request was cancelled`;
      case "SLOT_CANCELLED":
        return byMe
          ? "You called these dates off"
          : `${otherName} called these dates off`;
      case "STAY_CANCELLED":
        return byMe
          ? "You cancelled this stay"
          : `${otherName} cancelled this stay`;
      default:
        return "This booking was cancelled";
    }
  }
</script>

<script lang="ts">
  import type { Component } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import LuCalendarDays from "~icons/lucide/calendar-days";
  import LuCheck from "~icons/lucide/check";
  import LuChevronRight from "~icons/lucide/chevron-right";
  import LuClock from "~icons/lucide/clock";
  import LuMapPin from "~icons/lucide/map-pin";
  import LuX from "~icons/lucide/x";
  import { fetchBookingIfVisible } from "../bookings";
  import {
    checkoutParts,
    type StayCheckout,
    stayOpensCheckout,
  } from "../checkout";
  import { formatDateRange, isExpired, nights } from "../format";
  import { listingTypeIcon } from "../listing-icons";
  import { fetchStayCheckout } from "../listings";
  import { kip } from "../store.svelte";
  import type { Booking } from "../types";
  import Avatar from "./avatar.svelte";
  import CoverPhoto from "./cover-photo.svelte";
  import { dialog, reportFailure, runAction } from "./dialog.svelte";
  import Button from "./ui/button.svelte";
  import Chip, { type ChipTone } from "./ui/chip.svelte";
  import Group from "./ui/group.svelte";
  import Row from "./ui/row.svelte";
  import Section from "./ui/section.svelte";
  import { useStayPlace } from "./use-stay-place.svelte";

  // The stay, guest side, or the request, owner side.
  let { id }: { id: string } = $props();

  let busy = $state(false);
  // Neither subscription carries a stay you're only a spectator of, so a friend
  // arriving from a held slot has to fetch it. `looked` keeps the not-available
  // line from flashing before the answer is back.
  let fetchedBooking = $state.raw<Booking | undefined>(undefined);
  let looked = $state(false);
  const booking = $derived<Booking | undefined>(
    kip.trips.find((candidate) => candidate.id === id) ??
      kip.incomingBookings.find((candidate) => candidate.id === id) ??
      // Pinned to the id being rendered: the state outlives a move to another
      // booking, so without this the previous one shows under the new URL.
      (fetchedBooking?.id === id ? fetchedBooking : undefined),
  );
  const place = useStayPlace(() => booking);
  const room = $derived(place.listing);
  const stayRoom = $derived(place.room);
  const iAmPartyTo = $derived(
    kip.trips.some((candidate) => candidate.id === id) ||
      kip.incomingBookings.some((candidate) => candidate.id === id),
  );

  $effect(() => {
    if (iAmPartyTo) return;
    const asked = id;
    let live = true;
    looked = false;
    fetchBookingIfVisible(asked)
      .then((visible) => {
        if (live) fetchedBooking = visible ?? undefined;
      })
      .catch((error) => console.error("visitBooking", error))
      .finally(() => {
        if (live) looked = true;
      });
    return () => {
      live = false;
    };
  });

  // Only the guest of a confirmed stay may read these, and only until the
  // rules' cut-off after check-out; they refuse everyone else, so nobody else
  // asks.
  let checkout = $state.raw<{ id: string; found: StayCheckout } | null>(null);
  const guestUid = $derived(
    booking?.guestId === kip.user?.uid ? kip.user?.uid : undefined,
  );
  const staying = $derived(
    booking !== undefined &&
      stayOpensCheckout(booking) &&
      guestUid !== undefined,
  );
  const stayListingId = $derived(booking?.listingId);
  const stayWindowId = $derived(booking?.windowId);

  // Reads only the values above, so a new snapshot of the same stay does not
  // ask again.
  $effect(() => {
    if (!staying || !guestUid || !stayListingId || !stayWindowId) return;
    const asked = id;
    let live = true;
    fetchStayCheckout(
      { id: asked, listingId: stayListingId, windowId: stayWindowId },
      guestUid,
    )
      .then((answer) => {
        if (live) checkout = { id: asked, found: answer };
      })
      .catch((error) => console.error("stayCheckout", error));
    return () => {
      live = false;
    };
  });

  // The ordinary double-click only; the transaction is the real protection.
  async function confirmStay(): Promise<void> {
    if (!booking) return;
    busy = true;
    try {
      const outcome = await kip.confirmBooking(booking);
      if (outcome === "unavailable") {
        // Either another stay took the dates or the ask was withdrawn, and the
        // transaction can't tell which without claiming more than it knows.
        await dialog.alert({
          title: "Too late for this one",
          body: "Either those dates went to another stay or the guest took their request back — either way there's nothing left to confirm. This page will catch up in a moment.",
        });
      }
    } catch (error) {
      reportFailure(error, "Couldn't confirm this stay. Please try again.");
    } finally {
      busy = false;
    }
  }

  // A stay in one room names it ahead of the place it is in.
  const roomTitle = $derived(
    room && stayRoom ? `${stayRoom.name} · ${room.title}` : room?.title,
  );
  const title = $derived(roomTitle ?? "A place");
  const cover = $derived(stayRoom?.photos[0] ?? room?.photos[0]);
  const address = $derived(room?.location.label || "Address unavailable");
  const iAmGuest = $derived(booking?.guestId === kip.user?.uid);
  const iAmHost = $derived(booking?.ownerId === kip.user?.uid);
  // A friend of the guest can be here without being either party — the stay is
  // theirs to see, none of it is theirs to change.
  const iAmParty = $derived(iAmGuest || iAmHost);
  // A spectator came for the guest; a guest came for their host.
  const otherUid = $derived(
    (iAmGuest ? booking?.ownerId : booking?.guestId) ?? "",
  );
  // A pending ask authorises no read, so an unanswered stranger stays "Someone"
  // with the role beneath carrying what is actually known.
  const other = $derived(kip.knownPerson(otherUid));
  const otherName = $derived(other?.displayName || "Someone");
  const otherPhoto = $derived(other?.photoURL ?? null);
  const PlaceIcon = $derived(room ? listingTypeIcon(room.type) : LuMapPin);

  // Pinned to this stay and its current state: the answer outlives a move to
  // another booking, and a cancel that lands while the page is open.
  const stayCheckout = $derived(
    booking && iAmGuest && stayOpensCheckout(booking) && checkout?.id === id
      ? checkout.found
      : null,
  );
  const checkingOut = $derived(
    stayCheckout
      ? checkoutParts(
          stayCheckout.place,
          stayCheckout.room,
          (stayCheckout.roomId
            ? room?.rooms[stayCheckout.roomId]?.name
            : undefined) ?? null,
        )
      : [],
  );

  // The page it's on has nothing left to show once hidden.
  async function clearFromList(cleared: Booking): Promise<void> {
    const agreed = await dialog.confirm({
      title: "Clear this from your list?",
      body: `It disappears from your ${iAmGuest ? "trips" : "bookings"}. ${otherName} still has their copy — nothing is deleted.`,
      confirmLabel: "Clear",
    });
    if (!agreed) return;
    await kip.hideBooking(cleared.id);
    kip.back();
  }

  type Moment = {
    tone: ChipTone;
    label: string;
    note: string;
    circle: string;
    Icon: Component<SvelteHTMLElements["svg"]>;
    size: number;
  };

  const confirmedNote = $derived(
    iAmGuest
      ? "Your stay is all set"
      : iAmHost
        ? `You're hosting ${otherName}`
        : `${otherName} is staying here`,
  );
  const pendingNote = $derived(
    iAmGuest
      ? `Waiting on ${otherName} to confirm`
      : iAmHost
        ? `${otherName} wants to book`
        : `${otherName} has asked to stay here`,
  );
  const moment = $derived.by((): Moment => {
    if (booking?.status === "CONFIRMED") {
      return {
        tone: "confirmed",
        label: "Confirmed",
        note: confirmedNote,
        circle: "bg-success-soft text-success",
        Icon: LuCheck,
        size: 24,
      };
    } else if (booking?.status === "REQUESTED") {
      return {
        tone: "pending",
        label: "Pending",
        note: pendingNote,
        circle: "bg-pending-soft text-pending",
        Icon: LuClock,
        size: 22,
      };
    } else {
      return {
        tone: "neutral",
        label: "Cancelled",
        note: cancelNote(
          booking?.cancelReason ?? null,
          booking?.cancelledBy === kip.user?.uid,
          otherName,
        ),
        circle: "bg-surface-muted text-muted",
        Icon: LuX,
        size: 22,
      };
    }
  });
  const role = $derived(
    iAmGuest ? "Your host" : iAmHost ? "Your guest" : "Staying here",
  );
</script>

<!-- Every row in this card leads with an icon, so dropping it for the place
     alone left the title out of line with the rows beneath. -->
{#snippet placeLead()}
  <span
    class="bg-accent-soft grid h-10 w-10 shrink-0 place-items-center rounded-full text-accent-ink"
  >
    <PlaceIcon width="18" height="18" />
  </span>
  <div class="min-w-0 flex-1">
    <span class="block truncate text-[0.9375rem] font-semibold">{title}</span>
    <span class="block truncate text-sm text-muted">{address}</span>
  </div>
{/snippet}

{#snippet momentIcon()}
  <moment.Icon width={moment.size} height={moment.size} />
{/snippet}

{#if !booking}
  <p class="text-muted">{looked ? "This booking isn't available." : ""}</p>
{:else}
  <div class="mx-auto flex w-full max-w-xl flex-col gap-6">
    <!-- With a photo the whole status — icon and label — sits ON it, because
         the state is about that stay and the image is what the stay IS. The
         header keeps only the sentence. Without one it all falls back to the
         header, which is where it used to live. -->
    {#if cover}
      <div class="relative">
        <!-- A round 40px crop of a room is barely a picture. -->
        <CoverPhoto photo={cover} class="aspect-[16/9] max-h-56 w-full" />
        <span class="absolute left-3 top-3 flex items-center gap-2">
          <span
            class="grid h-9 w-9 place-items-center rounded-full {moment.circle}"
          >
            {@render momentIcon()}
          </span>
          <Chip tone={moment.tone}>{moment.label}</Chip>
        </span>
      </div>
    {/if}

    <div class="flex flex-col items-center gap-3 text-center">
      {#if !cover}
        <span
          class="grid h-16 w-16 place-items-center rounded-full {moment.circle}"
        >
          {@render momentIcon()}
        </span>
        <Chip tone={moment.tone}>{moment.label}</Chip>
      {/if}
      <p class="text-lg font-bold tracking-[-0.02em]">{moment.note}</p>
    </div>

    <Group>
      {#if room}
        <Row
          onclick={() => kip.navigate({ kind: "room", id: room.id })}
          ariaLabel={title}
        >
          {@render placeLead()}
          <LuChevronRight class="shrink-0 text-faint" />
        </Row>
      {:else}
        <Row>{@render placeLead()}</Row>
      {/if}
      <Row>
        <span
          class="bg-accent-soft grid h-10 w-10 shrink-0 place-items-center rounded-full text-accent-ink"
        >
          <LuCalendarDays width="18" height="18" />
        </span>
        <div class="min-w-0 flex-1">
          <span class="block text-[0.9375rem] font-semibold">
            {formatDateRange(booking.start, booking.end)}
          </span>
          <span class="block text-sm text-muted">
            {`${nights(booking.start, booking.end)} nights`}
          </span>
        </div>
      </Row>
      <!-- Tappable whether or not they're a friend: it's the one place a
           share-link guest and their host can ask to connect, since neither is
           searchable to the other and neither holds the other's link. -->
      <Row
        onclick={() => kip.navigate({ kind: "person", id: otherUid })}
        ariaLabel={otherName}
      >
        <Avatar
          name={otherName}
          photoURL={otherPhoto}
          class="h-10 w-10 text-sm"
        />
        <div class="min-w-0 flex-1">
          <span class="block truncate text-[0.9375rem] font-semibold">
            {otherName}
          </span>
          <span class="block text-sm text-muted">{role}</span>
        </div>
        <LuChevronRight class="shrink-0 text-faint" />
      </Row>
    </Group>

    {#if checkingOut.length > 0}
      <Section title="Checking out">
        <div class="flex flex-col gap-4 rounded-3xl bg-surface p-4 shadow-card">
          {#each checkingOut as part (part.label ?? "")}
            <div class="flex flex-col gap-1">
              {#if part.label}
                <h3 class="text-sm font-semibold text-muted">{part.label}</h3>
              {/if}
              <p
                class="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed"
              >
                {part.text}
              </p>
            </div>
          {/each}
        </div>
      </Section>
    {/if}

    {#if !iAmParty}
      <!-- A spectator changes nothing. -->
    {:else if booking.status !== "CANCELLED"}
      <div class="flex flex-col gap-2">
        {#if iAmGuest}
          <Button
            variant="danger"
            size="lg"
            onclick={() => runAction(() => kip.cancelTrip(booking))}
          >
            Cancel {booking.status === "CONFIRMED" ? "stay" : "request"}
          </Button>
        {:else if booking.status === "REQUESTED" && isExpired(booking.end)}
          <p class="px-1 text-sm text-muted">
            These dates have passed, so this can no longer be confirmed.
            Declining lets the guest know.
          </p>
          <Button
            variant="ghost"
            onclick={() => runAction(() => kip.declineBooking(booking))}
          >
            Decline
          </Button>
        {:else if booking.status === "REQUESTED"}
          <Button size="lg" disabled={busy} onclick={confirmStay}>
            Confirm booking
          </Button>
          <Button
            variant="ghost"
            onclick={() => runAction(() => kip.declineBooking(booking))}
          >
            Decline
          </Button>
        {:else}
          <Button
            variant="danger"
            size="lg"
            onclick={() => runAction(() => kip.declineBooking(booking))}
          >
            Cancel booking
          </Button>
        {/if}
      </div>
    {:else}
      <Button
        variant="ghost"
        onclick={() => runAction(() => clearFromList(booking))}
      >
        Clear from my list
      </Button>
    {/if}
  </div>
{/if}
