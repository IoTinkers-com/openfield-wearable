import { test } from "node:test";
import assert from "node:assert/strict";

import {
  openVisit, closeVisit, markSynced, currentVisit, closedVisits, staleVisit, pruneSynced,
  assignDrafts, nearbyAssets, legacyVisits, describeCounts, sumCounts, STALE_MS,
} from "../app/visits.js";
import { captureImage } from "../app/capture.js";
import { validate } from "../app/schema.js";

const SESSION = { id: "sess-1", asset_id: "a1", started_at: "2026-11-15T10:00:00.000Z", ended_at: null };
const ASSET = { id: "a1", name: "Motor M-01" };

function visitOpen() {
  return openVisit([], { session: SESSION, asset: ASSET });
}

test("openVisit crea una visita abierta y rechaza una segunda", () => {
  const visits = visitOpen();
  assert.equal(visits.length, 1);
  assert.equal(visits[0].state, "open");
  assert.equal(visits[0].asset_name, "Motor M-01");
  assert.throws(() => openVisit(visits, { session: { ...SESSION, id: "sess-2" }, asset: ASSET }), /abierta/);
});

test("closeVisit cierra solo una visita abierta", () => {
  const visits = closeVisit(visitOpen(), "sess-1", "2026-11-15T11:00:00.000Z");
  assert.equal(visits[0].state, "closed");
  assert.equal(visits[0].ended_at, "2026-11-15T11:00:00.000Z");
  assert.throws(() => closeVisit(visits, "sess-1", "2026-11-15T12:00:00.000Z"), /no está abierta/);
});

test("markSynced solo afecta a las cerradas y closedVisits filtra", () => {
  const closed = closeVisit(visitOpen(), "sess-1", "2026-11-15T11:00:00.000Z");
  assert.equal(closedVisits(closed).length, 1);
  const synced = markSynced(closed, ["sess-1"]);
  assert.equal(synced[0].state, "synced");
  assert.equal(closedVisits(synced).length, 0);
  const open = visitOpen();
  assert.equal(markSynced(open, ["sess-1"])[0].state, "open");
});

test("staleVisit detecta la visita olvidada a las 12 h", () => {
  const visits = visitOpen();
  const at = (h) => new Date(Date.parse(SESSION.started_at) + h * 3600 * 1000).toISOString();
  assert.equal(staleVisit(visits, at(11) + ""), null);
  assert.equal(staleVisit(visits, new Date(Date.parse(SESSION.started_at) + 12 * 3600 * 1000).toISOString()), null);
  assert.equal(staleVisit(visits, new Date(Date.parse(SESSION.started_at) + STALE_MS + 60000).toISOString())?.id, "sess-1");
  assert.equal(staleVisit([], at(24)), null);
});

test("pruneSynced conserva las N más recientes y todas las no sincronizadas", () => {
  const mk = (id, state, ended) => ({ id, state, ended_at: ended, session: {}, asset_id: "a1" });
  const visits = [
    mk("v1", "synced", "2026-11-10T10:00:00Z"),
    mk("v2", "synced", "2026-11-11T10:00:00Z"),
    mk("v3", "synced", "2026-11-12T10:00:00Z"),
    mk("v4", "closed", "2026-11-13T10:00:00Z"),
  ];
  const kept = pruneSynced(visits, 2).map((v) => v.id);
  // conserva las 2 sincronizadas más recientes (v3, v2) y la cerrada sin sincronizar
  assert.deepEqual(kept.sort(), ["v2", "v3", "v4"]);
});

