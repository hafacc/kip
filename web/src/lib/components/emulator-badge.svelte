<script lang="ts">
  import { usingEmulators } from "../firebase";

  // Says which backend this build is talking to, because the difference is
  // otherwise invisible and its symptoms look like bugs: an emulated Firestore
  // starts empty, so every real share link resolves to nothing and reads as
  // "this link isn't active". Folded out of production entirely by the DEV half
  // of `usingEmulators`.
</script>

{#if usingEmulators()}
  <div
    class="pointer-events-none fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-danger px-3 py-1 text-xs font-semibold text-white shadow-card"
  >
    Emulated — real share links won't resolve
  </div>
{/if}
