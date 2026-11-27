import { useState, type DragEvent } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Folder, MoreHorizontal, Plus } from "lucide-react";
import type { PageSummary } from "@nootion/shared";
import { api } from "../lib/api";
import { useRefreshPages } from "../lib/queries";
import { pageTitle, type TreeNode } from "../lib/tree";
import { t } from "@nootion/shared";
import { PageMenu, type MenuAnchor } from "./PageMenu";
import { PageGlyph, pageIcon } from "../lib/icons";
import { Tip } from "./ui";

export const DRAG_TYPE = "application/x-nootion-page";

type DropZone = "before" | "inside" | "after";

interface TreeProps {
  nodes: TreeNode[];
  workspaceId: string;
  /** False for read-only trees (no add, trash or drag). */
  editable: boolean;
  /** Pages of the whole tree, used to forbid dropping a page into its own subtree. */
  all: PageSummary[];
}

/** Titles written "Group · Name" (the 20 "Payments · <insurer>" databases): five or more roots with one prefix fold under a folder (DEM-2328). */
const GROUP_MIN = 5;
const SEP = " · ";
type Entry = { node: TreeNode; label?: string } | { group: string; items: { node: TreeNode; label: string }[] };
export function groupRoots(nodes: TreeNode[]): Entry[] {
  const prefix = (n: TreeNode) => (n.page.title.includes(SEP) ? n.page.title.split(SEP)[0]!.trim() : "");
  const counts = new Map<string, number>();
  for (const n of nodes) { const p = prefix(n); if (p) counts.set(p, (counts.get(p) ?? 0) + 1); }
  const out: Entry[] = [];
  const made = new Map<string, Extract<Entry, { group: string }>>();
  for (const n of nodes) {
    const p = prefix(n);
    if (!p || (counts.get(p) ?? 0) < GROUP_MIN) { out.push({ node: n }); continue; }
    let g = made.get(p);
    if (!g) { g = { group: p, items: [] }; made.set(p, g); out.push(g); }
    g.items.push({ node: n, label: n.page.title.slice(p.length + SEP.length).trim() || pageTitle(n.page.title) });
  }
  for (const g of made.values()) g.items.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return out;
}

export function PageTree(props: TreeProps) {
  if (props.nodes.length === 0) return <p className="px-2 py-1 text-xs text-neutral-400">{t("tree.empty")}</p>;
  return (
    <ul>
      {groupRoots(props.nodes).map((e) =>
        "group" in e ? (
          <GroupFolder key={`g:${e.group}`} group={e} {...props} />
        ) : (
          <PageTreeItem key={e.node.page.id} node={e.node} depth={0} {...props} />
        ),
      )}
    </ul>
  );
}

/** A folder made of titles, not a page: it only folds, and opens by itself when the open page is inside. */
function GroupFolder({ group, ...props }: { group: Extract<Entry, { group: string }> } & TreeProps) {
  const { pathname } = useLocation();
  const inside = group.items.some((i) => pathname.endsWith(`/page/${i.node.page.id}`));
  const [open, setOpen] = useState(false);
  const shown = open || inside;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(!shown)}
        aria-expanded={shown}
        data-group={group.group}
        className="group flex h-7 w-full items-center gap-1 rounded-md pr-2 pl-1 text-left text-sm text-(color:--sidebar-foreground) outline-none hover:bg-(--sidebar-accent) focus-visible:ring-2 focus-visible:ring-(--sidebar-ring) touch:h-9"
      >
        <span className="flex size-6 shrink-0 items-center justify-center text-neutral-400">
          <Folder size={15} aria-hidden className="group-hover:hidden touch:hidden" />
          <ChevronRight size={14} aria-hidden className={`hidden transition-transform duration-150 group-hover:block touch:block motion-reduce:transition-none ${shown ? "rotate-90" : ""}`} />
        </span>
        <span className="truncate">{group.group}</span>
        <span className="ml-auto text-xs text-neutral-400 tabular-nums">{group.items.length}</span>
      </button>
      {shown && (
        <ul>
          {group.items.map((i) => (
            <PageTreeItem key={i.node.page.id} node={i.node} label={i.label} depth={1} {...props} />
          ))}
        </ul>
      )}
    </li>
  );
}

