<script lang="ts">
  import "../app.css";
  import { BASE_PATH } from "#lib/base.ts";
  import Pwa from "#lib/components/pwa.svelte";
  import ThemeColor from "#lib/components/theme-color.svelte";
  import { startTheme } from "#lib/theme.svelte.ts";

  // Everything a page with no session needs, and nothing else: the document
  // pages render under this alone. The store, the dialogs and the identity
  // sheet belong to `(app)/+layout.svelte`.
  let { children } = $props();

  $effect(() => startTheme());
</script>

<svelte:head>
  <!-- The first paint only, and keyed on the SYSTEM preference because static
       HTML has nothing else to key on — `ThemeColor` corrects both to the theme
       actually resolved as soon as it runs. Values are `--color-bg` from
       app.css. -->
  <meta
    name="theme-color"
    content="#f6f1ea"
    media="(prefers-color-scheme: light)"
  >
  <meta
    name="theme-color"
    content="#161009"
    media="(prefers-color-scheme: dark)"
  >
  <link rel="manifest" href="{BASE_PATH}/manifest.webmanifest">
  <!-- Safari reads none of the manifest for Add to Home Screen; it wants
       these. -->
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="kip">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="icon" href="{BASE_PATH}/icon.svg">
  <link rel="apple-touch-icon" href="{BASE_PATH}/apple-touch-icon.png">
  <!-- crossorigin must match the SDK's CORS fetch or the preconnected socket
       isn't reused; photos are plain <img>, so none. -->
  <link
    rel="preconnect"
    href="https://firestore.googleapis.com"
    crossorigin="anonymous"
  >
  <link
    rel="preconnect"
    href="https://identitytoolkit.googleapis.com"
    crossorigin="anonymous"
  >
  <link
    rel="preconnect"
    href="https://securetoken.googleapis.com"
    crossorigin="anonymous"
  >
  <link rel="preconnect" href="https://firebasestorage.googleapis.com">
</svelte:head>

{@render children()}
<Pwa />
<ThemeColor />
