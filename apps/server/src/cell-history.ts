import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import type { CellChange, CellValue, DatabaseProperty } from "@nootion/shared";
import type { FastifyRequest } from "fastify";
import type { DbLike } from "./db/index.js";
import { cellChanges, pages, users } from "./db/schema.js";
import { currentTokenScope } from "./api-tokens.js";
import { fromAutomation } from "./automations.js";

/** The property id the history uses for a row's title. */
export const TITLE = "title";

/** Who made a change besides the user: "automation" for an automation step, else the API token's name. */
export const changeAgent = (req: FastifyRequest): string | null => (fromAutomation(req) ? "automation" : (currentTokenScope()?.name ?? null));

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Writes one entry per changed value (unchanged ones are skipped); call it in the transaction that writes the cells. */
export function recordCellChanges(
  db: DbLike,
  ctx: { databaseId: string; rowId: string; userId: string; agent?: string | null; restoredFrom?: string },
  entries: { propertyId: string; before: unknown; after: unknown }[],
) {
  for (const e of entries) {
    if (same(e.before, e.after)) continue;
    db.insert(cellChanges)
      .values({
        id: randomUUID(),
        databaseId: ctx.databaseId,
        rowId: ctx.rowId,
        propertyId: e.propertyId,
        before: e.before ?? null,
        after: e.after ?? null,
        userId: ctx.userId,
        agent: ctx.agent ?? null,
        restoredFrom: ctx.restoredFrom ?? null,
      })
      .run();
  }
}

/** A value as plain text: select options by name, lists joined, dates as written. */
export function cellText(value: unknown, prop: DatabaseProperty | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const name = (id: unknown) => prop?.config.options?.find((o) => o.id === id)?.name ?? String(id);
  if (prop?.type === "select") return name(value);
  if (Array.isArray(value)) return value.map((v) => (prop?.type === "multi_select" ? name(v) : typeof v === "object" && v && "name" in v ? String((v as { name: unknown }).name) : String(v))).join(", ");
  if (typeof value === "object") {
    const d = value as { start?: string; end?: string | null };
    return d.start ? (d.end ? `${d.start} → ${d.end}` : d.start) : JSON.stringify(value);
  }
  return String(value);
}

export function listCellChanges(
  db: DbLike,
  databaseId: string,
  properties: DatabaseProperty[],
  opts: { rowId?: string; since?: number; limit?: number },
): CellChange[] {
  const rows = db
    .select({ c: cellChanges, userName: users.name, rowTitle: pages.title })
    .from(cellChanges)
    .leftJoin(users, eq(users.id, cellChanges.userId))
    .innerJoin(pages, eq(pages.id, cellChanges.rowId))
    .where(
      and(
        eq(cellChanges.databaseId, databaseId),
        opts.rowId ? eq(cellChanges.rowId, opts.rowId) : undefined,
        opts.since ? gte(cellChanges.createdAt, new Date(opts.since)) : undefined,
      ),
    )
    .orderBy(desc(cellChanges.createdAt), desc(cellChanges.id))
    .limit(Math.min(Math.max(opts.limit ?? 200, 1), 1000))
    .all();
  const byId = new Map(properties.map((p) => [p.id, p]));
  const title = properties.find((p) => p.type === "title");
  return rows.map(({ c, userName, rowTitle }) => {
    const prop = c.propertyId === TITLE ? title : byId.get(c.propertyId);
    return {
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      user: c.userId && userName ? { id: c.userId, name: userName } : null,
      agent: c.agent,
      rowId: c.rowId,
      rowTitle,
      propertyId: c.propertyId,
      propertyName: c.propertyId === TITLE ? (title?.name ?? "title") : (prop?.name ?? null),
      before: c.before as CellValue,
      after: c.after as CellValue,
      beforeText: cellText(c.before, prop),
      afterText: cellText(c.after, prop),
      restoredFrom: c.restoredFrom,
    };
  });
}
