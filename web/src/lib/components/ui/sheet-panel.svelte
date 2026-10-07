<script lang="ts" module>
  // Open sheets, innermost last: a confirm raised over a sheet is its own sheet,
  // and Escape or Tab belongs to the top one only.
  const stack: symbol[] = [];

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  // The sheet as drawn. `sheet.svelte` mounts one onto `<body>` while open.
  let {
    onclose,
    title,
    children,
  }: {
    onclose: () => void;
    title?: string;
    children: Snippet;
  } = $props();

  let panel = $state<HTMLDivElement>();

  // `onclose` is read when a key is pressed, not here, so a caller passing a
  // fresh closure does not re-run this and bounce focus about.
  $effect(() => {
    if (!panel) return;
    const node = panel;
    const token = Symbol("sheet");
    stack.push(token);
    // A child's `autofocus` is honored here: the attribute by itself only takes
    // while nothing else holds focus, and the control that opened the sheet does.
    const wanted = node.querySelector<HTMLElement>("[autofocus]");
    if (wanted) wanted.focus();
    else if (!node.contains(document.activeElement)) node.focus();

    function onKey(event: KeyboardEvent): void {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === "Escape") {
        onclose();
      } else if (event.key === "Tab") {
        const focusable = Array.from(
          node.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (focusable.length === 0) {
          event.preventDefault();
          node.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const current = document.activeElement;
        if (event.shiftKey && (current === first || current === node)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && current === last) {
          event.preventDefault();
          first.focus();
        } else if (!node.contains(current)) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
    };
  });
</script>

<div
  class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
>
  <button
    type="button"
    aria-label="Dismiss"
    onclick={onclose}
    class="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
  ></button>
  <div
    bind:this={panel}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    class="relative flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-3xl bg-surface p-5 outline-none pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-panel sm:max-w-md sm:rounded-3xl sm:pb-5"
  >
    <span
      class="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-surface-hover sm:hidden"
    ></span>
    {#if title}
      <h2 class="mb-4 text-xl font-bold tracking-[-0.02em]">{title}</h2>
    {/if}
    {@render children()}
  </div>
</div>
