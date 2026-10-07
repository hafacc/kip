<script lang="ts">
  import { BASE_PATH } from "../base";
  import { startInstall } from "../install.svelte";

  // Renders nothing: registers the service worker and asks the browser whether
  // kip can be installed.
  $effect(() => {
    startInstall();
    if (!("serviceWorker" in navigator)) return;
    // Never in dev: the dev server serves modules a cache would hand back stale,
    // with no version bump between edits to invalidate them. The file is built
    // there anyway, so flipping this line is all it takes to try it locally.
    if (import.meta.env.DEV) return;
    // Deliberately after load. Registration competes with the first paint's own
    // requests for the same connection, and the worker is of no use on the visit
    // that installs it.
    const start = (): void => {
      navigator.serviceWorker
        .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
        .catch((error) => console.warn("service worker", error));
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  });
</script>
