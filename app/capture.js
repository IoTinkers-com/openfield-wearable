// Flujo de captura: produce documentos canónicos usando la capa de hardware.
import { newId, now } from "./ids.js";
import { simulatedHardware } from "./hardware/simulated.js";

const TENANT_ID = "tenant-001";
const SCHEMA_VERSION = "1.0";

export function createDevice(deviceId = newId("dev")) {
  const caps = simulatedHardware().capabilities();
  return {
    schema_version: SCHEMA_VERSION,
    tenant_id: TENANT_ID,
    id: deviceId,
    name: "Wearable simulado",
    device_capabilities: {
      model: "simulator",
      os: "n/a",
      thermal_level: caps.thermal_level,
      thermal_sensor_model: null,
      thermal_resolution: null,
      gps: caps.gps,
      audio: caps.audio,
      offline: true,
    },
    created_at: now(),
  };
}

export function startSession({ deviceId, assetId = null } = {}) {
  const hw = simulatedHardware();
  const loc = hw.getLocation();
  const caps = hw.capabilities();
  return {
    schema_version: SCHEMA_VERSION,
    tenant_id: TENANT_ID,
    id: newId("sess"),
    device_id: deviceId,
    operator: "operador",
    asset_id: assetId,
    started_at: now(),
    ended_at: null,
    location: loc ? { type: "Point", coordinates: [loc.lon, loc.lat] } : null,
    device_capabilities: {
      thermal_level: caps.thermal_level,
      gps: caps.gps,
      audio: caps.audio,
    },
    // D15: consentimiento + indicador de grabación antes de capturar.
    consent: { recorded: true, method: "checkbox" },
    created_at: now(),
  };
}

export function captureImage({ sessionId, assetId, seq = 1 } = {}) {
  const hw = simulatedHardware();
  const loc = hw.getLocation();
  const img = hw.captureImage(seq);
  return {
    schema_version: SCHEMA_VERSION,
    tenant_id: TENANT_ID,
    id: newId("media"),
    session_id: sessionId,
    asset_id: assetId,
    type: "image",
    captured_at: now(),
    geometry: loc ? { type: "Point", coordinates: [loc.lon, loc.lat] } : null,
    assets: { primary: { href: img.href, media_type: "image/jpeg" } },
    thermal_capture_id: null,
    transcript_id: null,
    created_at: now(),
  };
}

export function recordAudio({ sessionId, assetId, engine = "simulated" } = {}) {
  const audio = simulatedHardware().recordAudio();
  return {
    schema_version: SCHEMA_VERSION,
    tenant_id: TENANT_ID,
    id: newId("tr"),
    media_item_id: audio.href ? newId("media") : null,
    session_id: sessionId,
    asset_id: assetId,
    text: audio.text,
    language: "es",
    engine, // D7: registrar qué motor generó la transcripción
    confidence: 0.95,
    created_at: now(),
  };
}