function isInside(all: PageSummary[], pageId: string, ancestorId: string): boolean {
  const byId = new Map(all.map((p) => [p.id, p]));
  let cur = byId.get(pageId);
  while (cur) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

function PageTreeItem({ node, depth, label, workspaceId, editable, all }: TreeProps & { node: TreeNode; depth: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const [drop, setDrop] = useState<DropZone | null>(null);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [renaming, setRenaming] = useState(false);
  const navigate = useNavigate();
  const refresh = useRefreshPages();
  const { page, children } = node;

  async function addChild() {
    const res = await api<{ page: PageSummary }>("/pages", { method: "POST", body: { workspaceId, parentId: page.id, title: "" } });
    setOpen(true);
    await refresh();
    navigate(`/page/${res.page.id}`);
  }

  async function rename(title: string) {
    setRenaming(false);
    if (title === page.title) return;
    await api(`/pages/${page.id}`, { method: "PATCH", body: { title } }).catch((err) => alert(err.message));
    await refresh();
  }

  function zoneFor(e: DragEvent<HTMLElement>): DropZone {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
  }

  async function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    const zone = zoneFor(e);
    setDrop(null);
    const draggedId = e.dataTransfer.getData(DRAG_TYPE);
    if (!draggedId || draggedId === page.id || isInside(all, page.id, draggedId)) return;
    let body: { parentId: string | null; index?: number };
    if (zone === "inside") {
      body = { parentId: page.id };
      setOpen(true);
    } else {
      const siblings = all
        .filter((p) => p.parentId === page.parentId && p.id !== draggedId)
        .sort((a, b) => a.position - b.position);
      const idx = siblings.findIndex((p) => p.id === page.id);
      body = { parentId: page.parentId, index: zone === "before" ? idx : idx + 1 };
    }
    await api(`/pages/${draggedId}/move`, { method: "POST", body }).catch((err) => alert(err.message));
    await refresh();
  }

  const dropStyle =
    drop === "inside" ? "bg-blue-100 dark:bg-blue-950" : drop === "before" ? "shadow-[inset_0_2px_0_#3b82f6]" : drop === "after" ? "shadow-[inset_0_-2px_0_#3b82f6]" : "";
  const glyph = pageIcon(page.icon) ?? <PageGlyph kind={page.kind} size={15} />;

  return (
    <li>
      <div
        className={`group flex items-center rounded-md pr-1 ${dropStyle}`}
        style={{ paddingLeft: depth * 12 }}
        draggable={editable}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, page.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!editable || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setDrop(zoneFor(e));
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {/* The icon slot: the page's icon; on hover (always on touch) a page with subpages shows its chevron instead, as Notion does. */}
        {children.length > 0 ? (
          <button
            className="group/chev flex size-6 shrink-0 items-center justify-center rounded text-neutral-400 outline-none hover:bg-(--sidebar-selected) focus-visible:ring-2 focus-visible:ring-(--sidebar-ring) touch:size-8"
            onClick={() => setOpen(!open)}
            aria-label={open ? t("tree.collapse") : t("tree.expand")}
            aria-expanded={open}
          >
            <span className="flex group-hover:hidden group-focus-within:hidden touch:hidden">{glyph}</span>
            <ChevronRight size={14} aria-hidden className={`hidden transition-transform duration-150 group-hover:block group-focus-within:block touch:block motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center touch:size-8">{glyph}</span>
        )}
        {renaming ? (
          <input
            autoFocus
            defaultValue={page.title}
            aria-label={t("common.rename")}
            className="min-w-0 flex-1 rounded border border-blue-500 bg-white px-1 py-0.5 text-sm outline-none dark:bg-neutral-900"
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => void rename(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
        <NavLink
          to={`/page/${page.id}`}
          className={({ isActive }) =>
            `flex min-w-0 flex-1 items-center rounded-md py-1 pr-1 pl-1 text-sm text-(color:--sidebar-foreground) touch:py-2 ${isActive ? "" : "hover:bg-(--sidebar-accent)"}`
          }
        >
          <span className="truncate">{label ?? pageTitle(page.title)}</span>
        </NavLink>
        )}
        <span className={`shrink-0 items-center gap-0.5 pl-0.5 group-hover:flex group-focus-within:flex touch:flex ${menu ? "flex" : "hidden"}`}>
          <Tip label={t("page.options")}>
            <button
              type="button"
              className="wrise-row-action flex"
              onClick={(e) => setMenu(menu ? null : e.currentTarget)}
              aria-label={t("page.options")}
              aria-haspopup="menu"
              aria-expanded={!!menu}
            >
              <MoreHorizontal size={16} />
            </button>
          </Tip>
          {editable && (
            <Tip label={t("tree.addSubpage")}>
              <button type="button" className="wrise-row-action flex" onClick={addChild} aria-label={t("tree.addSubpage")}>
                <Plus size={16} />
              </button>
            </Tip>
          )}
        </span>
      </div>
      {menu && <PageMenu page={page} all={all} anchor={menu} editable={editable} onClose={() => setMenu(null)} onRename={() => setRenaming(true)} />}
      {open && children.length > 0 && (
        <ul>
          {children.map((c) => (
            <PageTreeItem key={c.page.id} node={c} depth={depth + 1} workspaceId={workspaceId} editable={editable} all={all} nodes={[]} />
          ))}
        </ul>
      )}
    </li>
  );
}
