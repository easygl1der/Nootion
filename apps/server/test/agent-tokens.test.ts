import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema.js";
import { Client, makeApp, setupAdmin } from "./helpers.js";

// wrise fork (DEM-1532): the agent-token door gives a short-lived token of a person's own account, only with the key.
const KEY = "k".repeat(40);
let app: FastifyInstance;
afterEach(async () => {
  await app.close();
});

const door = (method: "POST" | "DELETE", url: string, payload?: unknown, key: string | null = KEY) =>
  app.inject({ method, url, payload: payload as object, headers: key ? { "x-nootion-agent-key": key } : {} });

describe("agent-token door", () => {
  it("does not exist without NOOTION_AGENT_KEY, and refuses a wrong or missing key", async () => {
    app = await makeApp();
    await setupAdmin(app);
    const me = (await new Client(app).get("/api/auth/me")).statusCode;
    expect(me).toBe(401);
    expect((await door("POST", "/api/agent-tokens", { subject: "boris", name: "x", minutes: 5 })).statusCode).toBe(404);
    await app.close();
    app = await makeApp(undefined, { NOOTION_AGENT_KEY: KEY });
    await setupAdmin(app);
    expect((await door("POST", "/api/agent-tokens", { subject: "boris", name: "x", minutes: 5 }, null)).statusCode).toBe(404);
    expect((await door("POST", "/api/agent-tokens", { subject: "boris", name: "x", minutes: 5 }, "k".repeat(39) + "x")).statusCode).toBe(404);
  });

  it("gives the person's own token: all their spaces, writable, at most an hour, shown in their list, revocable", async () => {
    app = await makeApp(undefined, { NOOTION_AGENT_KEY: KEY });
    const boris = await setupAdmin(app);
    const personal = await boris.personalWorkspace();
    const team = (await boris.post("/api/workspaces", { name: "Équipe" })).json().workspace.id;
    expect((await door("POST", "/api/agent-tokens", { subject: "boris", name: "x", minutes: 5 })).statusCode).toBe(404); // not linked to the sign-in yet
    app.db.update(users).set({ ssoSubject: "boris" }).where(eq(users.email, "boris@example.com")).run();
    expect((await door("POST", "/api/agent-tokens", { subject: "boris", name: "x", minutes: 61 })).statusCode).toBe(400);
    expect((await door("POST", "/api/agent-tokens", { subject: "nobody", name: "x", minutes: 5 })).statusCode).toBe(404);
    const t0 = Date.now();
    const res = await door("POST", "/api/agent-tokens", { subject: "boris", name: "Claude (chat)", minutes: 60 });
    expect(res.statusCode, res.body).toBe(200);
    const { token, apiToken } = res.json();
    expect(apiToken).toMatchObject({ name: "Claude (chat)", readOnly: false });
    expect([...apiToken.workspaceIds].sort()).toEqual([personal, team].sort());
    const exp = Date.parse(apiToken.expiresAt);
    expect(exp - t0).toBeGreaterThan(59 * 60_000);
    expect(exp - t0).toBeLessThanOrEqual(60 * 60_000 + 5_000);
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(me.json().user.email).toBe("boris@example.com");
    expect((await boris.get("/api/tokens")).json().tokens.map((x: { id: string }) => x.id)).toContain(apiToken.id);
    expect((await door("DELETE", `/api/agent-tokens/${apiToken.id}?subject=other`)).statusCode).toBe(404);
    expect((await door("DELETE", `/api/agent-tokens/${apiToken.id}?subject=boris`)).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });
});
