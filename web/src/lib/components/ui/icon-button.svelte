<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  type IconButtonVariant = "ghost" | "surface" | "danger" | "success";

  const VARIANTS: Record<IconButtonVariant, string> = {
    ghost: "text-muted hover:bg-surface-hover hover:text-text",
    surface: "bg-surface text-text shadow-soft hover:bg-surface-hover",
    danger: "text-muted hover:bg-surface-hover hover:text-danger",
    success: "bg-success-soft text-success hover:opacity-90",
  };

  let {
    label,
    variant = "ghost",
    class: className = "",
    type = "button",
    children,
    ...rest
  }: Omit<HTMLButtonAttributes, "class"> & {
    label: string;
    variant?: IconButtonVariant;
    class?: string;
  } = $props();
</script>

<button
  {type}
  aria-label={label}
  title={label}
  class="grid h-11 w-11 shrink-0 place-items-center rounded-full transition disabled:pointer-events-none disabled:opacity-50 {VARIANTS[
    variant
  ]} {className}"
  {...rest}
>
  {@render children?.()}
</button>
