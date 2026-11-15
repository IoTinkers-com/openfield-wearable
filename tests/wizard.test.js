import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createWizard, toKey, saveDraft, loadDraft, clearDraft, createLocalKv,
} from "../app/wizard.js";
import { createMemoryStore } from "../app/store.js";

const KEY_RE = /^[a-z][a-z0-9_]{0,49}$/;

test("toKey deriva claves válidas del patrón del esquema (ADR-0025)", () => {
  assert.equal(toKey("Potencia nominal (kW)"), "potencia_nominal_kw");
  assert.equal(toKey("Año"), "ano");
  assert.equal(toKey("1 fase"), "c_1_fase");
  assert.equal(toKey(""), "campo");
  assert.equal(toKey("Año", ["ano"]), "ano_2");
  assert.equal(toKey("Año", ["ano", "ano_2"]), "ano_3");
  assert.ok(KEY_RE.test(toKey("x".repeat(80))));
  assert.equal(toKey("x".repeat(80)).length, 50);
  assert.ok(KEY_RE.test(toKey("Ñandú / °C")));
});

function steps() {
  return [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C", skipIf: (d) => d.skip },
    { id: "d", title: "D" },
  ];
}

test("los pasos omitidos no cuentan en el progreso y se saltan", () => {
  const wiz = createWizard({ steps: steps() });
  assert.deepEqual(wiz.progress(), { n: 1, m: 4 });
  wiz.set({ skip: true });
  assert.deepEqual(wiz.progress(), { n: 1, m: 3 });
  wiz.next(); // a -> b
  assert.equal(wiz.current().id, "b");
  wiz.next(); // b -> d (c omitido)
  assert.equal(wiz.current().id, "d");
  assert.deepEqual(wiz.progress(), { n: 3, m: 3 });
});

test("la validación bloquea Continuar sin cambiar de paso", () => {
  const wiz = createWizard({
    steps: [
      { id: "a", title: "A", validate: (d) => (d.name ? null : "Falta el nombre") },
      { id: "b", title: "B" },
    ],
  });
  const res = wiz.next();
  assert.deepEqual(res, { ok: false, error: "Falta el nombre" });
  assert.equal(wiz.current().id, "a");
  wiz.set({ name: "X" });
  assert.equal(wiz.next().ok, true);
  assert.equal(wiz.current().id, "b");
});

test("back conserva datos y no sale del primer paso", () => {
  const wiz = createWizard({ steps: steps() });
  assert.equal(wiz.back(), false);
  wiz.set({ name: "Motor" });
  wiz.next();
  assert.equal(wiz.back(), true);
  assert.equal(wiz.current().id, "a");
  assert.equal(wiz.data.name, "Motor");
});

test("el último paso informa done", () => {
  const wiz = createWizard({ steps: [{ id: "a", title: "A" }] });
  assert.deepEqual(wiz.next(), { ok: true, done: true });
});

test("si el paso actual deja de ser visible, pasa al siguiente visible", () => {
  const wiz = createWizard({
    steps: [
      { id: "a", title: "A" },
      { id: "b", title: "B", skipIf: (d) => d.hideB },
      { id: "c", title: "C" },
    ],
    stepId: "b",
  });
  assert.equal(wiz.current().id, "b");
  wiz.set({ hideB: true });
  assert.equal(wiz.current().id, "c");
});

test("borrador: guardar, reanudar en el mismo paso y limpiar", async () => {
  const store = createMemoryStore();
  const wiz = createWizard({ steps: steps() });
  wiz.set({ name: "Bomba" });
  wiz.next();
  await saveDraft(store, "equipo", wiz);

  const draft = await loadDraft(store, "equipo");
  assert.equal(draft.stepId, "b");
  assert.equal(draft.data.name, "Bomba");

  const resumed = createWizard({ steps: steps(), data: draft.data, stepId: draft.stepId });
  assert.equal(resumed.current().id, "b");
  assert.equal(resumed.data.name, "Bomba");

  await clearDraft(store, "equipo");
  assert.equal(await loadDraft(store, "equipo"), null);
});

test("createLocalKv usa el prefijo of. y va y vuelve", async () => {
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
  const kv = createLocalKv(storage);
  await kv.put("kv", { key: "wizard.tipo", value: { a: 1 } });
  assert.ok(map.has("of.wizard.tipo"));
  assert.deepEqual(await kv.get("kv", "wizard.tipo"), { key: "wizard.tipo", value: { a: 1 } });
  await kv.delete("kv", "wizard.tipo");
  assert.equal(await kv.get("kv", "wizard.tipo"), null);
});
