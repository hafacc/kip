/**
 * The guard every app check runs behind: nothing opens a page until the server
 * about to be driven is the emulated one.
 */

import { APP_ORIGIN, AUTH_ORIGIN, FIRESTORE_ORIGIN } from "./emulators.ts";

// The words `EmulatorBadge` draws, which the dev server renders into the
// document only when `usingEmulators()` is true.
const BADGE = "Emulated — real share links won't resolve";

async function served(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

// A server already on the port is reused whatever it is, and a plain `bun dev`
// there talks to the REAL project: the first share link a check opened would
// mint an anonymous account in production. Playwright runs this after the
// server is up and before any test.
/** refuse to run unless the app and both emulators are the emulated ones */
export default async function emulated(): Promise<void> {
  const home = await served(`${APP_ORIGIN}/`);
  if (!home?.includes(BADGE)) {
    throw new Error(
      `${APP_ORIGIN} is not the emulated app, so these checks would run against the real project. Stop whatever is serving there and let this start \`bun dev:emulated\` itself.`,
    );
  }
  for (const [name, origin] of [
    ["Firestore", FIRESTORE_ORIGIN],
    ["Auth", AUTH_ORIGIN],
  ]) {
    if ((await served(`${origin}/`)) === null) {
      throw new Error(
        `The ${name} emulator is not answering on ${origin}, though ${APP_ORIGIN} is built to use it.`,
      );
    }
  }
}
