<script lang="ts">
  // The Terra wordmark: the gradient disc holding a white "k", set beside "kip" in
  // a heavy tight-tracked sans. One source of truth for the brand lockup — header,
  // sign-in, portal all render this.
  let { size = "md" }: { size?: "md" | "lg" } = $props();

  // `rounded-full`, not a radius from the scale. Terra's radii already exceed
  // half of a box this small and CSS clamps there, so both sizes drew circles
  // while their classes said otherwise — one scale change from squaring off.
  const tile = $derived(
    size === "lg"
      ? "h-11 w-11 rounded-full text-2xl"
      : "h-8 w-8 rounded-full text-lg",
  );
  const word = $derived(size === "lg" ? "text-3xl" : "text-xl");
</script>

<span class="inline-flex items-center gap-2">
  <span
    class="bg-gradient-accent grid place-items-center font-extrabold text-white shadow-glow {tile}"
  >
    k
  </span>
  <span class="font-extrabold tracking-[-0.03em] {word}">kip</span>
</span>
