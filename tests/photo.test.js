import { test } from "node:test";
import assert from "node:assert/strict";

import { captureImage, photoMetadata } from "../app/capture.js";
import { validate } from "../app/schema.js";
import { DEFAULT_PHOTO_CATEGORIES, photoCategoriesFor, photoCategoryLabel } from "../app/labels.js";

test("photoMetadata recorta a los límites del esquema y omite claves vacías", () => {
  const m = photoMetadata({
    caption: "x".repeat(600),
    category: "placa",
    categoryLabel: "Placa de datos",
    cameraLabel: "Gran angular",
    width: 4032.9,
    height: 3024,
  });
  assert.equal(m.caption.length, 500);
  assert.equal(m.category, "placa");
  assert.equal(m.category_label, "Placa de datos");
  assert.equal(m.camera_label, "Gran angular");
  assert.equal(m.width, 4032);
  assert.equal(m.height, 3024);
  const empty = photoMetadata({});
  assert.deepEqual(empty, {});
});

test("captureImage emite media-item válido con metadata de foto (ADR-0024)", async () => {
  const meta = photoMetadata({
    caption: "Placa del motor",
    category: "placa",
    categoryLabel: "Placa de datos",
    cameraLabel: "Trasera",
    width: 1920,
    height: 1080,
  });
  const doc = await captureImage({ sessionId: "sess-1", assetId: "asset-001", metadata: meta });
  validate("media-item", doc);
  assert.equal(doc.metadata.caption, "Placa del motor");
  assert.equal(doc.metadata.category, "placa");
  assert.equal(doc.metadata.width, 1920);
});

test("captureImage sin metadata no emite la clave", async () => {
  const doc = await captureImage({ sessionId: "sess-1", assetId: "asset-001" });
  validate("media-item", doc);
  assert.equal(doc.metadata, undefined);
});

test("photoCategoriesFor usa las del tipo o las predeterminadas", () => {
  assert.deepEqual(photoCategoriesFor(null), DEFAULT_PHOTO_CATEGORIES);
  assert.deepEqual(photoCategoriesFor({}), DEFAULT_PHOTO_CATEGORIES);
  assert.deepEqual(photoCategoriesFor({ photo_categories: [] }), DEFAULT_PHOTO_CATEGORIES);
  const custom = { photo_categories: [
    { key: "rodamiento", label: "Rodamientos", active: true },
    { key: "vieja", label: "Vieja", active: false },
  ] };
  const cats = photoCategoriesFor(custom);
  assert.deepEqual(cats, [{ key: "rodamiento", label: "Rodamientos", active: true }]);
});

test("photoCategoryLabel resuelve etiqueta del tipo, default o la clave", () => {
  const type = { photo_categories: [{ key: "rodamiento", label: "Rodamientos" }] };
  assert.equal(photoCategoryLabel(type, "rodamiento"), "Rodamientos");
  assert.equal(photoCategoryLabel(type, "placa"), "Placa de datos"); // default
  assert.equal(photoCategoryLabel(type, "otra"), "otra"); // clave desconocida
  assert.equal(photoCategoryLabel(type, ""), "");
});
