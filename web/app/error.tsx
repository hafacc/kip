"use client";

import { type ReactElement, useEffect } from "react";
import Button from "../components/ui/button";
import { Mark } from "../components/wordmark";

// Without this, Next's own fallback offers a way "back" to `/`, which under a
// base path is outside kip altogether.
export default function ErrorPage({
  error,
}: {
  error: Error & { digest?: string };
}): ReactElement {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Mark />
      <h1 className="text-xl font-bold tracking-[-0.02em]">
        This page couldn't load
      </h1>
      <p className="max-w-xs text-sm text-muted">
        Something went wrong on our side. Reloading usually fixes it.
      </p>
      <div className="flex items-center gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        {/* A full load, not a router push: the app is one route, so a push to
            it from inside it would leave this boundary standing. */}
        <a
          href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`}
          className="inline-flex h-11 items-center rounded-full px-5 text-[0.9375rem] font-semibold text-muted hover:bg-surface-hover hover:text-text"
        >
          Home
        </a>
      </div>
    </main>
  );
}
