import type { Screen } from "$lib/types";

declare global {
  interface Window {
    // An install prompt that arrived before the app did; see `app.html`.
    kipInstallPrompt?: Event;
  }

  namespace App {
    // What each history entry of the app carries; see `$lib/store.svelte.ts`.
    interface PageState {
      kipStack?: readonly Screen[];
      kipDepth?: number;
      kipEntry?: string;
    }
  }
}
