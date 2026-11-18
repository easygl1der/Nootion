import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { CellChange, DatabaseData, DatabaseProperty } from "@nootion/shared";
import { Client, inviteUser, makeApp, setupAdmin } from "./helpers.js";

let app: FastifyInstance;
let boris: Client;
let alice: Client;
let db: DatabaseData;
let title: DatabaseProperty;
let amount: DatabaseProperty;
let row: string;

beforeEach(async () => {
  app = await makeApp();
  boris = await setupAdmin(app);
  alice = await inviteUser(app, boris, { name: "Alice", email: "alice@example.com", password: "alice-password" });
  db = (await boris.post("/api/databases", { workspaceId: await boris.personalWorkspace(), parentId: null, title: "Invoices" })).json().database;
  title = db.properties[0];
  amount = (await boris.post(`/api/databases/${db.id}/properties`, { name: "Amount", type: "number", config: {} })).json().property;
  row = (await boris.post(`/api/databases/${db.id}/rows`, { values: { [title.id]: "EDF", [amount.id]: 10 } })).json().row.id;
});

const patch = (c: Client, values: Record<string, unknown>) => c.patch(`/api/databases/${db.id}/rows/${row}`, { values });
const history = async (c: Client = boris): Promise<CellChange[]> => (await c.get(`/api/databases/${db.id}/rows/${row}/history`)).json().changes;

describe("cell history", () => {
  it("records one entry per changed cell, skips unchanged values, counts the title", async () => {
    expect((await patch(boris, { [amount.id]: 10 })).statusCode).toBe(200);
    expect(await history()).toHaveLength(0);
    expect((await patch(boris, { [amount.id]: 25, [title.id]: "EDF Oct" })).statusCode).toBe(200);
    const changes = await history();
    expect(changes).toHaveLength(2);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyId: amount.id, propertyName: "Amount", before: 10, after: 25, user: expect.objectContaining({ name: expect.any(String) }) }),
        expect.objectContaining({ propertyId: "title", propertyName: title.name, before: "EDF", after: "EDF Oct" }),
      ]),
    );
    // A title typed on the page itself counts too.
    await boris.patch(`/api/pages/${row}`, { title: "EDF Nov" });
    expect((await history())[0]).toMatchObject({ propertyId: "title", before: "EDF Oct", after: "EDF Nov" });
    const all = (await boris.get(`/api/databases/${db.id}/history?since=0&limit=10`)).json().changes;
    expect(all).toHaveLength(3);
  });

  it("lets a viewer read the history but not restore", async () => {
    await patch(boris, { [amount.id]: 25 });
    await boris.put(`/api/pages/${db.id}/shares`, { userId: await alice.id(), role: "viewer" });
    const changes = await history(alice);
    expect(changes).toHaveLength(1);
    const res = await alice.post(`/api/databases/${db.id}/rows/${row}/history/${changes[0].id}/restore`, {});
    expect(res.statusCode).toBe(403);
  });

  it("restores the old value and logs it with restoredFrom", async () => {
    await patch(boris, { [amount.id]: 25 });
    const [change] = await history();
    const res = await boris.post(`/api/databases/${db.id}/rows/${row}/history/${change.id}/restore`, {});
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().row.values[amount.id]).toBe(10);
    expect((await history())[0]).toMatchObject({ propertyId: amount.id, before: 25, after: 10, restoredFrom: change.id });
  });

  it("restores a title", async () => {
    await patch(boris, { [title.id]: "Other" });
    const [change] = await history();
    expect((await boris.post(`/api/databases/${db.id}/rows/${row}/history/${change.id}/restore`, {})).json().row.title).toBe("EDF");
  });

  it("answers 409 when the column was deleted", async () => {
    await patch(boris, { [amount.id]: 25 });
    const [change] = await history();
    expect((await boris.delete(`/api/databases/${db.id}/properties/${amount.id}`)).statusCode).toBe(200);
    const res = await boris.post(`/api/databases/${db.id}/rows/${row}/history/${change.id}/restore`, {});
    expect(res.statusCode).toBe(409);
  });
});
