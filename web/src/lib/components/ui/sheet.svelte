<script lang="ts">
  import { mount, type Snippet, unmount } from "svelte";
  import SheetPanel from "./sheet-panel.svelte";

  let {
    open,
    onclose,
    title,
    children,
  }: {
    open: boolean;
    onclose: () => void;
    title?: string;
    children: Snippet;
  } = $props();

  // Mounted onto <body> as a tree of its own: a blurred or transformed ancestor
  // becomes the containing block for `fixed`, and a modal must not be positioned
  // by whatever happens to contain the button that opened it. Mounted rather
  // than moved there, because a node moved out of its block is no longer inside
  // what Svelte removes when an ancestor of the sheet goes away.
  //
  // Depends on `open` alone: the panel reads the other props through getters.
  $effect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const mounted = mount(SheetPanel, {
      target: document.body,
      props: {
        onclose: () => onclose(),
        get title() {
          return title;
        },
        get children() {
          return children;
        },
      },
    });
    return () => {
      void unmount(mounted);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  });
</script>
