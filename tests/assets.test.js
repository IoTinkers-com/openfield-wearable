import { test } from "node:test";
import assert from "node:assert/strict";

import {
  searchAssets, parseValue, computeVerificationStatus,
  applyVerificationLocally, buildVerifyPayload, newFieldAsset,
  loadCatalog, findAssetByTag, tagsByAsset,
} from "../app/assets.js";
import { createMemoryStore } from "../app/store.js";
import { validate } from "../app/schema.js";

const TYPE = {
  id: "atype-motor", name: "Motor",
  attributes: [
    { key: "kw", label: "Potencia", type: "number", unit: "kW", required: true, active: true, order: 0, verify_in_field: true },
    { key: "ip", label: "IP", type: "select", options: ["IP54", "IP65"], required: false, active: true, order: 1, verify_in_field: true },
  ],
};

function asset(over = {}) {
  return {
    id: "a1", name: "Motor Á-1", status: "in_service", asset_type_id: "atype-motor",
    attributes: { kw: 10 }, attribute_verification: {}, verification_status: "pending",
    ...over,
  };
}

test("searchAssets: ignora acentos, pendientes primero, excluye desincorporados", () => {
  const assets = [
    asset({ id: "a1", name: "Motor Á-1", verification_status: "verified" }),
    asset({ id: "a2", name: "Motor B-2", verification_status: "pending" }),
    asset({ id: "a3", name: "Motor C-3", status: "decommissioned" }),
  ];
  const all = searchAssets(assets, "");
  assert.deepEqual(all.map((a) => a.id), ["a2", "a1"]); // pendiente primero, sin el desincorporado
  assert.equal(searchAssets(assets, "a-1").length, 1); // sin acento encuentra "Á-1"
  assert.equal(searchAssets(assets, "", { pendingOnly: true }).length, 1);
});

test("parseValue: coma decimal, boolean 'sí', fecha DD-MM-YYYY, select sin mayúsculas", () => {
  assert.equal(parseValue({ type: "number" }, "10,5"), 10.5);
  assert.equal(parseValue({ type: "boolean" }, "Sí"), true);
  assert.equal(parseValue({ type: "date" }, "15-03-2026"), "2026-03-15");
  assert.equal(parseValue({ type: "select", options: ["IP54", "IP65"] }, "ip65"), "IP65");
  assert.throws(() => parseValue({ type: "select", options: ["IP54"] }, "IP99"), /no está entre las opciones/);
  assert.equal(parseValue({ type: "text" }, ""), null);
});

test("computeVerificationStatus y applyVerificationLocally", () => {
  const a = asset();
  assert.equal(computeVerificationStatus(a, TYPE), "pending");

  const payload = buildVerifyPayload({
    opId: "op-1",
    results: [{ key: "kw", action: "confirm" }, { key: "ip", action: "correct", value: "IP65" }],
  });
  applyVerificationLocally(a, TYPE, payload, "2026-11-13T10:00:00Z");
  assert.equal(a.attributes.ip, "IP65");
  assert.equal(a.attribute_verification.ip.status, "corrected");
  assert.equal(a.verification_status, "verified");
  assert.equal(a.verified_at, "2026-11-13T10:00:00Z");

  const lost = asset();
  applyVerificationLocally(lost, TYPE, { asset_not_found: true, results: [] });
  assert.equal(lost.verification_status, "not_found");
});

test("newFieldAsset: valida contra esquemas asset y asset-identifier", () => {
  const { asset: a, identifier } = newFieldAsset({
    tenantId: "tenant-001", id: "asset-x1", identId: "ident-x1", type: TYPE,
    name: "Motor nuevo", tag: "MOT-99", attributes: { kw: 5 },
    sessionId: "sess-x1", lon: -70.65, lat: -33.45,
  });
  validate("asset", a);
  assert.equal(a.data_source, "field");
  assert.equal(a.verification_status, "verified");
  assert.equal(a.attribute_verification.kw.status, "confirmed");
  validate("asset-identifier", identifier);
  assert.equal(identifier.value, "MOT-99");
});

test("loadCatalog: ante error usa la caché del store", async () => {
  const store = createMemoryStore();
  await store.put("kv", { key: "catalog.assets", value: [asset()] });
  await store.put("kv", { key: "catalog.types", value: [TYPE] });
  const failing = async () => { throw new Error("offline"); };
  const out = await loadCatalog({ baseUrl: "http://x", store, tenantId: "tenant-001", fetchFn: failing });
  assert.equal(out.fromCache, true);
  assert.equal(out.assets.length, 1);
});

test("loadCatalog: descarga y guarda en caché", async () => {
  const store = createMemoryStore();
  const okJson = (data) => new Response(JSON.stringify(data), { status: 200 });
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.includes("/admin/assets")) return okJson([asset()]);
    if (url.includes("/admin/asset-types")) return okJson([TYPE]);
    return okJson([]);
  };
  const out = await loadCatalog({ baseUrl: "http://x", store, tenantId: "tenant-001", fetchFn: fake });
  assert.equal(out.fromCache, false);
  assert.equal(out.assets.length, 1);
  assert.equal((await store.get("kv", "catalog.assets")).value.length, 1);
  assert.ok(calls[0].includes("tenant_id=tenant-001"));
});

test("findAssetByTag: resuelve QR/TAG contra identificadores del catálogo", () => {
  const identifiers = [{ asset_id: "a1", type: "tag", value: "MOT-1" }];
  assert.equal(findAssetByTag([asset()], identifiers, "mot-1").id, "a1");
  assert.equal(tagsByAsset(identifiers).a1[0], "MOT-1");
});
