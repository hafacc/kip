<script lang="ts">
  import { theme } from "../theme.svelte";

  // What the browser paints around the app — Android's status bar, an installed
  // window's title bar. Renders nothing.
  //
  // `app.html` declares two of these keyed on `prefers-color-scheme`, which is
  // right for the first paint and wrong from then on: kip's theme is a THREE-state
  // choice, so someone who picked Dark on a light system got a dark app under a
  // cream bar. The static pair stays for the paint before this runs; from there
  // both are set to whatever the app actually resolved to, so whichever one the
  // media query picks is the same answer.
  $effect(() => {
    if (!theme.resolved) return;
    const color = theme.resolved === "dark" ? "#161009" : "#f6f1ea";
    for (const tag of document.querySelectorAll('meta[name="theme-color"]')) {
      tag.setAttribute("content", color);
    }
  });
</script>
