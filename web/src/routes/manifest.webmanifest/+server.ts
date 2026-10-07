import { BASE_PATH } from "#lib/base.ts";

// Nothing here is prefixed for us — `start_url`, `scope` and every icon path
// are taken literally — so a build under a base path has to add it itself.
//
// `scope` deliberately covers the whole app, so /portal/ and /continue/ open
// inside an installed kip too — a share link handed to someone who has it
// installed should not bounce them out to a browser tab.
const MANIFEST = {
  name: "kip",
  short_name: "kip",
  description: "Share a spare room or your whole place with friends, for free.",
  start_url: `${BASE_PATH}/`,
  scope: `${BASE_PATH}/`,
  display: "standalone",
  background_color: "#f6f1ea",
  theme_color: "#f6f1ea",
  icons: [
    { src: `${BASE_PATH}/icon-192.png`, sizes: "192x192", type: "image/png" },
    { src: `${BASE_PATH}/icon-512.png`, sizes: "512x512", type: "image/png" },
    // Full-bleed, with the mark inside the safe circle: Android crops a
    // non-maskable icon to whatever shape the launcher uses, which would take
    // the edges off the disc.
    {
      src: `${BASE_PATH}/icon-maskable-512.png`,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

// A static export has no request to vary on.
export const prerender = true;
// The root layout asks for a directory per page; this is a file.
export const trailingSlash = "never";

export function GET(): Response {
  return new Response(JSON.stringify(MANIFEST), {
    headers: { "content-type": "application/manifest+json" },
  });
}