test("assignDrafts asigna sesión y activo y el media-item resultante valida", async () => {
  const doc = await captureImage({ sessionId: null, assetId: null, geometry: null });
  const items = [
    { qid: "q1", kind: "media", draft: true, doc },
    { qid: "q2", kind: "audio", draft: true, session_id: null, asset_id: null },
    { qid: "q3", kind: "doc", entity: "observation", draft: true, doc: { id: "o1", session_id: null, asset_id: null } },
    { qid: "q4", kind: "doc", entity: "session", doc: { id: "sess-1" } },
  ];
  const patches = assignDrafts(items, { id: "sess-1", asset_id: "a1" }, { type: "Point", coordinates: [-70.6, -33.4] });
  assert.equal(patches.length, 3);
  const media = patches.find((p) => p.qid === "q1");
  assert.equal(media.patch.draft, false);
  assert.equal(media.patch.doc.session_id, "sess-1");
  assert.equal(media.patch.doc.asset_id, "a1");
  assert.deepEqual(media.patch.doc.geometry, { type: "Point", coordinates: [-70.6, -33.4] });
  validate("media-item", media.patch.doc);
  const audio = patches.find((p) => p.qid === "q2");
  assert.equal(audio.patch.session_id, "sess-1");
  assert.equal(audio.patch.asset_id, "a1");
  const note = patches.find((p) => p.qid === "q3");
  assert.equal(note.patch.doc.asset_id, "a1");
});

test("nearbyAssets ordena por distancia y excluye desincorporados o sin coordenadas", () => {
  const assets = [
    { id: "lejos", status: "in_service", location: { coordinates: [-70.70, -33.45] } },
    { id: "cerca", status: "in_service", location: { coordinates: [-70.6501, -33.4501] } },
    { id: "baja", status: "decommissioned", location: { coordinates: [-70.65005, -33.45005] } },
    { id: "sin", status: "in_service" },
  ];
  const res = nearbyAssets(assets, { lon: -70.65, lat: -33.45 });
  assert.deepEqual(res.map((r) => r.asset.id), ["cerca", "lejos"]);
  assert.ok(res[0].distance_m < res[1].distance_m);
  assert.ok(Math.abs(res[0].distance_m - 15) < 5);
  assert.deepEqual(nearbyAssets(assets, null), []);
});

test("legacyVisits convierte sesiones de la cola en visitas", () => {
  const items = [
    { kind: "doc", entity: "session", doc: { id: "S-old", asset_id: "a1", started_at: "2026-11-14T09:00:00Z" } },
    { kind: "session-end", session_id: "S-old", ended_at: "2026-11-14T10:00:00Z" },
    { kind: "media", doc: { session_id: "S-old" } },
    { kind: "doc", entity: "session", doc: { id: "S-cur", asset_id: "a2", started_at: "2026-11-15T09:00:00Z" } },
  ];
  const uiSession = { id: "S-cur", asset_id: "a2", started_at: "2026-11-15T09:00:00Z", ended_at: null };
  const visits = legacyVisits(items, [], {
    uiSession,
    assetsById: { a1: { name: "Uno" }, a2: { name: "Dos" } },
    nowIso: "2026-11-15T12:00:00Z",
  });
  const old = visits.find((v) => v.id === "S-old");
  const cur = visits.find((v) => v.id === "S-cur");
  assert.equal(old.state, "closed");
  assert.equal(old.ended_at, "2026-11-14T10:00:00Z");
  assert.equal(cur.state, "open");
  assert.equal(cur.asset_name, "Dos");
  // idempotente: no duplica visitas ya registradas
  assert.equal(legacyVisits(items, visits, { uiSession }).length, visits.length);
  // sin documento de sesión conocido no inventa visitas
  assert.equal(legacyVisits([{ kind: "media", doc: { session_id: "S-x" } }], []).length, 0);
});

test("describeCounts y sumCounts redactan en español", () => {
  assert.equal(describeCounts({ media: 12, audio: 2, verify: 1, notes: 2 }), "12 fotos, 2 notas de voz, 1 verificación, 2 comentarios");
  assert.equal(describeCounts({ media: 1 }), "1 foto");
  assert.equal(describeCounts({}), "sin capturas");
  assert.deepEqual(
    sumCounts([{ media: 2, audio: 1 }, { media: 3, verify: 1 }]),
    { media: 5, audio: 1, verify: 1, notes: 0 },
  );
});
