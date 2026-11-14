// wrise fork (DEM-1392): Notes is a tab of the Wrise portal (wriseai.com/notes), so its sidebar shows the portal's account, version and Settings.
// The portal is on the same origin, outside the /notes prefix: URLs here are URL objects or carry data-no-base, which installBase leaves alone.
import { useQuery } from "@tanstack/react-query";

export interface WriseMe { userId: string; displayName: string; role: string; version?: string; tabs?: string[]; portrait?: string }

// The last answer, kept in this browser so the first paint already shows the portal's account and version, not Notes' own for a moment (DEM-1445).
const ME_KEY = "wrise.notes.me";
function lastMe(): WriseMe | undefined {
  try { return JSON.parse(localStorage.getItem(ME_KEY) ?? "null") ?? undefined; } catch { return undefined; }
}

/** The signed-in Wrise account (the portal's /agent/api/me); null without a portal (a plain Nootion build, the PC048 check without a stub). */
export function useWriseMe(): WriseMe | null {
  return useQuery({
    initialData: lastMe,
    initialDataUpdatedAt: 0, // shown at once, asked again at once
    queryKey: ["wrise-me"],
    queryFn: async () => {
      const r = await fetch(new URL("/agent/api/me", window.location.origin), { credentials: "same-origin", cache: "no-store" });
      const body = r.ok ? ((await r.json()) as Partial<WriseMe>) : null;
      const me: WriseMe | null = body && typeof body.displayName === "string" && typeof body.role === "string"
        ? { userId: body.userId || body.displayName, displayName: body.displayName, role: body.role, version: body.version, tabs: Array.isArray(body.tabs) ? body.tabs : undefined, portrait: typeof body.portrait === "string" && body.portrait.startsWith("/") ? body.portrait : undefined }
        : null;
      // kept for the next first paint; dropped when there is no portal account (signed out, or a plain Nootion)
      try { if (me) localStorage.setItem(ME_KEY, JSON.stringify(me)); else localStorage.removeItem(ME_KEY); } catch { /* storage blocked */ }
      return me;
    },
    staleTime: 5 * 60_000,
    retry: false,
  }).data ?? null;
}

// The portal's English role names (apps/portal/lib/i18n/messages/en.ts role.*); others are written from the slug as the portal does.
const ROLES: Record<string, string> = { rm: "RM", admin: "Project 1 Admin", cross_admin: "Admin", super_admin: "Super Admin" };
export const writeRole = (role: string) => ROLES[role] ?? role.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** The portal's faces for an account, in its order (components/user-avatar-image.tsx): own upload or Microsoft photo, then the bundled portrait; initials last (DEM-1445). */
export const writeAvatars = (me: WriseMe) => [`/api/portal/avatar?u=${encodeURIComponent(me.userId)}`, ...(me.portrait ? [me.portrait] : [])];

// DEM-1445: Notes and the portal are one frame. The sidebar's width and its open/folded state are the portal's own (same origin):
// width = the portal pref `sidebarWidth` (lib/ui-prefs.ts: localStorage `wrise.pref.sidebarWidth`, the account copy at /agent/api/prefs, and the
// `sidebar_width` cookie its server reads for the first paint); open = the portal's `sidebar_state` cookie (components/ui/sidebar.tsx).
export const PORTAL_WIDTH = { min: 208, max: 400, initial: 288 }; // apps/portal/components/portal-frame.tsx SIDEBAR_MIN / MAX / DEFAULT
const WIDTH_PREF = "wrise.pref.sidebarWidth";
const cookie = (name: string) => document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.slice(name.length + 1);
export function readPortalWidth(): number | null {
  try {
    const w = Number(JSON.parse(localStorage.getItem(WIDTH_PREF) ?? "null") ?? cookie("sidebar_width"));
    return w > 0 ? w : null;
  } catch {
    return null;
  }
}
export function savePortalWidth(w: number) {
  try { localStorage.setItem(WIDTH_PREF, JSON.stringify(w)); } catch { /* storage blocked: the account copy still holds */ }
  document.cookie = `sidebar_width=${w}; path=/; max-age=31536000; samesite=lax`;
  void fetch(new URL("/agent/api/prefs", window.location.origin), { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ sidebarWidth: w }) }).catch(() => {});
}
/** The portal's fold state: true = folded to icons; null when the portal never set it. */
export function readPortalFolded(): boolean | null {
  const v = cookie("sidebar_state");
  return v === "false" ? true : v === "true" ? false : null;
}
export function savePortalFolded(folded: boolean) {
  document.cookie = `sidebar_state=${!folded}; path=/; max-age=604800`; // same name, path and age as the portal's SIDEBAR_COOKIE_*
}

/** The portal's Settings dialog, opened on `section`, closing back to this Notes page. */
export function writeSettings(section?: string) {
  const q = new URLSearchParams();
  if (section) q.set("section", section);
  q.set("back", window.location.pathname + window.location.search);
  window.location.assign(new URL(`/settings?${q}`, window.location.origin));
}

/** Log out of the portal too (its cookies), then its login page; Notes' own session is ended by the caller first. */
export async function writeLogout() {
  const answer = await fetch(new URL("/api/portal/logout", window.location.origin), { method: "POST", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<{ redirectTo?: string }>) : null))
    .catch(() => null);
  try { window.sessionStorage.clear(); localStorage.removeItem(ME_KEY); } catch { /* storage blocked */ }
  window.location.replace(new URL(answer?.redirectTo ?? "/login", window.location.origin));
}
