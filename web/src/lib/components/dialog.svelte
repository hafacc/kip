<script lang="ts" module>
  type DialogTone = "default" | "danger";

  export type ConfirmOptions = {
    title: string;
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: DialogTone;
  };

  export type AlertOptions = {
    title: string;
    body?: string;
    okLabel?: string;
  };

  type ActiveDialog =
    | {
        kind: "confirm";
        options: ConfirmOptions;
        resolve: (confirmed: boolean) => void;
      }
    | { kind: "alert"; options: AlertOptions; resolve: () => void };

  let active = $state.raw<ActiveDialog | null>(null);

  /**
   * In-app dialogs: a bottom sheet on mobile, a centered card on desktop.
   *
   * `confirm` resolves to whether it was confirmed and `alert` when it is
   * dismissed. Every destructive action goes through `confirm`; nothing calls
   * the browser's own. Drawn by this component, mounted once in the app layout.
   */
  export const dialog = {
    confirm(options: ConfirmOptions): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        active = { kind: "confirm", options, resolve };
      });
    },
    alert(options: AlertOptions): Promise<void> {
      return new Promise<void>((resolve) => {
        active = { kind: "alert", options, resolve };
      });
    },
  };

  const FAILED = "Something went wrong. Please try again.";

  /**
   * Report a caught failure as a dialog, for handlers that hold their own busy
   * state and so can't hand the whole action to `runAction`.
   */
  export function reportFailure(error: unknown, message = FAILED): void {
    console.error(error);
    void dialog.alert({ title: "That didn't work", body: message });
  }

  /**
   * Run a fire-and-forget async action (a booking confirm/cancel, an accept, a
   * delete) so a rules denial, offline timeout, or batch conflict surfaces as a
   * dialog instead of an unhandled rejection and a button that silently does
   * nothing.
   */
  export function runAction(
    action: () => Promise<unknown>,
    message?: string,
  ): void {
    action().catch((error: unknown) => reportFailure(error, message));
  }

  function close(confirmed: boolean): void {
    const current = active;
    active = null;
    if (current?.kind === "confirm") current.resolve(confirmed);
    else if (current?.kind === "alert") current.resolve();
  }
</script>

<script lang="ts">
  import Button from "./ui/button.svelte";
  import Sheet from "./ui/sheet.svelte";

  // Enter confirms unless focus is on a control, which answers Enter itself —
  // otherwise Enter on a focused Cancel would confirm. Escape/backdrop
  // dismissal is handled by the Sheet.
  $effect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "Enter") return;
      const focused = document.activeElement;
      if (focused?.closest("button, a, input, textarea, select")) return;
      close(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const danger = $derived(
    active?.kind === "confirm" && active.options.tone === "danger",
  );
</script>

{#if active}
  <Sheet open onclose={() => close(false)} title={active.options.title}>
    {#if active.options.body}
      <div class="text-[0.9375rem] text-muted">{active.options.body}</div>
    {/if}
    <div class="flex justify-end gap-2 pt-5">
      {#if active.kind === "confirm"}
        <Button variant="ghost" onclick={() => close(false)}>
          {active.options.cancelLabel ?? "Cancel"}
        </Button>
      {/if}
      <Button
        variant={danger ? "dangerSolid" : "primary"}
        autofocus
        onclick={() => close(true)}
      >
        {#if active.kind === "confirm"}
          {active.options.confirmLabel ?? "Confirm"}
        {:else}
          {active.options.okLabel ?? "OK"}
        {/if}
      </Button>
    </div>
  </Sheet>
{/if}
