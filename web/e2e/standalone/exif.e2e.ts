// What the privacy page promises: a photo's EXIF, the GPS tag included, does
// not survive `shrink`, and the two ways re-encoding can fail refuse the upload
// instead of quietly shipping the original.
//
// A browser and not a unit test, and that is not a shortcut: the promise rests
// on Chrome's own canvas encoder, so a DOM shim under `bun test` would be
// testing a different encoder than the one people upload through. The real
// `shrink` is bundled and evaluated on about:blank; no server, no emulator.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { MARKER, markers, withExif } from "../exif.ts";

/** What the bundle leaves on `window`. */
interface Probe {
  kipShrink(file: Blob, maxEdge: number): Promise<Blob>;
  KipPhotoEncodeError: new () => Error;
}

// The entry has to sit under `web/` for `firebase/…` to resolve, and the app's
// own tsc and biome must never see it, hence a scratch dir inside node_modules.
function bundle(): string {
  const web = fileURLToPath(new URL("../..", import.meta.url));
  const dir = `${web}node_modules/.cache/kip-exif`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    `${dir}/entry.ts`,
    `import { shrink, PhotoEncodeError } from ${JSON.stringify(`${web}src/lib/photos.ts`)};\n` +
      "Object.assign(window, { kipShrink: shrink, KipPhotoEncodeError: PhotoEncodeError });\n",
  );
  const built = spawnSync(
    "bun",
    [
      "build",
      `${dir}/entry.ts`,
      "--target=browser",
      "--outfile",
      `${dir}/bundle.js`,
    ],
    { stdio: "inherit" },
  );
  if (built.status !== 0) {
    throw new Error("bun build failed");
  } else {
    return readFileSync(`${dir}/bundle.js`, "utf8");
  }
}

test("shrink strips EXIF and refuses rather than ship the original", async ({
  page,
}) => {
  await page.goto("about:blank");
  await page.addScriptTag({ content: bundle() });

  // Chrome writes the fixture, so it is a JPEG its own decoder accepts; the
  // EXIF is then spliced in here, which is what a camera does.
  const plain = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 90;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2d context");
      context.fillStyle = "#c96";
      context.fillRect(0, 0, 120, 90);
      context.fillStyle = "#333";
      context.fillRect(20, 20, 60, 40);
      const blob = await new Promise<Blob | null>((done) =>
        canvas.toBlob(done, "image/jpeg", 0.9),
      );
      const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    }),
    "base64",
  );
  const fixture = withExif(new Uint8Array(plain));
  const fixtureText = Buffer.from(fixture).toString("latin1");
  expect(markers(fixture), "the fixture carries an EXIF APP1").toContain(0xe1);
  expect(fixtureText, "...with a GPS tag in it").toContain(MARKER);
  expect(fixtureText).toContain("Exif\0\0");

  const shrunk = Buffer.from(
    await page.evaluate(async (source) => {
      const probe = window as unknown as Probe;
      const blob = new Blob(
        [Uint8Array.from(atob(source), (char) => char.charCodeAt(0))],
        { type: "image/jpeg" },
      );
      const out = await probe.kipShrink(blob, 1600);
      const bytes = new Uint8Array(await out.arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    }, Buffer.from(fixture).toString("base64")),
    "base64",
  );
  const shrunkText = shrunk.toString("latin1");
  expect([shrunk[0], shrunk[1]], "shrink returns a JPEG").toEqual([0xff, 0xd8]);
  expect(markers(shrunk), "no APP1 segment survives").not.toContain(0xe1);
  expect(shrunkText, "no EXIF header anywhere in the bytes").not.toContain(
    "Exif\0\0",
  );
  expect(shrunkText, "no GPS block anywhere in the bytes").not.toContain(
    MARKER,
  );

  const decoded = await page.evaluate(async (source) => {
    const blob = new Blob(
      [Uint8Array.from(atob(source), (char) => char.charCodeAt(0))],
      { type: "image/jpeg" },
    );
    const bitmap = await createImageBitmap(blob);
    return `${bitmap.width}x${bitmap.height}`;
  }, shrunk.toString("base64"));
  expect(decoded, "and it is still a picture").toBe("120x90");

  for (const [what, broken] of [
    ["a canvas with no 2d context throws", "getContext"],
    ["a source that will not re-encode throws", "toBlob"],
  ] as const) {
    const outcome = await page.evaluate(
      async ([source, method]) => {
        const probe = window as unknown as Probe;
        const prototype = HTMLCanvasElement.prototype;
        const original = prototype[method];
        Object.assign(prototype, {
          [method]:
            method === "getContext"
              ? () => null
              : (callback: BlobCallback) => callback(null),
        });
        try {
          const blob = new Blob(
            [Uint8Array.from(atob(source), (char) => char.charCodeAt(0))],
            { type: "image/jpeg" },
          );
          await probe.kipShrink(blob, 1600);
          return "returned";
        } catch (caught) {
          return caught instanceof probe.KipPhotoEncodeError
            ? "threw"
            : "wrong error";
        } finally {
          Object.assign(prototype, { [method]: original });
        }
      },
      [plain.toString("base64"), broken] as const,
    );
    expect(outcome, what).toBe("threw");
  }
});
