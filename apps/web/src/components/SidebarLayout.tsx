import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { isMac } from "./QuickCapture";
import { t } from "@nootion/shared";
import { PORTAL_WIDTH, readPortalFolded, readPortalWidth, savePortalFolded, savePortalWidth } from "../lib/wrise";

interface SidebarState {
  /** Opens the drawer on phones. */
  open: () => void;
  /** Wide screens: the sidebar is folded to its icons, as the portal's (DEM-1445). */
  collapsed: boolean;
  toggle: () => void;
}
const SidebarContext = createContext<SidebarState | null>(null);
const COLLAPSED_KEY = "nootion-sidebar-collapsed";

const WIDTH_KEY = "nootion-sidebar-width";
// DEM-1445: the portal's width, range and saved value, so the rail does not change size between Notes and the portal (the tab row wraps below 254px).
const DEFAULT_WIDTH = PORTAL_WIDTH.initial;
const MIN_WIDTH = PORTAL_WIDTH.min;
const MAX_WIDTH = PORTAL_WIDTH.max;
const clampWidth = (w: number) =>
  Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));

function readWidth() {
  try {
    const w = readPortalWidth() ?? Number(localStorage.getItem(WIDTH_KEY));
    return w ? clampWidth(w) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function readCollapsed() {
  try {
    return readPortalFolded() ?? localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The portal's frame (DEM-1445, apps/portal/components/ui/sidebar.tsx variant "inset"): on wide screens the rail sits in an 8px navy frame and the
 * page is a white card beside it; folding (the menu button, the edge, or Ctrl+\\) leaves the rail's icons. Width and fold are the portal's own,
 * so moving between Notes and the portal changes only the page. On phones the sidebar slides in over the content and closes when a link is followed.
 */
export function SidebarLayout({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [width, setWidth] = useState(readWidth);
  const [resizing, setResizing] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  // No fade or nudge on a page change: route changes are instant in the portal (DESIGN.md Motion), and arriving from it must not look like a new site (DEM-1445).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // Private browsing: not remembered.
      }
      savePortalFolded(!c);
      return !c;
    });
  }, []);
  // Ctrl+\ (⌘\ on a Mac), as in Notion.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  const saveWidth = useCallback((w: number) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(w));
    } catch {
      // Private browsing: not remembered.
    }
    savePortalWidth(w);
  }, []);
  // The edge: dragged, it resizes the sidebar; clicked, it puts it away (or docks it back), as in Notion.
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = width;
    let moved = false;
    let last = startWidth;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      if (!moved) setResizing(true);
      moved = true;
      last = clampWidth(startWidth + ev.clientX - startX);
      setWidth(last);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setResizing(false);
      if (moved) saveWidth(last);
      else toggle();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };
  const onHandleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    const next =
      e.key === "ArrowLeft"
        ? width - step
        : e.key === "ArrowRight"
          ? width + step
          : e.key === "Home"
            ? MIN_WIDTH
            : e.key === "End"
              ? MAX_WIDTH
              : null;
    if (next === null) {
      if (e.key === "Enter" || e.key === " ") (e.preventDefault(), toggle());
      return;
    }
    e.preventDefault();
    const w = clampWidth(next);
    setWidth(w);
    saveWidth(w);
  };

  const state = useMemo(
    () => ({ open: () => setOpen(true), collapsed, toggle }),
    [collapsed, toggle],
  );

  // On phones it takes the visible height (above the browser's toolbars) and scrolls as a whole, so that its
  // footer (account, administration) can always be reached; on wide screens only its page list scrolls.
  // Folded: the portal's icon rail, 2.5rem + its 8px frame each side + 2px, overlapping the page's 8px gap by 2px.
  const desktop = `md:static md:z-auto md:translate-x-0 md:transition-none ${collapsed ? "md:w-[58px] md:-mr-0.5" : "md:w-(--sidebar-w)"}`;
  return (
    <SidebarContext.Provider value={state}>
      {/* overflow-hidden: the fade-in nudges the page down 4px, which must not make the window scroll. */}
      <div
        className={`wrise-frame flex h-full overflow-hidden ${resizing ? "cursor-col-resize select-none" : ""}`}
        style={{ "--sidebar-w": `${width}px` } as React.CSSProperties}
      >
        {open && (
          <div
            className="nt-backdrop fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}
        <aside
          aria-label={t("sidebar.label")}
          data-folded={collapsed ? "" : undefined}
          className={`group/sidebar fixed top-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] shrink-0 flex-col overflow-y-auto border-r pb-[env(safe-area-inset-bottom)] md:h-auto md:overflow-visible md:pb-0 border-neutral-200 bg-neutral-50 transition-transform duration-200 dark:border-neutral-800 dark:bg-neutral-950 ${open ? "translate-x-0 shadow-2xl" : "-translate-x-full"} ${desktop}`}
        >
          {sidebar}
          {/* The edge, to resize or put away (wide screens). */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("sidebar.resize")}
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={MAX_WIDTH}
            aria-valuenow={width}
            tabIndex={0}
            title={`${collapsed ? t("sidebar.edgeDock") : t("sidebar.edgeClose", { keys: `${isMac() ? "⌘" : "Ctrl+"}\\` })}\n${t("sidebar.edgeResize")}`}
            onPointerDown={onHandleDown}
            onKeyDown={onHandleKey}
            data-sidebar-resize
            className="group/edge absolute top-0 -right-1.5 bottom-0 z-20 hidden w-3 cursor-col-resize outline-none md:block"
          >
            <div
              className={`mx-auto h-full w-0.5 transition-colors ${resizing ? "bg-blue-500/70" : "bg-transparent group-hover/edge:bg-neutral-300 group-focus-visible/edge:bg-blue-500/70 dark:group-hover/edge:bg-neutral-700"}`}
            />
          </div>
        </aside>
        <main className="wrise-page min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  );
}

export const useSidebarCollapsed = () => useContext(SidebarContext)?.collapsed ?? false;

/** Opens the sidebar: the drawer on phones; on wide screens, shown only when the sidebar is put away. */
export function MenuButton({ className = "" }: { className?: string }) {
  const ctx = useContext(SidebarContext);
  if (!ctx) return null;
  return (
    <>
    <button
      onClick={() =>
        window.matchMedia?.("(min-width: 768px)").matches
          ? ctx.toggle()
          : ctx.open()
      }
      aria-label="Toggle Sidebar"
      data-menu-button
      title={`Toggle Sidebar (${isMac() ? "⌘" : "Ctrl+"}\\)`}
      className={`flex size-7 shrink-0 items-center justify-center rounded-md text-[#122033] hover:bg-[#eef3f9] dark:text-[#f6f9fd] dark:hover:bg-[#16283b] ${className}`}
    >
      <PanelLeft size={16} aria-hidden />
    </button>
    <span className="mx-2 h-4 w-px shrink-0 bg-[#e6ebf2] dark:bg-white/15" aria-hidden />
    </>
  );
}

/** Top bar of the pages that have no header of their own, shown on phones. */
export function MobileBar({ children }: { children?: ReactNode }) {
  // On every width, like the Wrise header: the sidebar button sits top-left.
  return (
    <header
      className={`sticky top-0 z-30 flex items-center gap-1 border-b border-neutral-200 bg-white/95 px-3 py-1.5 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 `}
    >
      <MenuButton />
      <span className="flex-1" />
      {children}
    </header>
  );
}
