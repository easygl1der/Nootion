import type { ReactNode } from "react";
import { Database, FileText } from "lucide-react";
import { customIconId, customIconUrl } from "@nootion/shared";

/** The icon of a page without one of its own: a drawn glyph, never an emoji (DEM-2328). */
export function PageGlyph({ kind, size = 15, className = "" }: { kind?: string; size?: number; className?: string }) {
  const Icon = kind === "database" ? Database : FileText;
  return <Icon size={size} aria-hidden className={`inline shrink-0 text-neutral-400 ${className}`} />;
}

/**
 * A page icon to show: the emoji, or the uploaded image, as big as the text around it. Null without an icon, so that
 * `pageIcon(p.icon) ?? fallback` works.
 */
export function pageIcon(icon: string | null | undefined): ReactNode {
  if (!icon) return null;
  const id = customIconId(icon);
  if (!id) return icon;
  return (
    <img
      src={customIconUrl(id)}
      alt=""
      draggable={false}
      // A deleted icon shows nothing rather than a broken image.
      onError={(e) => (e.currentTarget.style.display = "none")}
      className="inline-block h-[1em] w-[1em] rounded-[3px] object-contain align-[-0.125em]"
    />
  );
}
