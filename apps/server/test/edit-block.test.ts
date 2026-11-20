import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { pages } from "../src/db/schema.js";
import { Client, inviteUser, makeApp, setupAdmin } from "./helpers.js";

let app: FastifyInstance;
let boris: Client;
let agent: Client;
let ws: string;
let page: string;

beforeEach(async () => {
  app = await makeApp();
  boris = await setupAdmin(app);
  ws = await boris.personalWorkspace();
  const token = (await boris.post("/api/tokens", { name: "Claude", workspaceIds: [ws], readOnly: false, expiresInDays: null })).json().token;
  agent = new (class extends Client {
    request(m: string, u: string, b?: unknown, h: Record<string, string> = {}) {
      return super.request(m, u, b, { authorization: `Bearer ${token}`, ...h });
    }
  })(app);
  page = await boris.createPage(ws, "Notes");
  await boris.put(`/api/pages/${page}/content`, { markdown: "# Titre\n\nPremier paragraphe.\n\nSecond paragraphe.\n\nDernier." });
});

afterEach(async () => {
  await app.close();
});

const blocks = async () => (await boris.get(`/api/pages/${page}/content`)).json().content.content as { type: string }[];
const stateDoc = () => {
  const y = new Y.Doc();
  Y.applyUpdate(y, new Uint8Array(app.db.select({ s: pages.contentState }).from(pages).where(eq(pages.id, page)).get()!.s!));
  return y;
};
/** A comment-style anchor inside the "Second paragraphe." block, resolved to the text after it. */
const anchor = (y: Y.Doc) => {
  const el = y.getXmlFragment("default").get(2) as Y.XmlElement;
  return Y.createRelativePositionFromTypeIndex(el.get(0) as Y.XmlText, 3);
};
const resolves = (y: Y.Doc, rel: Y.RelativePosition) => Y.createAbsolutePositionFromRelativePosition(rel, y) !== null;

describe("PATCH /api/pages/:id/blocks", () => {
  it("changes only the matched block", async () => {
    const before = await blocks();
    const res = await agent.patch(`/api/pages/${page}/blocks`, { match: "  Premier   paragraphe. ", markdown: "Premier, **réécrit**." });
    expect(res.json()).toEqual({ ok: true, index: 1 });
    const after = await blocks();
    expect(after).toHaveLength(before.length);
    expect(after.filter((_, i) => i !== 1)).toEqual(before.filter((_, i) => i !== 1));
    expect((await boris.get(`/api/pages/${page}/content`)).json().markdown).toContain("Premier, **réécrit**.");
    // One block can become several.
    await agent.patch(`/api/pages/${page}/blocks`, { match: "Dernier.", markdown: "A\n\nB" });
    expect(await blocks()).toHaveLength(before.length + 1);
  });

  it("keeps an anchor in another block, where a PUT loses it", async () => {
    const y = stateDoc();
    const rel = anchor(y);
    await agent.patch(`/api/pages/${page}/blocks`, { match: "Premier paragraphe.", markdown: "Autre." });
    Y.applyUpdate(y, Y.encodeStateAsUpdate(stateDoc()));
    expect(resolves(y, rel)).toBe(true);
    expect(Y.createAbsolutePositionFromRelativePosition(rel, y)!.index).toBe(3);

    const y2 = stateDoc();
    const rel2 = anchor(y2);
    await boris.put(`/api/pages/${page}/content`, { markdown: "Tout neuf" });
    const fresh = stateDoc();
    expect(resolves(fresh, rel2)).toBe(false);
  });

  it("records an agent version marked with the token name", async () => {
    await agent.patch(`/api/pages/${page}/blocks`, { match: "Dernier.", markdown: "Fin." });
    const versions = (await boris.get(`/api/pages/${page}/history`)).json().versions;
    expect(versions[0]).toMatchObject({ agent: "Claude" });
    const activity = (await boris.get("/api/tokens/activity")).json().activity;
    expect(activity[0]).toMatchObject({ action: "content.editBlock", pageId: page });
  });

  it("answers 409 when no block, or more than one, has the text", async () => {
    const none = await agent.patch(`/api/pages/${page}/blocks`, { match: "Absent", markdown: "x" });
    expect(none.statusCode).toBe(409);
    expect(none.json().error).toBe("no_match");
    await boris.post(`/api/pages/${page}/content`, { markdown: "Dernier." });
    const two = await agent.patch(`/api/pages/${page}/blocks`, { match: "Dernier.", markdown: "x" });
    expect(two.statusCode).toBe(409);
    expect(two.json()).toMatchObject({ error: "ambiguous", count: 2 });
  });

  it("refuses viewers (404, like every edit) and databases", async () => {
    const alice = await inviteUser(app, boris, { name: "Alice", email: "alice@example.com", password: "correct horse battery" });
    const shared = await boris.createPage(ws, "Partagée");
    expect((await boris.put(`/api/pages/${shared}/shares`, { userId: await alice.id(), role: "viewer" })).statusCode).toBe(200);
    expect((await alice.patch(`/api/pages/${shared}/blocks`, { match: "Dernier.", markdown: "x" })).statusCode).toBe(404);
    const database = (await boris.post("/api/databases", { workspaceId: ws, parentId: null, title: "Suivi" })).json().database.id;
    expect((await boris.patch(`/api/pages/${database}/blocks`, { match: "x", markdown: "y" })).statusCode).toBe(400);
  });
});
