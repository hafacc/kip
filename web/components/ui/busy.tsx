import type { ReactElement } from "react";
import { LuLoaderCircle } from "react-icons/lu";

// Stands in for a button's label while it works. The label stays for screen
// readers, or the button is announced with no name at all.
export default function Busy({ label }: { label: string }): ReactElement {
  return (
    <>
      <LuLoaderCircle aria-hidden className="animate-spin" />
      <span className="sr-only">{label}</span>
    </>
  );
}
