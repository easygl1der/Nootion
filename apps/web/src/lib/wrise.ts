// wrise fork (DEM-1392): Notes is a tab of the Wrise portal (wriseai.com/notes), so its sidebar shows the portal's account, version and Settings.
// The portal is on the same origin, outside the /notes prefix: URLs here are URL objects or carry data-no-base, which installBase leaves alone.
import { useQuery } from "@tanstack/react-query";

export interface WriseMe { userId: string; displayName: string; role: string; version?: string }

/** The signed-in Wrise account (the portal's /agent/api/me); null without a portal (a plain Nootion build, the PC048 check without a stub). */
export function useWriseMe(): WriseMe | null {
  return useQuery({
    queryKey: ["wrise-me"],
    queryFn: async () => {
      const r = await fetch(new URL("/agent/api/me", window.location.origin), { credentials: "same-origin", cache: "no-store" });
      const body = r.ok ? ((await r.json()) as Partial<WriseMe>) : null;
      return body && typeof body.displayName === "string" && typeof body.role === "string"
        ? { userId: body.userId || body.displayName, displayName: body.displayName, role: body.role, version: body.version }
        : null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  }).data ?? null;
}

// The portal's English role names (apps/portal/lib/i18n/messages/en.ts role.*); others are written from the slug as the portal does.
const ROLES: Record<string, string> = { rm: "RM", admin: "Project 1 Admin", cross_admin: "Admin", super_admin: "Super Admin" };
export const writeRole = (role: string) => ROLES[role] ?? role.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** The portal's face for an account: its own upload or Microsoft photo; a 404 falls back to initials. */
export const writeAvatar = (userId: string) => `/api/portal/avatar?u=${encodeURIComponent(userId)}`;

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
  try { window.sessionStorage.clear(); } catch { /* storage blocked */ }
  window.location.replace(new URL(answer?.redirectTo ?? "/login", window.location.origin));
}
