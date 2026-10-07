// The only way to open the install dialog yourself, and Chrome hands it over
// once. Kept until it is used.
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let waiting = $state.raw<InstallPrompt | null>(null);
// Both answers come from the browser, and the prerendered HTML is drawn on a
// machine that has neither — so they start false and `startInstall` asks.
let installed = $state(false);
let apple = $state(false);

// Safari offers no equivalent event: an iPhone installs through Share → Add to
// Home Screen and nothing can trigger that from a page. Detected so the menu
// can say how instead of offering a button that cannot work. `MSStream` rules
// out old Edge, which lied about being iOS.
function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // An iPad reports a MACINTOSH user agent by default, and has done since
  // iPadOS 13 — so the obvious test misses every iPad and the row simply
  // vanishes for them, on a device where Add to Home Screen is right there. A
  // Mac with a touchscreen is what tells them apart, and there is no such Mac.
  const touch = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return (
    (/iPad|iPhone|iPod/.test(ua) || touch) &&
    !("MSStream" in window) &&
    /Safari/.test(ua) &&
    !/CriOS|FxiOS/.test(ua)
  );
}

// Already installed, so there is nothing to offer. Both halves are needed: the
// media query answers on Android and desktop, `standalone` is Safari's own.
function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}

// Chrome can fire `beforeinstallprompt` before this module has loaded, and does
// not replay it — so `app.html` listens from the first byte and leaves what it
// caught on `window`. The listener here is for one that fires later.
if (typeof window !== "undefined") {
  waiting = (window.kipInstallPrompt as InstallPrompt | undefined) ?? null;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Always held, so installing only happens when someone asks: Chrome shows
    // its own banner whenever it likes, which is nagging where kip means to
    // offer.
    event.preventDefault();
    waiting = event as InstallPrompt;
  });
  window.addEventListener("appinstalled", () => {
    waiting = null;
  });
}

/** Ask the browser whether kip is installed already and how it could be. */
export function startInstall(): void {
  installed = isInstalled();
  apple = isApple();
}

/** Whether kip can be installed from here, and the way to do it. */
export const install = {
  /** A real prompt is available, so the control can be a button. */
  get ready(): boolean {
    return !installed && waiting !== null;
  },
  /** No prompt will ever come, but it CAN be installed by hand. */
  get byHand(): boolean {
    return !installed && apple;
  },
  /** Open the browser's install dialog. */
  async prompt(): Promise<void> {
    const held = waiting;
    if (!held) return;
    try {
      await held.prompt();
    } catch (error) {
      // Refused rather than shown — no user gesture behind the call, say —
      // which leaves the event unspent, so it is kept and the row stays.
      console.warn("install", error);
      return;
    }
    // Shown, so it is spent: a second `prompt()` on the same event throws,
    // and only a fresh `beforeinstallprompt` can offer again.
    waiting = null;
  },
};
