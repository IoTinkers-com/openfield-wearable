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

test("simulatedHardware: controles de cámara y watchLocation (ADR-0024)", async () => {
  const hw = simulatedHardware();
  const cam = await hw.openCamera();
  assert.equal(cam.capabilities.torch, false);
  assert.equal(cam.capabilities.zoom, null);
  assert.equal(await hw.setTorch(cam, true), false);
  assert.equal(await hw.setZoom(cam, 2), false);
  const fixes = [];
  const stop = hw.watchLocation((f) => fixes.push(f));
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].lon, -70.65);
  assert.equal(typeof stop, "function");
  stop();
});

test("webHardware.openCamera: expone torch/zoom según getCapabilities", async () => {
  const origNav = globalThis.navigator;
  const track = {
    label: "Back Camera",
    getSettings: () => ({ width: 1920, height: 1080 }),
    getCapabilities: () => ({ torch: true, zoom: { min: 1, max: 5, step: 0.5 } }),
    applyConstraints: async () => {},
  };
  const stream = { getVideoTracks: () => [track] };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: { getUserMedia: async () => stream },
    },
  });
  try {
    const { webHardware } = await import("../app/hardware/web.js");
    const hw = webHardware();
    const cam = await hw.openCamera({});
    assert.equal(cam.capabilities.torch, true);
    assert.deepEqual(cam.capabilities.zoom, { min: 1, max: 5, step: 0.5 });
    assert.equal(await hw.setTorch(cam, true), true);
    assert.equal(await hw.setZoom(cam, 2), true);
    // sin capacidades → false, sin lanzar
    const camNoCaps = { track: { applyConstraints: async () => {} }, capabilities: { torch: false, zoom: null } };
    assert.equal(await hw.setTorch(camNoCaps, true), false);
    assert.equal(await hw.setZoom(camNoCaps, 2), false);
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: origNav });
  }
});

test("webHardware.watchLocation devuelve función de parada", async () => {
  const origNav = globalThis.navigator;
  let cleared = -1;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        watchPosition: (ok) => {
          ok({ coords: { longitude: -70.6, latitude: -33.4, accuracy: 5 } });
          return 42;
        },
        clearWatch: (id) => { cleared = id; },
      },
      mediaDevices: {},
    },
  });
  try {
    const { webHardware } = await import("../app/hardware/web.js");
    const fixes = [];
    const stop = webHardware().watchLocation((f) => fixes.push(f));
    assert.equal(fixes.length, 1);
    assert.equal(fixes[0].lon, -70.6);
    stop();
    assert.equal(cleared, 42);
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: origNav });
  }
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
