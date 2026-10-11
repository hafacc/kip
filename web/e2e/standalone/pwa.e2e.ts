// The two claims installing kip makes: that a browser will offer to install
// it at all, and that it opens with no network. Both are about the PRODUCTION
// bundle, since the worker deliberately does not register in dev, so this
// builds the export and serves it itself.
//
// No emulator: the export carries the real project's config, so every request
// to Firebase Auth is failed in the browser before it leaves; otherwise the
// portal visit's anonymous sign-in would mint a real account in production.
//
// It does NOT cover a signed-in kip offline: that rests on Firestore's own
// IndexedDB persistence, which needs a real session against the real project.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  type BrowserContext,
  chromium,
  expect,
  type Page,
  test,
} from "@playwright/test";

const PORT = 4173;
// At the root, because that is what production is. Manifest scope, the
// worker's registration path and the offline key are all built from the base
// path, so `KIP_PWA_BASE=/kip` runs the same checks served under one.
const BASE = process.env.KIP_PWA_BASE ?? "";
const APP = `http://localhost:${PORT}${BASE}`;
const WEB = fileURLToPath(new URL("../..", import.meta.url));
const SERVE = `${WEB}node_modules/.cache/kip-pwa-serve`;
const PROFILE = `${WEB}node_modules/.cache/kip-pwa-profile`;

/** build the export and lay it out the way it is served */
async function build(): Promise<void> {
  const built = spawnSync("bun", ["run", "export"], {
    cwd: WEB,
    stdio: "inherit",
    env: { ...process.env, VITE_BASE_PATH: BASE },
  });
  if (built.status !== 0) {
    throw new Error("export failed");
  }
  await rm(SERVE, { recursive: true, force: true });
  if (BASE) {
    await mkdir(SERVE, { recursive: true });
    await symlink(`${WEB}out`, `${SERVE}${BASE}`);
  } else {
    await symlink(`${WEB}out`, SERVE);
  }
}

/** start the static server, without waiting for it to answer */
function serve(): ChildProcess {
  // Served locally rather than from Pages, since the worker needs a secure
  // context and localhost is one. The listen backlog is raised from Python's
  // default of 5: the build boots by fetching some thirty small modules at
  // once, and a queue that short resets whichever connections don't fit.
  return spawn(
    "python3",
    [
      "-c",
      `import http.server as h; h.ThreadingHTTPServer.request_queue_size = 128; h.test(HandlerClass=h.SimpleHTTPRequestHandler, ServerClass=h.ThreadingHTTPServer, port=${PORT})`,
    ],
    { cwd: SERVE, stdio: "ignore" },
  );
}

/** the status the static server answers the entry point with, if it answers */
async function answering(): Promise<number | undefined> {
  return (await fetch(`${APP}/`).catch(() => null))?.status;
}

async function cacheKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        out.push(request.url);
      }
    }
    return out;
  });
}

