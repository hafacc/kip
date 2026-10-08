// Unset in the release, which serves kip at the root of its own domain. Set
// `VITE_BASE_PATH` to serve under a path (e.g. `/kip`): `vite.config.ts` reads
// the same variable, and everything that builds a URL by hand reads it here.
// Not `$app/paths`, so the modules that need it stay importable under `bun test`.
export const BASE_PATH: string = import.meta.env.VITE_BASE_PATH ?? "";
