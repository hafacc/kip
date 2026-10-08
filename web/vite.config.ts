import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

// The service worker is its own compile — `sw/sw.ts` to `static/sw.js` — and it
// happens HERE because this file is the one thing every Vite command loads.
// Wired into the `dev` and `export` scripts instead, a bare `vite build` would
// ship a site whose sw.js 404s: no worker, no offline, and nothing said so.
//
// Anchored to this file rather than the working directory, which a caller is
// free to set to anything.
const here = dirname(fileURLToPath(import.meta.url));
execFileSync(
  join(here, "node_modules", ".bin", "tsc"),
  ["-p", "tsconfig.sw.json"],
  {
    cwd: here,
    stdio: "inherit",
  },
);

function basePath(): "" | `/${string}` {
  const base = process.env.VITE_BASE_PATH ?? "";
  if (base !== "" && !base.startsWith("/")) {
    throw new Error("VITE_BASE_PATH must be empty or start with a slash");
  }
  return base as "" | `/${string}`;
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: { runes: true },
      // `out/`, because that is the directory the release workflow uploads.
      // `404.html` is what GitHub Pages serves for a path that names no file.
      adapter: adapter({ pages: "out", assets: "out", fallback: "404.html" }),
      paths: {
        // Unset in the release, which serves kip at the root of its own
        // domain. Read again by `src/lib/base.ts`.
        base: basePath(),
        // Absolute, so a path means the same thing on every page: the
        // manifest, the worker's scope and the icons are all named from the
        // root.
        relative: false,
      },
    }),
    // `scale: 1` so an icon is 1em, the size the classes around it assume.
    icons({ compiler: "svelte", scale: 1 }),
  ],
  // The Firebase SDK is one chunk of about 730 kB, which is known and not news.
  build: { target: "es2022", chunkSizeWarningLimit: 1000 },
  server: { port: 3000 },
});