// A persistent profile rather than the usual fixture: Playwright's contexts
// are incognito, and Chrome never offers to install from one.
test("kip installs, caches no capability, and opens with no network", async () => {
  await build();
  const server = serve();
  let context: BrowserContext | undefined;
  // Everything after the spawn, or a failure before the browser is up leaves
  // the server holding the port for the next run to trip on.
  try {
    await expect.poll(answering, { message: "the export is served" }).toBe(200);
    await rm(PROFILE, { recursive: true, force: true });
    context = await chromium.launchPersistentContext(PROFILE, {
      channel: "chrome",
      viewport: { width: 430, height: 932 },
    });
    const browsing = context;
    const page = browsing.pages()[0] ?? (await browsing.newPage());
    // Sign-in, token refresh and account lookup all go through these two
    // hosts, so failing them is what keeps a run from creating a production
    // account. The page sees them because the worker never touches a
    // cross-origin request.
    const blocked: string[] = [];
    for (const host of [
      "identitytoolkit.googleapis.com",
      "securetoken.googleapis.com",
    ]) {
      await browsing.route(`**://${host}/**`, (route) => {
        blocked.push(route.request().url());
        return route.abort("blockedbyclient");
      });
    }
    // Before the document runs, or the event has already fired by the time
    // anything here could listen for it.
    await page.addInitScript(() => {
      window.addEventListener("beforeinstallprompt", () => {
        Object.assign(window, { kipInstallOffered: true });
      });
    });
    await page.goto(`${APP}/`);

    await test.step("a browser is willing to install it", async () => {
      // Chrome's own parse, not a read of the JSON: a manifest this file agrees
      // with and Chrome rejects would install nowhere.
      const session = await browsing.newCDPSession(page);
      const manifest = (await session.send("Page.getAppManifest")) as {
        errors?: unknown[];
        data?: string;
      };
      expect(
        manifest.errors ?? [],
        "the manifest parses with no errors",
      ).toEqual([]);
      const parsed = JSON.parse(manifest.data ?? "{}") as {
        display?: string;
        start_url?: string;
        icons?: { sizes?: string; purpose?: string }[];
      };
      expect(parsed.display, "it is standalone").toBe("standalone");
      expect(parsed.start_url, "with a start_url").toBeTruthy();
      // The maskable one is separate on purpose: without it Android crops the
      // disc.
      const icons = parsed.icons ?? [];
      expect(
        icons.some((icon) => icon.sizes === "512x512" && !icon.purpose) &&
          icons.some((icon) => icon.purpose === "maskable"),
        `it names a 512 and a maskable icon: ${JSON.stringify(icons)}`,
      ).toBe(true);
      // Chrome fires this only for a page it is actually willing to install.
      await expect
        .poll(() => page.evaluate(() => "kipInstallOffered" in window), {
          message: "Chrome offers to install it",
        })
        .toBe(true);
      // Registration is deferred to `load`, so it is waited for.
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const registration =
                await navigator.serviceWorker.getRegistration();
              if (!registration) return "none";
              await navigator.serviceWorker.ready;
              return registration.active ? "active" : "registered, not active";
            }),
          { message: "the worker registers and activates" },
        )
        .toBe("active");
      // Read before any navigation the worker controls: anything held now was
      // put there by the install step. Without this entry, installing kip and
      // losing signal opens the browser's offline page from the new icon.
      await expect
        .poll(() => cacheKeys(page), {
          message: "the install step pre-caches the scope root",
        })
        .toContain(`${APP}/`);
    });

    // A navigation's `request.url` carries the query AND the fragment, so
    // caching the request as it comes stores a portal token and a one-time
    // sign-in code where any same-origin script can read them, with no expiry.
    await test.step("it writes no capability into the cache", async () => {
      // Waited for on the path, whatever follows it: a key carrying the secret
      // has to reach the assertions below rather than time out here.
      const cached = (path: string) =>
        expect
          .poll(
            async () =>
              (await cacheKeys(page)).some((key) =>
                key.includes(`${BASE}${path}`),
              ),
            { message: `${path} reaches the cache` },
          )
          .toBe(true);
      await page.goto(`${APP}/portal/#PORTALTOKEN123`);
      await cached("/portal/");
      // The page signs its visitor in on load, and leaving before it has tried
      // would leave the block at the end with nothing to show.
      await expect
        .poll(() => blocked.some((url) => url.includes("accounts:signUp")), {
          message: "the portal tries to sign its visitor in",
        })
        .toBe(true);
      await page.goto(
        `${APP}/continue/?oobCode=OOBCODE456&mode=signIn#idToken=IDTOKEN789`,
      );
      await cached("/continue/");
      const keys = await cacheKeys(page);
      for (const [what, secret] of [
        ["a portal token", "PORTALTOKEN123"],
        ["a one-time code", "OOBCODE456"],
        ["an ID token", "IDTOKEN789"],
      ]) {
        expect(
          keys.filter((key) => key.includes(secret)),
          `${what} never reaches the cache`,
        ).toEqual([]);
      }
      // Otherwise the assertions above would pass by caching nothing at all.
      expect(
        keys.some((key) => key.endsWith(`${BASE}/portal/`)) &&
          keys.some((key) => key.endsWith(`${BASE}/continue/`)),
        `the pages are cached, keyed on the path alone: ${keys.filter((key) => !key.includes("/_app/")).join(" ")}`,
      ).toBe(true);
    });

    await test.step("it opens with the network pulled", async () => {
      // A NAVIGATION back to the entry point rather than a reload: the page
      // sits on /continue/, and reloading there proved only that /continue/
      // was cached while the thing about to be opened offline was the root.
      await page.goto(`${APP}/`);
      // Every hashed file this page loaded, since those are what it boots
      // from; the worker stores each one after answering with it.
      await expect
        .poll(
          async () => {
            const held = new Set(await cacheKeys(page));
            const loaded = await page.evaluate(() =>
              performance
                .getEntriesByType("resource")
                .map((entry) => entry.name)
                .filter((name) => name.includes("/_app/immutable/")),
            );
            return loaded.length > 0 && loaded.every((name) => held.has(name));
          },
          { message: "the shell is cached" },
        )
        .toBe(true);
      // Both layers, because they fail independently. Killing the server is
      // what makes the DOCUMENT come from the cache; emulating offline alone
      // once watched the shell render over a live network and credited the
      // cache, passing with the offline fallback deleted. Going offline is what
      // stops the PAGE reaching Firebase, a different host and still up.
      server.kill();
      await browsing.setOffline(true);
      await expect
        .poll(answering, { message: "the server is gone" })
        .toBeUndefined();
      await page.goto(`${APP}/`);
      // kip's own words, not the absence of an error: a blank page and a
      // browser error page both pass a blacklist. The door, because sign-in is
      // blocked above and this browser never holds a session.
      await expect(
        page.locator("body"),
        "kip renders with no network at all",
      ).toContainText("Spare rooms and empty flats");
      // A read that failed says nothing about the link, and telling someone to
      // ask for a fresh one is the wrong instruction as well as a false one.
      await page.goto(`${APP}/portal/#SOMETOKEN`);
      await expect(
        page.locator("body"),
        "an offline share link says kip is unreachable",
      ).toContainText("Can't reach kip right now");
      expect(
        await page.locator("body").innerText(),
        "and does not claim to be revoked",
      ).not.toMatch(/isn't active|turned off or regenerated/);
    });

    // Positive, so the block is shown to be what stands between the portal
    // visit and a production account: the sign-in was tried.
    expect(
      blocked.some((url) => url.includes("accounts:signUp")),
      `the portal's anonymous sign-in was attempted and failed in the browser: ${blocked.map((url) => url.split("?")[0]).join(" ")}`,
    ).toBe(true);
  } finally {
    await context?.close();
    server.kill();
  }
});
