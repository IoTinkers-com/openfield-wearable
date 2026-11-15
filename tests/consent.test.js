import { test } from "node:test";
import assert from "node:assert/strict";

import {
  POLICY, consentStatus, buildConsentRecord, sessionConsentRef, loadConsent, saveConsent,
} from "../app/consent.js";
import { startSession } from "../app/capture.js";
import { validate } from "../app/schema.js";
import { createMemoryStore } from "../app/store.js";

const NOW = "2026-11-15T10:00:00.000Z";

test("consentStatus: sin registro es 'missing'", () => {
  assert.equal(consentStatus(null), "missing");
});

test("consentStatus: un grant reciente es 'valid'", () => {
  const rec = buildConsentRecord({ nowIso: NOW });
  assert.equal(consentStatus(rec, POLICY, NOW), "valid");
});

test("consentStatus: vencimiento exacto es 'expired' y un segundo antes es 'valid'", () => {
  const rec = buildConsentRecord({ nowIso: NOW });
  assert.equal(consentStatus(rec, POLICY, rec.expires_at), "expired");
  const before = new Date(Date.parse(rec.expires_at) - 1000).toISOString();
  assert.equal(consentStatus(rec, POLICY, before), "valid");
});

test("consentStatus: cambia la versión del aviso o faltan scopes -> 'version_changed'", () => {
  const rec = buildConsentRecord({ nowIso: NOW });
  const v2 = { ...POLICY, version: "1.1" };
  assert.equal(consentStatus(rec, v2, NOW), "version_changed");
  const noAudio = { ...rec, scopes: ["image", "text"] };
  assert.equal(consentStatus(noAudio, POLICY, NOW), "version_changed");
});

test("consentStatus: revocado es 'revoked' y otro sujeto es 'missing'", () => {
  const revoke = buildConsentRecord({ action: "revoke", nowIso: NOW });
  assert.equal(consentStatus(revoke, POLICY, NOW), "revoked");
  const rec = buildConsentRecord({ operator: "Ana", nowIso: NOW });
  assert.equal(consentStatus(rec, POLICY, NOW, { subjectId: "Otra" }), "missing");
  assert.equal(consentStatus(rec, POLICY, NOW, { subjectId: "Ana" }), "valid");
});

test("buildConsentRecord emite un consent-record válido con vencimiento a 365 días", () => {
  const rec = buildConsentRecord({ operator: "Ana", deviceId: "dev-1", nowIso: NOW });
  validate("consent-record", rec);
  assert.equal(rec.expires_at, "2027-11-15T10:00:00.000Z");
  assert.deepEqual(rec.scopes, [...POLICY.scopes]);
  assert.equal(rec.subject.type, "operator");

  const revoke = buildConsentRecord({ action: "revoke", nowIso: NOW });
  validate("consent-record", revoke);
  assert.deepEqual(revoke.scopes, []);
  assert.equal(revoke.expires_at, null);
});

test("la sesión guarda la referencia del consentimiento y valida", async () => {
  const rec = buildConsentRecord({ operator: "Ana", nowIso: NOW });
  const s = await startSession({ deviceId: "dev-1", assetId: "asset-1", consent: sessionConsentRef(rec) });
  validate("session", s);
  assert.equal(s.consent.record_id, rec.id);
  assert.equal(s.consent.policy_version, "1.0");
  assert.equal(s.consent.method, "stored");
});

test("saveConsent/loadConsent en kv", async () => {
  const store = createMemoryStore();
  assert.equal(await loadConsent(store), null);
  const rec = buildConsentRecord({ nowIso: NOW });
  await saveConsent(store, rec);
  assert.deepEqual((await loadConsent(store)).id, rec.id);
});
