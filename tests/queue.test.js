import { test } from "node:test";
import assert from "node:assert/strict";

import { createMemoryStore, blobToStored, storedToBlob } from "../app/store.js";
import { createPersistentQueue } from "../app/queue.js";

test("cola persistente: enqueue/list ordenados, count, update, remove", async () => {
  const q = createPersistentQueue(createMemoryStore());
  const a = await q.enqueue({ kind: "doc", entity: "session", doc: { id: "s1" } });
  const b = await q.enqueue({ kind: "doc", entity: "session", doc: { id: "s2" } });
  assert.equal(await q.count(), 2);
  assert.ok(a.qid.startsWith("q-"));
  assert.equal(a.attempts, 0);

  const list = await q.list();
  assert.deepEqual(list.map((i) => i.doc.id), ["s1", "s2"]);

  await q.update(b.qid, { last_error: "x" });
  assert.equal((await q.list())[1].last_error, "x");

  await q.remove(a.qid);
  assert.equal(await q.count(), 1);
  assert.equal((await q.list())[0].doc.id, "s2");
});

test("cola persistente: fallo conserva el ítem con attempts+1 y last_error acotado", async () => {
  const q = createPersistentQueue(createMemoryStore());
  await q.enqueue({ kind: "doc", entity: "session", doc: { id: "s1" } });
  await q.enqueue({ kind: "doc", entity: "session", doc: { id: "s2" } });

  const res = await q.flush(async (item) => {
    if (item.doc.id === "s1") throw new Error("boom ".repeat(100));
  });
  assert.deepEqual(res, { synced: 1, failed: 1 });

  const left = await q.list();
  assert.equal(left.length, 1);
  assert.equal(left[0].doc.id, "s1");
  assert.equal(left[0].attempts, 1);
  assert.ok(left[0].last_error.length <= 300);
});

test("cola persistente sobrevive a 'recargar' (mismo store, otra instancia)", async () => {
  const store = createMemoryStore();
  await createPersistentQueue(store).enqueue({ kind: "doc", entity: "session", doc: { id: "s1" } });
  const q2 = createPersistentQueue(store); // simula recargar la página
  assert.equal(await q2.count(), 1);
});

test("ítem editado se sincroniza con su valor actualizado (EC-6)", async () => {
  const q = createPersistentQueue(createMemoryStore());
  await q.enqueue({ kind: "doc", entity: "transcript", doc: { id: "tr-1", text: "original" } });
  const [item] = await q.list();
  await q.update(item.qid, { doc: { ...item.doc, text: "corregido" } });

  const sent = [];
  const res = await q.flush(async (it) => sent.push(it));
  assert.equal(res.synced, 1);
  assert.equal(sent[0].doc.text, "corregido");
  assert.equal(await q.count(), 0);
});

test("ítem descartado no se sincroniza (EC-6)", async () => {
  const q = createPersistentQueue(createMemoryStore());
  await q.enqueue({ kind: "media", asset_id: "a-1", doc: { id: "m-1" } });
  await q.enqueue({ kind: "doc", entity: "session", doc: { id: "s-1" } });
  const [media] = await q.list();
  await q.remove(media.qid);

  const sent = [];
  const res = await q.flush(async (it) => sent.push(it));
  assert.equal(res.synced, 1);
  assert.equal(sent[0].entity, "session");
});

test("desverificación: el ítem guarda snapshot asset_before para revertir", async () => {
  const q = createPersistentQueue(createMemoryStore());
  const before = { id: "a-1", name: "MOT", attribute_verification: { p: "pending" } };
  await q.enqueue({ kind: "verify", asset_id: "a-1", payload: { op_id: "op-1" }, asset_before: before });
  const [item] = await q.list();
  assert.deepEqual(item.asset_before, before);
});

test("blob helpers: ida y vuelta {buffer,type}", async () => {
  const blob = new Blob(["hola"], { type: "text/plain" });
  const stored = await blobToStored(blob);
  assert.equal(stored.type, "text/plain");
  const back = storedToBlob(stored);
  assert.equal(back.type, "text/plain");
  assert.equal(await back.text(), "hola");
});
