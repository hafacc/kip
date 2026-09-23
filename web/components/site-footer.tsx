import Link from "next/link";
import { Fragment, type ReactElement } from "react";
import { REPO_URL } from "../utils/contact";

const PAGES = [
  { href: "/about/", label: "About" },
  { href: "/privacy/", label: "Privacy" },
  { href: "/terms/", label: "Terms" },
  { href: "/help/", label: "Help" },
] as const;

export type DocRoute = (typeof PAGES)[number]["href"];

// `next/link` applies the base path; a bare anchor would not.
export default function SiteFooter({
  current,
  className = "",
}: {
  current?: DocRoute;
  className?: string;
}): ReactElement {
  return (
    <footer
      className={`flex flex-wrap items-center justify-center gap-x-2 text-sm text-faint ${className}`}
    >
      {PAGES.map(({ href, label }, index) => (
        <Fragment key={href}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {href === current ? (
            <span aria-current="page">{label}</span>
          ) : (
            <Link href={href} className="hover:text-muted">
              {label}
            </Link>
          )}
        </Fragment>
      ))}
      <span aria-hidden="true">·</span>
      <a href={REPO_URL} className="hover:text-muted">
        Source
      </a>
    </footer>
  );
}
