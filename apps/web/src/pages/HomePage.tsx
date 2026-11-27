import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { intlLocale, t, type RecentPage } from "@nootion/shared";
import { api } from "../lib/api";
import { useFavorites } from "../lib/queries";
import { pageTitle } from "../lib/tree";
import { PageGlyph, pageIcon } from "../lib/icons";
import { MenuButton } from "../components/SidebarLayout";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(intlLocale(), { day: "numeric", month: "short" });

/**
 * Home (DEM-2328, Yihua 2026-11-27: "a quiet list of recent pages, like Notion"): favourites when there are any, then the pages opened lately.
 * No greeting, no widgets; the old widget page of each account stays in its data and is simply not shown.
 */
export function HomePage() {
  const recent = useQuery({ queryKey: ["recent"], queryFn: async () => (await api<{ pages: RecentPage[] }>("/recent?limit=20")).pages, staleTime: 0 });
  const favorites = useFavorites();
  const starred = favorites.data ?? [];
  const pages = recent.data ?? [];
  return (
    <>
      <header className="flex items-center px-3 py-1.5 text-sm md:px-4 md:py-2">
        <MenuButton />
        <span className="px-1 text-neutral-800">{t("home.title")}</span>
      </header>
      <div className="mx-auto max-w-2xl px-5 pt-10 pb-24 sm:px-8 sm:pt-16" data-home>
        {starred.length > 0 && (
          <Section title={t("favorites.title")}>
            {starred.map((p) => (
              <Row key={p.id} id={p.id} title={p.title} icon={p.icon} kind={p.kind} />
            ))}
          </Section>
        )}
        <Section title={t("widget.recent")}>
          {recent.data && pages.length === 0 && <p className="px-2 py-1.5 text-sm text-neutral-400">{t("widget.recentEmpty")}</p>}
          {pages.map((p) => (
            <Row key={p.id} id={p.id} title={p.title} icon={p.icon} kind={p.kind} date={shortDate(p.visitedAt)} />
          ))}
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 px-2 text-xs font-medium text-neutral-500">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function Row({ id, title, icon, kind, date }: { id: string; title: string; icon: string | null; kind: string; date?: string }) {
  return (
    <Link to={`/page/${id}`} data-recent={id} className="flex min-h-9 min-w-0 items-center gap-2 rounded-md px-2 text-[15px] text-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800/60">
      <span className="flex size-5 shrink-0 items-center justify-center">{pageIcon(icon) ?? <PageGlyph kind={kind} size={16} />}</span>
      <span className="truncate">{pageTitle(title)}</span>
      {date && <span className="ml-auto shrink-0 pl-3 text-xs text-neutral-400 tabular-nums">{date}</span>}
    </Link>
  );
}
