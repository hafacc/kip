// A static export: every route is rendered to a file at build time, and each
// lives in its own directory so a host with no rewrite rules serves it.
export const prerender = true;
export const trailingSlash = "always";
