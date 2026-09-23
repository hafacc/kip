import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import {
  NOTIFY_DEFAULTS,
  NOTIFY_SMS_DEFAULTS,
} from "../../functions/src/messages";
import { SMS_FROM } from "../utils/sms";
import {
  DEFAULT_NOTIFY,
  DEFAULT_NOTIFY_SMS,
  DELETION_PHASES,
  NOTIFY_EVENTS,
} from "../utils/types";

// `functions/` is a separate package on a different runtime, so it can't import
// from `web/` — it keeps its own copy of the vocabulary they share, and nothing
// forces the two to agree. The sender fails CLOSED on a kind it doesn't know, so
// a rename now costs silence rather than a message to someone who opted out —
// but silence about a cancelled stay is its own bug, and nobody reports a text
// they never got. This pins them together so drift breaks CI instead.
//
// Matched against source text with comments stripped, so a string that survives
// only in a comment doesn't pass. The `[^:]` spares `https://` inside strings.
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FUNCTIONS_SOURCE = code("../functions/src/messages.ts");
const TRIGGERS_SOURCE = code("../functions/src/index.ts");
const TEARDOWN_SOURCE = code("../functions/src/teardown.ts");
const LEAVING_SOURCE = code("../functions/src/leaving.ts");
const WEB_TYPES_SOURCE = code("utils/types.ts");

function arrayMembers(source: string, name: string): string[] {
  const declaration = source.split(`const ${name} = [`)[1];
  if (!declaration) throw new Error(`no ${name} array in functions source`);
  return [...declaration.split("]")[0].matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  );
}

function unionMembers(typeName: string, source = FUNCTIONS_SOURCE): string[] {
  const declaration = source.split(`type ${typeName} =`)[1];
  if (!declaration) throw new Error(`no ${typeName} union in source`);
  return [...declaration.split(";")[0].matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

describe("web and functions share a vocabulary", () => {
  it("notification event keys match exactly", () => {
    expect(unionMembers("NotifyKind")).toEqual(
      Object.keys(NOTIFY_EVENTS).sort(),
    );
  });

  it("the texted subset matches", () => {
    expect(unionMembers("NotifySmsKind")).toEqual(
      Object.entries(NOTIFY_EVENTS)
        .filter(([, event]) => event.sms)
        .map(([kind]) => kind)
        .sort(),
    );
  });

  // The values, not just the keys: the sender answers for a kind nobody has
  // stored anything for out of its own copy of this table.
  it("both channels default the same way on each side", () => {
    expect(NOTIFY_DEFAULTS).toEqual(DEFAULT_NOTIFY);
    expect(NOTIFY_SMS_DEFAULTS).toEqual(DEFAULT_NOTIFY_SMS);
  });

  // The map PATH is the one thing nothing else pins, and the new one is a typo
  // away from reading email's answers to decide whether to text.
  it("reads each channel's preferences from its own map", () => {
    expect(TRIGGERS_SOURCE).toContain("wantsEmail(prefs.notify, kind)");
    expect(TRIGGERS_SOURCE).toContain("wantsSms(prefs.notifySms, kind)");
  });

  // The one thing binding a stored consent to the phone it was given about, and
  // the failure it prevents is a text to someone who never agreed to one.
  it("checks a text against the number consent names", () => {
    expect(TRIGGERS_SOURCE).toContain("prefs.smsConsentNumber !== number");
  });

  // Settings tells someone whose carrier is blocking kip to text START to this
  // number, and that instruction is only true of the number kip actually sends
  // from. Wrong, it sends them to a phone kip has never texted from, where the
  // message goes through and changes nothing — worse than saying nothing, and
  // invisible until someone is already stuck. Both are empty until a number is
  // provisioned, so this holds today and starts biting the moment one is.
  it("the number Settings names is the number the sender texts from", () => {
    const declared = TRIGGERS_SOURCE.split("const TWILIO_FROM = ")[1];
    if (!declared) throw new Error("no TWILIO_FROM in the triggers source");
    expect(declared.split(";")[0].trim()).toBe(JSON.stringify(SMS_FROM));
  });

  // In ORDER, not as a set: the deletion screen draws a determinate bar over
  // these and numbers the steps, so a phase the web side has never heard of
  // renders as a blank one, and a reordering renumbers someone's progress.
  it("the teardown phases match, in order", () => {
    expect(arrayMembers(TEARDOWN_SOURCE, "DELETION_PHASES")).toEqual([
      ...DELETION_PHASES,
    ]);
  });

  // The function special-cases only some reasons and gives the rest a generic
  // message, so a renamed one doesn't fail — it silently degrades the wording.
  it("cancel reasons match exactly", () => {
    expect(unionMembers("CancelReason")).toEqual(
      unionMembers("CancelReason", WEB_TYPES_SOURCE),
    );
  });

  it("every reason leaving writes is one the web side knows", () => {
    const known = new Set(unionMembers("CancelReason", WEB_TYPES_SOURCE));
    const written = [
      ...LEAVING_SOURCE.split("export function cancellationFor")[1].matchAll(
        /"([A-Z_]+)"/g,
      ),
    ]
      .map((match) => match[1])
      .filter((literal) => literal !== "CANCELLED" && literal !== "CONFIRMED");
    expect(written.length).toBeGreaterThan(0);
    for (const reason of written) expect(known).toContain(reason);
  });
});
