<script lang="ts">
  import LuLoaderCircle from "~icons/lucide/loader-circle";

  // Stands in for a button's label while it works. The label stays for screen
  // readers, or the button is announced with no name at all.
  let { label }: { label: string } = $props();
</script>

<LuLoaderCircle aria-hidden="true" class="animate-spin" />
<span class="sr-only">{label}</span>
