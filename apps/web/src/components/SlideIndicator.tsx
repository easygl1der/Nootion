import { useLayoutEffect, useRef } from "react";

/** The sidebar's selected page row: the link React Router marks as the current page (the Wrise tabs are not rows). */
export const SELECTED_ROW = 'a[aria-current="page"]:not(.wrise-tab)';

/**
 * wrise fork (DEM-1395, the portal's components/dem378/sidebar/slide-indicator.tsx): one selection block that slides from the
 * old selected row to the new one (220 ms ease-standard, wrise.css `.wrise-slide`). It lands without moving on first paint and
 * when the layout shifts (a branch opens, the sidebar is resized); only a new selected row slides. Render it as the first child
 * of the scrolling container, which needs `relative isolate`. Until it has landed the row draws the same block itself.
 */
export function SlideIndicator() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ind = ref.current;
    const host = ind?.parentElement;
    if (!ind || !host) return;
    let last: Element | null = null;
    let slideEnd = 0; // while a slide runs, a layout shift retargets it instead of snapping it
    const pick = () => Array.from(host.querySelectorAll(SELECTED_ROW)).find((el) => el.getClientRects().length > 0) ?? null;
    const place = (animate: boolean) => {
      const on = pick();
      host.toggleAttribute("data-slide-ready", !!on);
      ind.style.opacity = on ? "1" : "0";
      if (!on) { last = null; return; }
      const h = host.getBoundingClientRect();
      const r = on.getBoundingClientRect();
      if (!animate || !last) ind.style.transition = "none";
      else slideEnd = performance.now() + 240;
      ind.style.transform = `translate(${r.left - h.left + host.scrollLeft}px, ${r.top - h.top + host.scrollTop}px)`;
      ind.style.width = `${r.width}px`;
      ind.style.height = `${r.height}px`;
      if (ind.style.transition === "none") { void ind.offsetHeight; ind.style.transition = ""; }
      last = on;
    };
    place(false);
    // only a new selected row slides; layout shifts reach the ResizeObserver and land in place
    const resized = new ResizeObserver(() => place(performance.now() < slideEnd));
    const watch = () => { resized.observe(host); for (const child of Array.from(host.children)) resized.observe(child); };
    const changed = new MutationObserver(() => {
      watch(); // sections that render later (workspaces load) are watched too
      if (pick() !== last) place(true);
    });
    changed.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current"] });
    watch();
    return () => { changed.disconnect(); resized.disconnect(); host.removeAttribute("data-slide-ready"); };
  }, []);
  return <div ref={ref} aria-hidden className="wrise-slide" />;
}
