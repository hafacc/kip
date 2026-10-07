<script lang="ts">
  import type { Snippet } from "svelte";

  // The small helper/error/success line under a field or form. One style source
  // for the note copy repeated across every form surface — auth, settings, the
  // listing form, onboarding, and the profile.
  type FieldNoteTone = "muted" | "danger" | "success";

  const TONES: Record<FieldNoteTone, string> = {
    muted: "text-muted",
    danger: "text-danger",
    success: "text-success-ink",
  };

  let {
    tone = "muted",
    children,
  }: {
    tone?: FieldNoteTone;
    children: Snippet;
  } = $props();
</script>

<p class="px-1 text-sm {TONES[tone]}">{@render children()}</p>
