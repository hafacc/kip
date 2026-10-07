// How far a masked rail edge fades.
const FADE = "1.5rem";

/**
 * Fades whichever edge of a horizontally scrolling rail has more beyond it.
 *
 * Masked rather than overlaid with a gradient, because the same rail sits on
 * the canvas in one place and on a card in another, and an overlay would need
 * to know. Create one while a component initializes, bind `node` to the rail
 * and set `maskImage` as its `mask-image`. `count` re-measures when an item is
 * added or removed, which the observer can't see, since the rail's own box
 * doesn't change size when its contents do.
 */
export class RailFade {
  /** The scrolling element; bind it with `bind:this`. */
  node = $state<HTMLDivElement>();
  #before = $state(false);
  #after = $state(false);

  constructor(count: () => number) {
    $effect(() => {
      count();
      const { node } = this;
      if (!node) return;
      const measure = (): void => {
        this.#before = node.scrollLeft > 1;
        this.#after = node.scrollWidth - node.clientWidth - node.scrollLeft > 1;
      };
      measure();
      // What fits changes on rotate and any layout shift, not only on add.
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      node.addEventListener("scroll", measure);
      return () => {
        observer.disconnect();
        node.removeEventListener("scroll", measure);
      };
    });
  }

  /** The mask to apply, or undefined while neither edge has more beyond it. */
  get maskImage(): string | undefined {
    if (!this.#before && !this.#after) return undefined;
    const stops = [
      this.#before ? "transparent 0" : "black 0",
      this.#before ? `black ${FADE}` : null,
      this.#after ? `black calc(100% - ${FADE})` : null,
      this.#after ? "transparent 100%" : "black 100%",
    ].filter((stop): stop is string => stop !== null);
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }
}
