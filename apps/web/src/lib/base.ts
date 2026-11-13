// wrise fork (DEM-1293): Nootion served under a path prefix (NOOTION_BASE_PATH at build time, e.g. /nootion/), behind a reverse proxy that
// strips it. Every path the app uses is absolute ("/api/…", "/page/…", and "/api/attachments/…" stored in page content), so they are
// prefixed here at the few places a URL leaves the app: fetch, EventSource, XMLHttpRequest, window.open, and src/href attributes in the DOM.
// Without a prefix (the default build) nothing changes.
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** "/api/x" -> "<BASE>/api/x"; full URLs, "//host" and already prefixed paths stay. */
export function withBase(url: string): string {
  if (!BASE || !url.startsWith("/") || url.startsWith("//") || url === BASE || url.startsWith(`${BASE}/`) || url.startsWith(`${BASE}?`) || url.startsWith(`${BASE}#`)) return url;
  return BASE + url;
}

/** The app path of a URL path: "<BASE>/page/x" -> "/page/x". */
export const withoutBase = (path: string) => (BASE && (path === BASE || path.startsWith(`${BASE}/`)) ? path.slice(BASE.length) || "/" : path);

const ATTRS = ["src", "href", "action", "poster"];
// data-no-base: a link to the Wrise portal itself (same origin, outside the prefix), kept as written.
function fix(el: Element) {
  if (el.hasAttribute("data-no-base")) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && withBase(v) !== v) el.setAttribute(a, withBase(v));
  }
}

export function installBase(): void {
  if (!BASE) return;
  const f = window.fetch.bind(window);
  window.fetch = (input, init) => f(typeof input === "string" ? withBase(input) : input instanceof URL ? input : input, init);
  const ES = window.EventSource;
  if (ES) window.EventSource = class extends ES { constructor(url: string | URL, init?: EventSourceInit) { super(typeof url === "string" ? withBase(url) : url, init); } } as typeof EventSource;
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    return (open as (...a: unknown[]) => void).call(this, method, typeof url === "string" ? withBase(url) : url, ...rest);
  } as typeof open;
  const wopen = window.open.bind(window);
  window.open = (url?: string | URL, ...rest) => wopen(typeof url === "string" ? withBase(url) : url, ...rest);
  const scan = (root: ParentNode) => { if (root instanceof Element) fix(root); root.querySelectorAll?.("[src],[href],[action],[poster]").forEach(fix); };
  scan(document);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "attributes" && m.target instanceof Element) fix(m.target);
      else m.addedNodes.forEach((n) => n instanceof Element && scan(n));
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS });
}
