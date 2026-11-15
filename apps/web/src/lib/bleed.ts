import { useCallback } from "react";

/**
 * Wide tables and databases reach past the text to the page area's edges, like Notion (DEM-1447).
 * Put the returned ref on the page's text column: it sets --bleed-l / --bleed-r, the room between the column's text and the
 * edges of its parent (the page area, which makes room for the comments panel), for the rules in index.css.
 */
export function useBleed() {
  return useCallback((col: HTMLElement | null) => {
    const area = col?.parentElement;
    if (!col || !area) return;
    const set = () => {
      const a = area.getBoundingClientRect();
      const c = col.getBoundingClientRect();
      const cs = getComputedStyle(col);
      const as = getComputedStyle(area);
      col.style.setProperty("--bleed-l", `${Math.max(0, c.left + parseFloat(cs.paddingLeft) - a.left - parseFloat(as.paddingLeft))}px`);
      col.style.setProperty("--bleed-r", `${Math.max(0, a.right - parseFloat(as.paddingRight) - c.right + parseFloat(cs.paddingRight))}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(area);
    ro.observe(col);
    return () => ro.disconnect();
  }, []);
}
