import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

// An error that wraps to a second line grows its form, and a bottom sheet grows
// upward, so the fields move under the thumb typing into them. Each surface's
// errors are held to one rendered line by this budget.
//
// 42 characters, measured rather than reasoned: the narrowest slot is 342px (the
// line under the door's card, at 390px less the page's px-6) and the sheets are
// ~350px, and mixed-case prose in Plus Jakarta Sans at 14px crosses that at 48.
// Kept at 42 with that headroom because a count is a proxy for a width — the
// densest copy here runs 7.3px a character, so anything landing near the cap
// wants looking at in a browser rather than trusting to the number.
const BUDGET = 42;

// Read rather than imported: every one of these lives in a module that pulls in
// Svelte, the store and Firebase, and a copy-length check should not need a
// browser to run. Scanning the source also picks up a line added later, which
// is the half of this that a fixed list would miss.
const PANEL = readFileSync("src/lib/components/auth-panel.svelte", "utf8");
const GATE = readFileSync("src/lib/components/name-gate.svelte", "utf8");
// Each of these two is a form of its own inside a larger screen, so it gets a
// file of its own for the scan to be scoped to.
const PORTAL = readFileSync(
  "src/routes/(app)/portal/name-form.svelte",
  "utf8",
);
const DOORS = readFileSync("src/lib/components/doors-section.svelte", "utf8");
const FIELD = readFileSync("src/lib/reach.ts", "utf8");
const AUTH = readFileSync("src/lib/auth.ts", "utf8");

function literals(source: string): string[] {
  return [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)]
    .map((match) => match[1])
    // Prose, as against an error code, a mode or a class name — every line the
    // slot can show is a sentence, and nothing else here has a space in it.
    .filter((text) => text.includes(" "));
}

// Everything from a top-level declaration to the bare `}` that ends it. The
// terminator has to be the WHOLE line: a destructured parameter list closes
// with `}: {` in the first column too, which cut a component's body off at its
// own signature and left the scan below finding nothing.
function body(source: string, declaration: string): string {
  const after = source.split(declaration)[1];
  if (!after) throw new Error(`no ${declaration} in source`);
  const lines = after.split("\n");
  const end = lines.findIndex((line) => line === "}" || line === "};");
  if (end < 0) throw new Error(`${declaration} never closes`);
  return lines.slice(0, end).join("\n");
}

// Everything assigned to `error`, including the literal it compares against to
// decide whether `authErrorMessage` said anything useful. Only the errors: the
// standing captions these slots show the rest of the time are as long as their
// own reservation allows, and it is the SWAP that has to fit.
function errors(source: string): string[] {
  const assigned: string[] = [];
  for (const match of source.matchAll(/\berror =\s/g)) {
    // To the `;` that ends the statement, skipping any inside a string.
    let end = match.index + match[0].length;
    let quote: string | null = null;
    while (quote !== null || source[end] !== ";") {
      const character = source[end];
      if (character === undefined) throw new Error("unclosed assignment");
      if (quote === null && (character === '"' || character === "`")) {
        quote = character;
      } else if (character === quote && source[end - 1] !== "\\") {
        quote = null;
      }
      end += 1;
    }
    assigned.push(source.slice(match.index + match[0].length, end));
  }
  return assigned.flatMap(literals);
}

describe("every reach surface's message slot shares one copy budget", () => {
  const sources: Array<[string, () => string[]]> = [
    ["auth-panel", () => errors(PANEL)],
    ["name-gate", () => errors(GATE)],
    ["the portal's name form", () => errors(PORTAL)],
    ["the doors sheets", () => errors(DOORS)],
    ["reachError", () => literals(body(FIELD, "export function reachError"))],
    [
      "authErrorMessage",
      () => literals(body(AUTH, "export function authErrorMessage")),
    ],
  ];

  for (const [name, collect] of sources) {
    it(`finds ${name}'s lines`, () => {
      expect(collect().length).toBeGreaterThan(2);
    });

    it(`keeps ${name}'s lines to one rendered line`, () => {
      // Reported as a list so a failure names the line that is too long
      // instead of a number that is too big.
      expect(collect().filter((line) => line.length > BUDGET)).toEqual([]);
    });
  }
});
