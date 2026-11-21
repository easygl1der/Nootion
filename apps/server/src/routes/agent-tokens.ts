import type { FastifyPluginAsync } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notFound, parseBody } from "../http.js";
import { users, workspaceMembers } from "../db/schema.js";
import { createApiToken, deleteApiToken } from "../api-tokens.js";

/**
 * wrise fork (DEM-1532, Yihua 2026-11-21: Claude in a person's chat uses Notes as that person, reading and writing). The host that runs Claude
 * for a person (the DGX's chat-space broker) asks here, with the door's key, for a token of that person's own account, found by the subject
 * the company sign-in gave it (the portal's user id, `users.sso_subject`): every space they belong
 * to, their own roles there, at most an hour. What it changes shows in their own API-token activity under the token's name. Without the key,
 * or with no NOOTION_AGENT_KEY set, every path here is a plain 404. Never called by a browser.
 */
const issueInput = z.object({
  subject: z.string().regex(/^[A-Za-z0-9_.@-]{1,64}$/),
  name: z.string().trim().min(1).max(100),
  minutes: z.number().int().min(1).max(60),
});

export const agentTokenRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const key = app.config.agentKey ? Buffer.from(app.config.agentKey) : null;
  const allowed = (h: unknown) => {
    if (!key || typeof h !== "string") return false;
    const got = Buffer.from(h);
    return got.length === key.length && timingSafeEqual(got, key);
  };
  app.addHook("onRequest", async (req) => {
    if (!allowed(req.headers["x-nootion-agent-key"])) throw notFound();
  });
  const person = (subject: string) => {
    const user = subject ? db.select().from(users).where(eq(users.ssoSubject, subject)).get() : undefined;
    return user && !user.disabled ? user : null;
  };

  app.post("/", async (req) => {
    const { subject, name, minutes } = parseBody(issueInput, req.body);
    const user = person(subject);
    if (!user) throw notFound();
    const workspaceIds = db.select({ id: workspaceMembers.workspaceId }).from(workspaceMembers).where(eq(workspaceMembers.userId, user.id)).all().map((r) => r.id);
    if (!workspaceIds.length) throw notFound();
    return createApiToken(db, user.id, { name, workspaceIds, readOnly: false, expiresInDays: null }, new Date(Date.now() + minutes * 60_000));
  });

  // The space is gone before its hour: its token goes too.
  app.delete<{ Params: { id: string }; Querystring: { subject?: string } }>("/:id", async (req) => {
    const user = person(String(req.query.subject ?? ""));
    if (!user || !deleteApiToken(db, user.id, req.params.id)) throw notFound();
    return { ok: true };
  });
};
