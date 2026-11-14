import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Link,
  NavLink,
  Outlet,
  useMatch,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  LogOut,
  Plus,
  Settings,
  Share2,
  Trash2,
  Users,
  User,
  Download,
  Search,
  Star,
  X,
  Database,
  FileText,
  Calendar,
  ChevronsUpDown,
  BadgeCheck,
  Bell,
  Info,
  Home,
  Mail,
  MessageCircle,
  NotebookText,
  RefreshCw,
} from "lucide-react";
import { disablePush, useReminderNotifications } from "../lib/reminders";
import { t, type PageSummary, type WorkspaceSummary } from "@nootion/shared";
import { workspaceName } from "../lib/labels";
import { api, isOfflineError } from "../lib/api";
import {
  keys,
  useFavorites,
  useRefreshPages,
  useSharedPages,
  useWorkspacePages,
  useWorkspaces,
} from "../lib/queries";
import { useSession } from "../lib/session";
import { useUpdateStatus, useVersion } from "./UpdateNotice";
import { buildTree, pageTitle } from "../lib/tree";
import { DRAG_TYPE, PageTree } from "./PageTree";
import { SlideIndicator } from "./SlideIndicator";
import { Button, CancelButton, ErrorText, Field, Modal } from "./ui";
import { usePlugins } from "../plugins/registry";
import { SearchDialog, useSearchShortcut } from "./SearchDialog";
import {
  QuickCaptureDialog,
  useCaptureShortcut,
} from "./QuickCapture";
import { MobileBar, SidebarLayout, useSidebarCollapsed } from "./SidebarLayout";
import { withBase } from "../lib/base";
import { useIsTouch } from "../lib/mobile";
import { clearOfflineData } from "../lib/offline";
import { SyncStatus } from "./SyncStatus";
import { useLiveEvents } from "../lib/live";
import { pageIcon } from "../lib/icons";
import { syncErrorText, useDesktopSync } from "../pages/SyncPage";
import { useWriseMe, writeAvatar, writeLogout, writeRole, writeSettings, type WriseMe } from "../lib/wrise";

// Official Wrise files (apps/web/public): the wordmark, and the mark when the sidebar is put away.
// The Wrise rail's brand row (portal: sidebar-logo.tsx in SidebarHeader): the official logo, "v<version>" under it.
function BrandImage({ version }: { version: string | null }) {
  const collapsed = useSidebarCollapsed();
  return (
    <span className="flex flex-col items-start gap-1.5">
      <img src={withBase(collapsed ? "/wrise-ai-icon.png" : "/wrise-ai-logo.png")} alt="Wrise AI" className="h-8 w-auto" />
      {version && !collapsed && (
        <span className="pl-0.5 text-[11px] leading-none text-(color:--sidebar-foreground)/60" title={t("admin.version", { version })} data-version>
          v{version}
        </span>
      )}
    </span>
  );
}

// The rail's Search box (portal: search-or-ask.tsx).
function SearchBox({ onClick }: { onClick: () => void }) {
  const touch = useIsTouch();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("search.button")}
      data-testid="search-or-ask"
      className="mx-2 flex h-8 items-center gap-2 rounded-md bg-(--sidebar-accent) px-2 text-sm text-(color:--sidebar-foreground)/70 outline-none transition-colors duration-150 hover:text-(color:--sidebar-foreground) focus-visible:ring-2 focus-visible:ring-(--sidebar-ring) motion-reduce:transition-none"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{t("search.button")}</span>
      {!touch && (
        <kbd className="pointer-events-none ml-auto inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-transparent px-1 font-sans text-xs font-medium text-(color:--sidebar-foreground)/60 select-none">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</kbd>
      )}
    </button>
  );
}

