import type { ConfirmationResult } from "firebase/auth";
import {
  confirmPhoneCode,
  sendAttachLink,
  sendPhoneCode,
  sendReturnLink,
} from "./auth";
import { isForeignNumber, parseDestination } from "./destination";
import { auth } from "./firebase";

// How many digits a texted code has, and so how many boxes the field draws.
export const CODE_LENGTH = 6;

// One field for both doors, shared by the surfaces that collect a way to reach
// someone (`components/reach-field.svelte` draws it). The mode sets only the
// keyboard and the autofill hint — `parseDestination` decides the route from
// what was actually typed, so being in the "wrong" mode can never turn a good
// address into an error.
//
// Email defaults because the failure modes are asymmetric: a number typed on an
// email keyboard is awkward, an address typed on a numeric keypad is impossible.
export type ReachState = {
  raw: string;
  mode: "email" | "phone";
  pending: ConfirmationResult | null;
  code: string;
  sentTo: string | null;
};

export const EMPTY_REACH: ReachState = {
  raw: "",
  mode: "email",
  pending: null,
  code: "",
  sentTo: null,
};

// `only` is the caller saying its surface names one door — the Settings row that
// adds a number — so an address typed into it is a mistake rather than the other
// route, and saying "or an email address" there would offer something the sheet
// around it cannot do.
export function reachError(raw: string, only?: "phone"): string | null {
  if (!raw) return null;
  const parsed = parseDestination(raw);
  if (only && parsed.kind === "email") return "That's an email, not a number.";
  if (parsed.kind !== "unknown") return null;
  if (isForeignNumber(raw)) {
    return "US numbers only — email works anywhere.";
  }
  return only
    ? "That's not a US phone number."
    : "That's not an email or a US number.";
}

// Sends whichever kind was typed. Email returns immediately (the link lands in
// an inbox); phone hands back a pending confirmation the caller must finish with
// a code, which is the one asymmetry between the doors that reaches the UI.
//
// `mode` is the only thing that differs between attaching an identity to the
// account already asking and coming back to one you already have — and only for
// email, since a texted code signs in or links off the same call. Parameterised
// rather than duplicated: the two paths drifting is precisely how phone ended up
// offered on one and not the other.
export async function sendReach(
  raw: string,
  host: string,
  container: HTMLElement,
  mode: "attach" | "return" = "attach",
): Promise<{ pending: ConfirmationResult | null; sentTo: string }> {
  const parsed = parseDestination(raw);
  if (parsed.kind === "email") {
    if (mode === "return") await sendReturnLink(parsed.value);
    else await sendAttachLink(parsed.value, host);
    return { pending: null, sentTo: parsed.value };
  }
  if (parsed.kind === "phone") {
    const wasUid = auth().currentUser?.uid ?? null;
    const pending = await sendPhoneCode(parsed.value, container);
    // Stashed on the object so the confirm step can tell whether the uid
    // survived without threading it through the sheet's state.
    return {
      pending: Object.assign(pending, { wasUid }),
      sentTo: parsed.value,
    };
  }
  throw new Error("nothing to send to");
}

// The one place that says what a finished code looks like. Four surfaces gate a
// button on it, and each of them used to ask whether `code` was non-empty —
// which offers to send a single digit, and now also disagrees with the field,
// since it submits itself on the sixth.
export function codeReady(state: ReachState): boolean {
  return state.code.length === CODE_LENGTH;
}

export async function confirmReach(
  pending: ConfirmationResult,
  code: string,
): Promise<{ sameAccount: boolean }> {
  const wasUid = (pending as { wasUid?: string | null }).wasUid ?? null;
  return confirmPhoneCode(pending, code, wasUid);
}
