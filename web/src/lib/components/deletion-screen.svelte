<script lang="ts">
  import {
    DELETION_LABELS,
    DELETION_PHASES,
    type DeletionRequest,
    deletionProgress,
  } from "../types";
  import DeletionStalled from "./deletion-stalled.svelte";
  import Mark from "./mark.svelte";

  // What a signed-in account looks like while the trigger dismantles it. Calm on
  // purpose: this is something they asked for, and the one thing worth saying is
  // that it no longer needs them — a browser closed halfway is exactly the bug
  // moving this to a function fixed.
  let { request }: { request: DeletionRequest } = $props();

  const step = $derived(
    request.phase ? DELETION_PHASES.indexOf(request.phase) + 1 : 0,
  );
  const fraction = $derived(deletionProgress(request.phase));
</script>

<div
  class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center"
>
  <Mark />
  {#if request.failed}
    <DeletionStalled {request} />
  {:else}
    <h1 class="text-xl font-bold tracking-[-0.02em]">Deleting your kip</h1>
    <p class="text-sm text-muted">
      This is running on kip's side now, so you can close this — it finishes on
      its own.
    </p>
    <div class="w-full">
      <div
        class="h-2 w-full overflow-hidden rounded-full bg-surface-hover"
        role="progressbar"
        aria-label="Deleting your kip"
        aria-valuemin={0}
        aria-valuemax={DELETION_PHASES.length + 2}
        aria-valuenow={step + 1}
        aria-valuetext={request.phase
          ? DELETION_LABELS[request.phase]
          : "Starting"}
      >
        <!-- Width, not a transform: the fill is a gradient, and scaling one
             stretches its colours along with the bar. -->
        <div
          class="h-full rounded-full bg-gradient-accent transition-[width] duration-500 ease-out"
          style:width="{fraction * 100}%"
        ></div>
      </div>
      <p class="mt-3 text-sm font-semibold text-muted tabular-nums">
        {request.phase
          ? `${DELETION_LABELS[request.phase]} · step ${step} of ${DELETION_PHASES.length}`
          : "Getting started"}
      </p>
    </div>
  {/if}
</div>
