import { test } from "node:test";
import assert from "node:assert/strict";

import { simulatedHardware } from "../app/hardware/simulated.js";

test("simulatedHardware: listCameras y startAudioRecording explícito", async () => {
  const hw = simulatedHardware();
  const cams = await hw.listCameras();
  assert.equal(cams.length, 2);
  assert.ok(cams[0].deviceId);

  const rec = await hw.startAudioRecording();
  const out = await rec.stop();
  assert.equal(out.mimeType, "audio/webm");
  assert.ok(out.blob instanceof Blob);
  assert.equal(out.autoStopped, false);
});

test("webHardware.listCameras: filtra videoinput y pone 'Cámara N' sin label", async () => {
  const origNav = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: "videoinput", deviceId: "cam-1", label: "Back Camera", groupId: "g1" },
          { kind: "audioinput", deviceId: "mic-1", label: "Mic", groupId: "g1" },
          { kind: "videoinput", deviceId: "cam-2", label: "", groupId: "g2" },
        ],
        getUserMedia: async () => { throw new Error("not in test"); },
      },
    },
  });
  try {
    const { webHardware } = await import("../app/hardware/web.js");
    const cams = await webHardware().listCameras();
    assert.equal(cams.length, 2);
    assert.equal(cams[0].label, "Back Camera");
    assert.equal(cams[1].label, "Cámara 2");
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: origNav });
  }
});
