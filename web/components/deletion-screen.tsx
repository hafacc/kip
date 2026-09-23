"use client";

import { type ReactElement, useState } from "react";
import { CONTACT_EMAIL } from "../utils/contact";
import { clearDeletion, requestDeletion } from "../utils/leave";
import { useKip } from "../utils/store";
import {
  DELETION_LABELS,
  DELETION_PHASES,
  type DeletionRequest,
  deletionProgress,
} from "../utils/types";
import Button from "./ui/button";
import FieldNote from "./ui/field-note";
import { Mark } from "./wordmark";

// Both buttons clear the doc; rules allow that only once `error` is set.
function Stalled({ request }: { request: DeletionRequest }): ReactElement {
  const { user } = useKip();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(again: boolean): Promise<void> {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      await clearDeletion(user.uid);
      if (again) await requestDeletion(user.uid);
    } catch (caught) {
      console.error(caught);
      setBusy(false);
      setError("Couldn't reach kip just now. Try that again in a minute.");
    }
  }

  return (
    <>
      <h1 className="text-xl font-bold tracking-[-0.02em]">
        kip couldn't finish this
      </h1>
      <p className="text-sm text-muted">
        It stopped after {request.attempts}{" "}
        {request.attempts === 1 ? "attempt" : "attempts"}
        {request.phase
          ? `, at ${DELETION_LABELS[request.phase].toLowerCase()}`
          : ""}
        . What it got through has already happened and doesn't come back —
        cancelled stays, and friends whose lists you have gone from. The rest of
        your account is still here.
      </p>
      <div className="flex w-full flex-col gap-2">
        <Button size="lg" onClick={() => act(true)} disabled={busy}>
          Try deleting again
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => act(false)}
          disabled={busy}
        >
          Keep my account for now
        </Button>
      </div>
      {error ? <FieldNote tone="danger">{error}</FieldNote> : null}
      <FieldNote>
        Stuck again? Someone will finish it by hand — email{" "}
        <a
          className="font-semibold text-accent-ink"
          href={`mailto:${CONTACT_EMAIL}`}
        >
          {CONTACT_EMAIL}
        </a>
        .
      </FieldNote>
    </>
  );
}

// What a signed-in account looks like while the trigger dismantles it. Calm on
// purpose: this is something they asked for, and the one thing worth saying is
// that it no longer needs them — a browser closed halfway is exactly the bug
// moving this to a function fixed.
export default function DeletionScreen({
  request,
}: {
  request: DeletionRequest;
}): ReactElement {
  const step = request.phase ? DELETION_PHASES.indexOf(request.phase) + 1 : 0;
  const fraction = deletionProgress(request.phase);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Mark />
      {request.failed ? (
        <Stalled request={request} />
      ) : (
        <>
          <h1 className="text-xl font-bold tracking-[-0.02em]">
            Deleting your kip
          </h1>
          <p className="text-sm text-muted">
            This is running on kip's side now, so you can close this — it
            finishes on its own.
          </p>
          <div className="w-full">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-hover"
              role="progressbar"
              aria-label="Deleting your kip"
              aria-valuemin={0}
              aria-valuemax={DELETION_PHASES.length + 2}
              aria-valuenow={step + 1}
              aria-valuetext={
                request.phase ? DELETION_LABELS[request.phase] : "Starting"
              }
            >
              {/* Width, not a transform: the fill is a gradient, and scaling one
                  stretches its colours along with the bar. */}
              <div
                className="h-full rounded-full bg-gradient-accent transition-[width] duration-500 ease-out"
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
            <p className="mt-3 text-sm font-semibold text-muted tabular-nums">
              {request.phase
                ? `${DELETION_LABELS[request.phase]} · step ${step} of ${DELETION_PHASES.length}`
                : "Getting started"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
