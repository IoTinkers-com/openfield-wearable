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

// --- ADR-0027: agrupación por visita y borradores ---

import { sessionOf, summarize } from "../app/queue.js";

test("sessionOf resuelve la sesión según el tipo de ítem", () => {
  assert.equal(sessionOf({ kind: "media", doc: { session_id: "S1" } }), "S1");
  assert.equal(sessionOf({ kind: "audio", session_id: "S1" }), "S1");
  assert.equal(sessionOf({ kind: "session-end", session_id: "S1" }), "S1");
  assert.equal(sessionOf({ kind: "verify", payload: { session_id: "S1" } }), "S1");
  assert.equal(sessionOf({ kind: "doc", entity: "observation", doc: { session_id: "S1" } }), "S1");
  assert.equal(sessionOf({ kind: "doc", entity: "session", doc: { id: "S1" } }), "S1");
  assert.equal(sessionOf({ kind: "doc", entity: "device", doc: { id: "D1" } }), null);
  assert.equal(sessionOf({ kind: "doc", entity: "asset", doc: { id: "A1" } }), null);
});

test("summarize cuenta por visita, generales y borradores", () => {
  const items = [];
  for (let i = 0; i < 12; i++) items.push({ kind: "media", doc: { session_id: "S1" } });
  items.push({ kind: "audio", session_id: "S1" });
  items.push({ kind: "audio", session_id: "S1" });
  items.push({ kind: "doc", entity: "transcript", doc: { session_id: "S1" } });
  items.push({ kind: "verify", payload: { session_id: "S1" } });
  items.push({ kind: "doc", entity: "observation", doc: { session_id: "S1" } });
  items.push({ kind: "doc", entity: "observation", doc: { session_id: "S1" } });
  items.push({ kind: "media", doc: { session_id: "S2" } });
  items.push({ kind: "doc", entity: "device", doc: { id: "D1" } });
  items.push({ kind: "media", draft: true, doc: {} });
  items.push({ kind: "media", draft: true, doc: {} });
  items.push({ kind: "doc", entity: "observation", draft: true, doc: {} });

  const s = summarize(items);
  assert.deepEqual(s.sessions.S1, { media: 12, audio: 3, notes: 2, verify: 1, total: 18 });
  assert.equal(s.sessions.S2.media, 1);
  assert.equal(s.general, 1);
  assert.deepEqual(s.drafts, { total: 3, media: 2, audio: 0, notes: 1 });
});

test("flush y flushBySession no envían borradores", async () => {
  const q = createPersistentQueue(createMemoryStore());
  await q.enqueue({ kind: "media", draft: true, doc: { id: "m-draft" } });
  await q.enqueue({ kind: "doc", entity: "session", doc: { id: "S1" } });

  const sent = [];
  const res = await q.flush(async (it) => sent.push(it));
  assert.deepEqual(res, { synced: 1, failed: 0 });
  assert.deepEqual(sent.map((i) => i.doc.id), ["S1"]);
  assert.equal(await q.count(), 1); // el borrador sigue en la cola

  const sent2 = [];
  const res2 = await q.flushBySession(async (it) => sent2.push(it), ["S1"]);
  assert.equal(res2.synced, 0);
  assert.equal(res2.failed, 0);
  assert.equal(await q.count(), 1);
});

test("flushBySession ordena por visita y aísla los fallos", async () => {
  const q = createPersistentQueue(createMemoryStore());
  await q.enqueue({ kind: "doc", entity: "device", doc: { id: "D1" } });
  await q.enqueue({ kind: "session-end", session_id: "S1", ended_at: "2026-11-15T11:00:00Z" });
  await q.enqueue({ kind: "media", doc: { id: "m1", session_id: "S1" } });
  await q.enqueue({ kind: "doc", entity: "session", doc: { id: "S1" } });
  await q.enqueue({ kind: "media", doc: { id: "m2", session_id: "S2" } });

  const sent = [];
  const res = await q.flushBySession(async (it) => {
    const id = it.doc?.id ?? it.session_id;
    sent.push(id);
    if (id === "m1") throw new Error("boom");
  }, ["S1"]);

  assert.deepEqual(sent, ["D1", "S1", "m1", "S1"]);
  assert.equal(res.sessions.S1.failed, 1);
  assert.equal(res.sessions.S1.synced, 2);
  assert.equal(res.general.synced, 1);
  assert.equal(res.sessions.S2, undefined); // S2 no se envió
  const left = await q.list();
  assert.deepEqual(left.map((i) => i.doc?.id ?? i.session_id).sort(), ["m1", "m2"]);
});