// The Wrise rail's menu button (ui/sidebar.tsx sidebarMenuButtonVariants): hover and press take the accent background; only width, height and padding transition.
const RAIL_BTN = "flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] hover:bg-(--sidebar-accent) hover:text-(color:--sidebar-accent-foreground) focus-visible:ring-2 focus-visible:ring-(--sidebar-ring) active:bg-(--sidebar-accent) active:text-(color:--sidebar-accent-foreground) [&_svg]:size-4 [&_svg]:shrink-0";
const MENU_ITEM = "flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-[#122033] outline-none hover:bg-[#eef3f9] focus-visible:bg-[#eef3f9] dark:text-[#f6f9fd] dark:hover:bg-[#16283b] dark:focus-visible:bg-[#16283b]";

// The rail's account block (portal: nav-user.tsx): avatar, name, role, chevron; the chevron opens the account menu.
// DEM-1392: with the portal there (wriseai.com/notes) it is the portal's account: its name, role, picture and menu (Account, Notifications, Settings
// open the portal's Settings; Log out ends both). Notes keeps only what is its own: Trash, Administration for its admin, Sync, and the source link.
function NavUserBlock({ wrise, onLogout, admin, updateWarning, updateText, syncLinks, syncError }: {
  wrise: WriseMe | null; onLogout: () => void; admin: boolean; updateWarning: boolean; updateText: string; syncLinks: boolean; syncError: string | null | undefined;
}) {
  const { user } = useSession();
  const [noPhoto, setNoPhoto] = useState(false);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const navigate = useNavigate();
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    // beside the rail on wide screens, above the block on phones (the Wrise menu: side right / bottom, align end)
    setPos(window.matchMedia("(min-width: 768px)").matches
      ? { left: r.right + 4, bottom: Math.max(8, window.innerHeight - r.bottom) }
      : { left: Math.max(8, Math.min(r.left, window.innerWidth - 296)), bottom: window.innerHeight - r.top + 4 });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const down = (e: MouseEvent) => { const el = e.target as Element; if (!el.closest("[data-user-menu]") && !btn.current?.contains(el)) setOpen(false); };
    window.addEventListener("keydown", key); window.addEventListener("mousedown", down);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("mousedown", down); };
  }, [open]);
  const name = wrise?.displayName ?? user?.name ?? "";
  const role = wrise ? writeRole(wrise.role) : (user?.role ?? "").replace(/^./, (c) => c.toUpperCase());
  const photo = wrise ? (noPhoto ? null : writeAvatar(wrise.userId)) : user?.avatarUrl;
  const go = (to: string) => { setOpen(false); navigate(to); };
  const settings = (section?: string) => { setOpen(false); writeSettings(section); };
  const face = (size: string) => (
    photo
      ? <img src={photo} alt="" data-no-base={wrise ? "" : undefined} onError={() => setNoPhoto(true)} className={`${size} shrink-0 rounded-lg object-cover`} />
      : <span className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-[#f6f9fd] text-xs font-medium text-[#122033]`}>
          {name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?"}
        </span>
  );
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={name} data-testid="nav-user"
        className={`${RAIL_BTN} h-12 ${open ? "bg-(--sidebar-accent)" : ""}`}>
        {face("size-8")}
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs text-(color:--sidebar-foreground)/70">{role}</span>
        </span>
        <ChevronsUpDown className="ml-auto size-4 shrink-0" aria-hidden />
        {(updateWarning || syncError) && <span className="sr-only">!</span>}
      </button>
      {open && createPortal(
        <div role="menu" data-user-menu style={{ position: "fixed", zIndex: 70, ...pos }}
          className="wrise-rail min-w-72 max-w-[calc(100vw-16px)] rounded-lg bg-white p-1 text-[#122033] shadow-lg ring-1 ring-[#122033]/10 dark:bg-[#0b1c33] dark:text-[#f6f9fd] dark:ring-white/10">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            {face("size-8")}
            <div className="grid flex-1 leading-tight"><span className="truncate font-medium">{name}</span><span className="truncate text-xs text-[#64748b]">{role}</span></div>
          </div>
          <div className="-mx-1 my-1 h-px bg-[#e6ebf2] dark:bg-white/10" />
          {wrise ? (
            <>
              <button role="menuitem" className={MENU_ITEM} onClick={() => settings("accounts")}><BadgeCheck size={16} /> Account</button>
              <button role="menuitem" className={MENU_ITEM} onClick={() => settings("notifications")}><Bell size={16} /> Notifications</button>
              <button role="menuitem" className={MENU_ITEM} onClick={() => settings()}><Settings size={16} /> Settings</button>
              <div className="-mx-1 my-1 h-px bg-[#e6ebf2] dark:bg-white/10" />
            </>
          ) : (
            <button role="menuitem" className={MENU_ITEM} onClick={() => go("/account")}><User size={16} /> {t("account.title")}</button>
          )}
          {admin && (
            <button role="menuitem" className={MENU_ITEM} onClick={() => go("/admin")}>
              <Settings size={16} /> {t("admin.title")}
              {updateWarning && <span className="ml-auto text-amber-500" title={updateText} data-update-warning><AlertTriangle size={14} aria-label={updateText} /></span>}
            </button>
          )}
          <button role="menuitem" className={MENU_ITEM} onClick={() => go("/trash")}><Trash2 size={16} /> {t("trash.title")}</button>
          {syncLinks && (
            <button role="menuitem" className={MENU_ITEM} onClick={() => go("/sync")}>
              <RefreshCw size={16} /> {t("sync.title")}
              {syncError && <span className="ml-auto text-amber-500" title={syncErrorText(syncError)} data-sync-warning><AlertTriangle size={14} aria-label={syncErrorText(syncError)} /></span>}
            </button>
          )}
          {import.meta.env.VITE_SOURCE_URL && (
            // AGPL-3.0 section 13: this copy is modified (wrise fork, DEM-1293), so everyone who uses it is offered its source, here on every page
            // (Yihua 2026-11-14, DEM-1392: not as a line in the sidebar). The portal's docs page "Open-source software" says the same.
            <a role="menuitem" href={import.meta.env.VITE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className={MENU_ITEM} data-wrise-source onClick={() => setOpen(false)}>
              <Info size={16} /> About Notes · Source code (AGPL-3.0)
            </a>
          )}
          <div className="-mx-1 my-1 h-px bg-[#e6ebf2] dark:bg-white/10" />
          <button role="menuitem" className={MENU_ITEM} onClick={() => { setOpen(false); onLogout(); }}><LogOut size={16} /> {wrise ? "Log out" : t("auth.logout")}</button>
        </div>, document.body)}
    </>
  );
}

// The Wrise main frame's tab row, class for class (portal: components/dem378/sidebar/shell-tabs.tsx); colours are the sidebar tokens set on the aside in wrise.css.
// The label opens and closes with the active state (grid 0fr to 1fr, 200 ms ease-out); Notes, this app, is the active tab.
const TAB = "wrise-tab flex h-8 items-center rounded-md px-2 text-sm font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-(--sidebar-ring) motion-reduce:transition-none";
const TAB_ON = "bg-(--sidebar-accent) text-(color:--sidebar-accent-foreground)";
const TAB_OFF = "text-(color:--sidebar-foreground)/70 hover:bg-(--sidebar-accent)/60";
function TabLabel({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`grid transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none ${active ? "grid-cols-[1fr]" : "grid-cols-[0fr]"}`}>
      <span className="overflow-hidden whitespace-nowrap"><span className="pl-1.5">{label}</span></span>
    </span>
  );
}
function WiseTabs() {
  const tabs = [
    { label: "Home", icon: Home, href: "/" },
    { label: "Chat", icon: MessageCircle, href: "/chat" },
    { label: "Calendar", icon: Calendar, href: "/calendar" },
    { label: "Mail", icon: Mail, href: "/mail" },
  ];
  return (
    <nav aria-label="Pages" className="wrise-tabs flex flex-wrap items-center gap-1 px-2" data-testid="wrise-tabs">
      {tabs.map(({ label, icon: Icon, href }) => (
        <a key={label} href={href} aria-label={label} title={label} data-testid={`tab-${label.toLowerCase()}`} data-no-base className={`${TAB} ${TAB_OFF}`}>
          <Icon className="size-4 shrink-0" aria-hidden />
          <TabLabel label={label} active={false} />
        </a>
      ))}
      <NavLink to="/" end aria-label="Notes" title="Notes" data-testid="tab-notes" aria-current="page" className={`${TAB} ${TAB_ON}`}>
        <NotebookText className="size-4 shrink-0" aria-hidden />
        <TabLabel label="Notes" active />
      </NavLink>
    </nav>
  );
}

