import { test } from "node:test";
import assert from "node:assert/strict";

import { validate } from "../app/schema.js";
import { captureImage, createDevice, recordAudio, startSession } from "../app/capture.js";
import { createQueue } from "../app/queue.js";

test("device emite documento válido", () => {
  validate("device", createDevice("dev-wear-001"));
});

test("session emite documento válido con consentimiento (D15)", () => {
  const s = startSession({ deviceId: "dev-wear-001", assetId: "asset-001" });
  validate("session", s);
  assert.equal(s.consent.recorded, true);
});

test("media-item emite documento válido con geometría WGS84", () => {
  const m = captureImage({ sessionId: "sess-1", assetId: "asset-001" });
  validate("media-item", m);
  assert.equal(m.geometry.type, "Point");
});

test("transcript registra el motor (D7)", () => {
  const t = recordAudio({ sessionId: "sess-1", assetId: "asset-001", engine: "simulated" });
  validate("transcript", t);
  assert.equal(t.engine, "simulated");
});

test("cola offline-first retiene y sincroniza (D4)", async () => {
  const q = createQueue();
  q.enqueue({ id: 1 });
  assert.equal(q.all().length, 1);
  let calls = 0;
  const res = await q.flush(async () => {
    calls += 1;
  });
  assert.equal(calls, 1);
  assert.equal(res.synced, true);
});
