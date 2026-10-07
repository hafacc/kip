import type { Handle } from "@sveltejs/kit/hooks";

const VERBATIM = /<(script|style)\b[\s\S]*?<\/\1>/g;
const LINE_BREAK = /\s*\n\s*/g;

// The exported HTML keeps the line breaks its source was wrapped at, which a
// browser collapses and a `grep` does not — and the Privacy and Terms pages are
// checked, here and by the carriers' reviewers, by searching the served file
// for whole sentences. Each break becomes the one space it renders as, so no
// node is added or removed and hydration finds what it expects. Scripts and
// styles are left exactly as written.
function unwrap(html: string): string {
  let unwrapped = "";
  let copied = 0;
  for (const match of html.matchAll(VERBATIM)) {
    unwrapped += html.slice(copied, match.index).replace(LINE_BREAK, " ");
    unwrapped += match[0];
    copied = match.index + match[0].length;
  }
  return unwrapped + html.slice(copied).replace(LINE_BREAK, " ");
}

// Runs in dev and while prerendering; the release has no server at all.
export const handle: Handle = ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) => unwrap(html),
    // The Latin file is the one every page draws its first text in; the other
    // scripts are fetched only by a page that uses them.
    preload: ({ type, path }) =>
      type === "js" ||
      type === "css" ||
      (type === "font" && path.includes("-latin-wght-")),
  });
