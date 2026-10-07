import { asThemeChoice, type ThemeChoice } from "./theme";

// The key and the three values an earlier version of kip wrote, so a choice
// made then still holds.
const STORAGE_KEY = "theme";
const SYSTEM_DARK = "(prefers-color-scheme: dark)";

type Resolved = "light" | "dark";

// "system" and unresolved until `startTheme` runs: the prerendered HTML is
// drawn on a machine with no stored choice, so the first client render has to
// agree with it. The class on <html> does not wait for this — the first script
// in `app.html` reads the same key and sets it before first paint, so the page
// never draws in the wrong theme and then corrects itself.
let choice = $state<ThemeChoice>("system");
let resolved = $state<Resolved | null>(null);

function stored(): ThemeChoice {
  try {
    return asThemeChoice(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "system";
  }
}

function resolve(wanted: ThemeChoice): Resolved {
  if (wanted === "system") {
    return window.matchMedia(SYSTEM_DARK).matches ? "dark" : "light";
  } else {
    return wanted;
  }
}

function apply(next: Resolved): void {
  const root = document.documentElement;
  if (root.classList.contains(next)) return;
  // Every colour here transitions, so a switch would otherwise fade each
  // surface at its own pace. Held off for the one frame the swap takes.
  const still = document.createElement("style");
  still.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(still);
  root.classList.remove("light", "dark");
  root.classList.add(next);
  root.style.colorScheme = next;
  // Reading a computed style forces the restyle while transitions are off.
  void window.getComputedStyle(document.body).opacity;
  setTimeout(() => still.remove(), 1);
}

function adopt(wanted: ThemeChoice): void {
  choice = wanted;
  resolved = resolve(wanted);
  apply(resolved);
}

/** The theme, as chosen and as it resolved. */
export const theme = {
  /** What was picked: follow the system, or force one. */
  get choice(): ThemeChoice {
    return choice;
  },
  /** What is on screen, or null before the browser has been asked. */
  get resolved(): Resolved | null {
    return resolved;
  },
  /** Apply and remember a choice. */
  set(wanted: ThemeChoice): void {
    try {
      localStorage.setItem(STORAGE_KEY, wanted);
    } catch {
      // Private mode: the choice holds for this page load only.
    }
    adopt(wanted);
  },
};

/**
 * Read the stored choice and follow the system and other tabs from here on.
 *
 * Call once, from an effect in the root layout. Returns the teardown.
 */
export function startTheme(): () => void {
  adopt(stored());
  const system = window.matchMedia(SYSTEM_DARK);
  const onSystem = (): void => {
    if (choice === "system") adopt("system");
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY) adopt(asThemeChoice(event.newValue));
  };
  system.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    system.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}
