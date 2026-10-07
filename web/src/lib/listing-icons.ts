import type { Component } from "svelte";
import type { SvelteHTMLElements } from "svelte/elements";
import LuBed from "~icons/lucide/bed";
import LuBuilding2 from "~icons/lucide/building-2";
import LuHouse from "~icons/lucide/house";
import type { ListingType } from "./types";

/** An icon component, as `~icons/*` exports them. */
export type Icon = Component<SvelteHTMLElements["svg"]>;

// Apart from `listings.ts` because an icon is a virtual module only Vite can
// resolve, and `listings.ts` is reached by suites that run under plain `bun test`.
export function listingTypeIcon(type: ListingType): Icon {
  switch (type) {
    case "ROOM":
      return LuBed;
    case "FLAT":
      return LuBuilding2;
    case "HOUSE":
      return LuHouse;
  }
}
