import { test } from "node:test";
import assert from "node:assert/strict";

import { createRouter, normalizePath, parentOf, matchRoute } from "../app/router.js";

// `win` simulado: pila de hashes como el historial del navegador.
function fakeWin() {
  const stack = ["#/inicio"];
  const listeners = {};
  const win = {
    location: {},
    history: {
      back() {
        if (stack.length > 1) stack.pop();
        listeners.hashchange?.();
      },
    },
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
  };
  Object.defineProperty(win.location, "hash", {
    get: () => stack[stack.length - 1],
    set: (v) => stack.push(v),
  });
  win.location.replace = (v) => {
    stack[stack.length - 1] = v;
    listeners.hashchange?.();
  };
  return win;
}

function mkRouter(win, { guards = {}, onShow = () => {}, onLeave = () => {}, paramRoutes = [], aliases = {} } = {}) {
  const routes = {
    "/inicio": { hidden: false },
    "/activos": { hidden: true },
    "/activo": { hidden: true },
    "/activo/camara": { hidden: true },
    "/activo/camara/confirmar": { hidden: true },
    "/visita": { hidden: true },
    "/equipos/nuevo": { hidden: true },
  };
  const router = createRouter({ routes, guards, onShow, onLeave, win, paramRoutes, aliases });
  return { router, routes };
}

test("normalizePath cae al default en rutas desconocidas", () => {
  const routes = { "/inicio": {}, "/activos": {} };
  assert.equal(normalizePath("#/activos", routes), "/activos");
  assert.equal(normalizePath("#/no-existe", routes), "/inicio");
  assert.equal(normalizePath("", routes), "/inicio");
  assert.equal(parentOf("/activo/camara/confirmar"), "/activo/camara");
  assert.equal(parentOf("/activo"), "/inicio");
});

test("una pantalla por paso y Atrás vuelve a la anterior", () => {
  const win = fakeWin();
  const { router, routes } = mkRouter(win);
  router.start();
  assert.equal(router.current, "/inicio");
  assert.equal(routes["/inicio"].hidden, false);

  router.navigate("/activos");
  assert.equal(router.current, "/activos");
  assert.equal(routes["/activos"].hidden, false);
  assert.equal(routes["/inicio"].hidden, true);

  router.navigate("/activo");
  router.navigate("/activo/camara");
  assert.equal(router.current, "/activo/camara");

  router.back(); // pop real del historial
  assert.equal(router.current, "/activo");
  router.back();
  assert.equal(router.current, "/activos");
});

test("Atrás sin historial va a la pantalla padre", () => {
  const win = fakeWin();
  const { router } = mkRouter(win);
  router.start(); // aterriza en /inicio sin historial interno
  router.back(); // padre de /inicio es /inicio: no explota
  assert.equal(router.current, "/inicio");
});

test("guarda redirige y reemplaza la entrada", () => {
  const win = fakeWin();
  const { router } = mkRouter(win, {
    guards: { "/activo/camara": () => "/inicio" },
  });
  router.start();
  router.navigate("/activo/camara");
  assert.equal(router.current, "/inicio");
  assert.equal(win.location.hash, "#/inicio");
});

test("guarda de foto pendiente en la confirmación", () => {
  const win = fakeWin();
  let hasPhoto = false;
  const { router } = mkRouter(win, {
    guards: { "/activo/camara/confirmar": () => (hasPhoto ? null : "/activo/camara") },
  });
  router.start();
  router.navigate("/activo/camara/confirmar");
  assert.equal(router.current, "/activo/camara");
  hasPhoto = true;
  router.navigate("/activo/camara/confirmar");
  assert.equal(router.current, "/activo/camara/confirmar");
});

test("onShow/onLeave se llaman en cada transición", () => {
  const win = fakeWin();
  const events = [];
  const { router } = mkRouter(win, {
    onShow: (p, prev) => events.push(`show:${prev}->${p}`),
    onLeave: (prev, next) => events.push(`leave:${prev}->${next}`),
  });
  router.start();
  router.navigate("/activos");
  router.back();
  assert.deepEqual(events, [
    "show:null->/inicio",
    "leave:/inicio->/activos",
    "show:/inicio->/activos",
    "leave:/activos->/inicio",
    "show:/activos->/inicio",
  ]);
});

test("matchRoute resuelve rutas con parámetro de paso (ADR-0025)", () => {
  const routes = { "/inicio": {}, "/equipos/nuevo": {} };
  assert.deepEqual(matchRoute("#/equipos/nuevo/attrs", routes, ["/equipos/nuevo"]), {
    path: "/equipos/nuevo/attrs", base: "/equipos/nuevo", param: "attrs",
  });
  assert.deepEqual(matchRoute("#/equipos/nuevo", routes, ["/equipos/nuevo"]), {
    path: "/equipos/nuevo", base: "/equipos/nuevo", param: null,
  });
  // dos segmentos tras la base no son un paso válido
  assert.equal(matchRoute("#/equipos/nuevo/a/b", routes, ["/equipos/nuevo"]), null);
  assert.equal(normalizePath("#/equipos/nuevo/a/b", routes, "/inicio", ["/equipos/nuevo"]), "/inicio");
});

test("alias de rutas antiguas redirigen a las nuevas", () => {
  const win = fakeWin();
  const { router } = mkRouter(win, { aliases: { "/activo": "/visita" } });
  router.start();
  router.navigate("/activo");
  assert.equal(router.current, "/visita");
  assert.equal(win.location.hash, "#/visita");
});

test("guarda con parámetro: paso inválido vuelve al primer paso", () => {
  const win = fakeWin();
  const { router } = mkRouter(win, {
    paramRoutes: ["/equipos/nuevo"],
    guards: { "/equipos/nuevo": (param) => (param ? null : "/equipos/nuevo/tipo") },
  });
  router.start();
  router.navigate("/equipos/nuevo");
  assert.equal(router.current, "/equipos/nuevo/tipo");
  assert.equal(router.base, "/equipos/nuevo");
  assert.equal(router.param, "tipo");
  router.navigate("/equipos/nuevo/ficha");
  assert.equal(router.param, "ficha");
});

test("onShow recibe el parámetro y depth cuenta los navigate", () => {
  const win = fakeWin();
  const shown = [];
  const { router } = mkRouter(win, {
    paramRoutes: ["/equipos/nuevo"],
    onShow: (p, prev, param) => shown.push([p, param]),
  });
  router.start();
  router.navigate("/equipos/nuevo/tipo");
  assert.deepEqual(shown.at(-1), ["/equipos/nuevo/tipo", "tipo"]);
  assert.equal(router.depth, 1);
  router.navigate("/equipos/nuevo/ficha");
  assert.equal(router.depth, 2);
  router.back();
  assert.equal(router.depth, 1);
});