export function AppShell() {
  const { user, refresh } = useSession();
  const wrise = useWriseMe();
  // The portal's version when Notes runs inside it (DEM-1392), Nootion's own otherwise.
  const nootionVersion = useVersion();
  const version = wrise ? (wrise.version ?? null) : nootionVersion;
  const update = useUpdateStatus(user?.role === "admin").data;
  const updateWarning = !!update?.available && !update.dismissed;
  const navigate = useNavigate();
  const workspaces = useWorkspaces();
  // Loaded ahead: page editors wait for the plugins' blocks before opening.
  usePlugins();
  useLiveEvents(!!user);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [searching, setSearching] = useState(false);
  const [capturing, setCapturing] = useState(false);
  // Pages have their own header, with the menu button.
  // Pages (and the home page) have their own header with the menu button.
  const onPageRoute = useMatch("/page/:id");
  const onHome = useMatch({ path: "/", end: true });
  const onPage = onPageRoute || onHome;
  useSearchShortcut(useCallback(() => setSearching(true), []));
  useCaptureShortcut(useCallback(() => setCapturing(true), []));
  // "Capture" from the installed app's icon menu opens "/?capture".
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (!params.has("capture")) return;
    setCapturing(true);
    setParams((p) => (p.delete("capture"), p), { replace: true });
  }, [params, setParams]);
  useReminderNotifications();
  async function logout() {
    // This device stops receiving the account's reminders.
    await disablePush().catch(() => {});
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (e) {
      if (!isOfflineError(e)) throw e;
      return alert(e.message);
    }
    // Nothing of this account stays on the device.
    await clearOfflineData();
    // Inside the portal: out of Wrise too, and to its login page (DEM-1392).
    if (wrise) return writeLogout();
    await refresh();
    navigate("/login", { replace: true });
  }

  const syncLinks = useDesktopSync().data;
  const syncError = syncLinks?.find((l) => l.lastError)?.lastError;

  const sidebar = (
    <>
      <div className="wrise-rail flex flex-col gap-2 p-2">
        <Link to="/" className={`${RAIL_BTN} h-auto p-1.5`} data-wrise-brand>
          <BrandImage version={version} />
        </Link>
        <SyncStatus className="mx-3 w-fit" />
        <SearchBox onClick={() => setSearching(true)} />
        <WiseTabs />
      </div>
      <nav className="relative isolate flex-1 space-y-5 px-2 py-2 md:overflow-y-auto" aria-label="Pages tree">
        <SlideIndicator />
        <FavoritesSection />
        {workspaces.data?.map((ws) => (
          <WorkspaceSection key={ws.id} workspace={ws} />
        ))}
        <SharedSection />
        <button
          onClick={() => setCreatingWorkspace(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60"
        >
          <Plus size={16} /> {t("workspace.new")}
        </button>
      </nav>
      <div className="wrise-rail flex flex-col gap-2 p-2">
        {/* One Settings: the portal's dialog when Notes runs inside it (DEM-1392), Nootion's account page otherwise. */}
        {wrise ? (
          <button type="button" onClick={() => writeSettings()} className={`${RAIL_BTN} h-8`} data-testid="settings-row">
            <Settings aria-hidden /> Settings
          </button>
        ) : (
          <NavLink to="/account" className={`${RAIL_BTN} h-8`} data-testid="settings-row">
            <Settings aria-hidden /> Settings
          </NavLink>
        )}
        <NavUserBlock
          wrise={wrise}
          onLogout={logout}
          admin={user?.role === "admin"}
          updateWarning={updateWarning}
          updateText={update?.latest ? t("update.available", { version: update.latest.version }) : ""}
          syncLinks={!!syncLinks}
          syncError={syncError}
        />
      </div>
    </>
  );

  return (
    <SidebarLayout sidebar={sidebar}>
      {!onPage && (
        <MobileBar>
          <SyncStatus className="mr-1" />
          <button
            onClick={() => setSearching(true)}
            aria-label={t("search.button")}
            className="md:hidden rounded-md p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Search size={20} />
          </button>
        </MobileBar>
      )}
      <Outlet />
      {creatingWorkspace && (
        <CreateWorkspaceDialog onClose={() => setCreatingWorkspace(false)} />
      )}
      {searching && <SearchDialog onClose={() => setSearching(false)} />}
      {capturing && <QuickCaptureDialog onClose={() => setCapturing(false)} />}
    </SidebarLayout>
  );
}

function SectionHeader({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="group flex items-center justify-between px-2 pb-1">
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-center gap-0.5">{children}</span>
    </div>
  );
}

function WorkspaceSection({ workspace }: { workspace: WorkspaceSummary }) {
  const pages = useWorkspacePages(workspace.id);
  const navigate = useNavigate();
  const refresh = useRefreshPages();
  const canEdit = workspace.role === "owner" || workspace.role === "editor";

  async function addPage() {
    const res = await api<{ page: PageSummary }>("/pages", {
      method: "POST",
      body: { workspaceId: workspace.id, parentId: null, title: "" },
    });
    await refresh();
    navigate(`/page/${res.page.id}`);
  }

  const iconBtn =
    "rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-800";
  return (
    <div>
      <SectionHeader
        icon={
          workspace.kind === "personal" ? (
            <User size={12} />
          ) : (
            <Users size={12} />
          )
        }
        label={workspaceName(workspace)}
      >
        {workspace.kind === "shared" && (
          <Link
            to={`/workspace/${workspace.id}`}
            className={iconBtn}
            title={t("workspace.settings")}
          >
            <Settings size={13} />
          </Link>
        )}
        <a
          href={`/api/workspaces/${workspace.id}/export`}
          download
          className={iconBtn}
          title={t("workspace.export")}
        >
          <Download size={13} />
        </a>
        {canEdit && (
          <button onClick={addPage} className={iconBtn} title={t("page.new")}>
            <Plus size={14} />
          </button>
        )}
      </SectionHeader>
      {pages.data && (
        <PageTree
          nodes={buildTree(pages.data)}
          all={pages.data}
          workspaceId={workspace.id}
          editable={canEdit}
        />
      )}
    </div>
  );
}

const FAVORITE_TYPE = "application/x-nootion-favorite";

/** Starred pages, in the user's order: rows are dragged to reorder, and a page dragged from a tree is starred where it lands. */
function FavoritesSection() {
  const favorites = useFavorites();
  const qc = useQueryClient();
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const pages = favorites.data ?? [];
  if (!pages.length) return null;

  async function unstar(id: string) {
    qc.setQueryData<PageSummary[]>(keys.favorites, (old) =>
      old?.filter((p) => p.id !== id),
    );
    await api(`/favorites/${id}`, { method: "DELETE" }).catch(() => {});
    await qc.invalidateQueries({ queryKey: keys.favorites });
  }

  async function onDrop(e: React.DragEvent, target: string) {
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > box.top + box.height / 2;
    setDrop(null);
    const moved =
      e.dataTransfer.getData(FAVORITE_TYPE) ||
      e.dataTransfer.getData(DRAG_TYPE);
    if (!moved || moved === target) return;
    try {
      if (!pages.some((p) => p.id === moved))
        await api(`/favorites/${moved}`, { method: "PUT" });
      const ids = pages.map((p) => p.id).filter((id) => id !== moved);
      ids.splice(ids.indexOf(target) + (after ? 1 : 0), 0, moved);
      const byId = new Map(pages.map((p) => [p.id, p]));
      qc.setQueryData<PageSummary[]>(keys.favorites, (old) =>
        old ? ids.flatMap((id) => byId.get(id) ?? []) : old,
      );
      await api("/favorites/order", { method: "POST", body: { pageIds: ids } });
    } catch {
      // Offline or no longer readable: the server's order comes back below.
    }
    await qc.invalidateQueries({ queryKey: keys.favorites });
  }

  return (
    <div>
      <SectionHeader icon={<Star size={12} />} label={t("favorites.title")} />
      {pages.map((page) => {
        const line =
          drop?.id === page.id
            ? drop.after
              ? "shadow-[inset_0_-2px_0_0] shadow-blue-500"
              : "shadow-[inset_0_2px_0_0] shadow-blue-500"
            : "";
        return (
          <div
            key={page.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(FAVORITE_TYPE, page.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (
                !e.dataTransfer.types.includes(FAVORITE_TYPE) &&
                !e.dataTransfer.types.includes(DRAG_TYPE)
              )
                return;
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              setDrop({
                id: page.id,
                after: e.clientY > box.top + box.height / 2,
              });
            }}
            onDragLeave={() => setDrop(null)}
            onDrop={(e) => onDrop(e, page.id)}
            className={`group flex items-center rounded-md pr-1 ${line}`}
            data-favorite={page.id}
          >
            <NavLink
              to={`/page/${page.id}`}
              className={({ isActive }) =>
                `flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 pl-2 pr-1 text-sm touch:py-2 ${isActive ? "bg-neutral-200/80 font-medium dark:bg-neutral-800" : "hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60"}`
              }
            >
              <span className="w-4 shrink-0 text-center">
                {pageIcon(page.icon) ??
                  (page.kind === "database" ? (
                    <Database size={14} className="inline text-neutral-400" />
                  ) : (
                    <FileText size={14} className="inline text-neutral-400" />
                  ))}
              </span>
              <span className="truncate">{pageTitle(page.title)}</span>
            </NavLink>
            <button
              className="hidden shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-200 group-hover:block touch:block dark:hover:bg-neutral-800"
              onClick={() => unstar(page.id)}
              title={t("favorites.remove")}
              aria-label={t("favorites.remove")}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SharedSection() {
  const shared = useSharedPages();
  if (!shared.data?.length) return null;
  return (
    <div>
      <SectionHeader icon={<Share2 size={12} />} label={t("sidebar.shared")} />
      <PageTree
        nodes={buildTree(shared.data)}
        all={shared.data}
        workspaceId=""
        editable={false}
      />
    </div>
  );
}

function CreateWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<unknown>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <Modal title={t("workspace.new")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const res = await api<{ workspace: WorkspaceSummary }>(
              "/workspaces",
              { method: "POST", body: { name } },
            );
            await qc.invalidateQueries({ queryKey: keys.workspaces });
            onClose();
            navigate(`/workspace/${res.workspace.id}`);
          } catch (err) {
            setError(err);
          }
        }}
      >
        <Field
          label={t("workspace.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("workspace.namePlaceholder")}
          required
          autoFocus
        />
        <p className="text-sm text-neutral-500">{t("workspace.newHelp")}</p>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <CancelButton onClose={onClose} />
          <Button type="submit">{t("common.create")}</Button>
        </div>
      </form>
    </Modal>
  );
}
