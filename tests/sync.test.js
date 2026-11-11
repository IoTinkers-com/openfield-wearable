import { test } from "node:test";
import assert from "node:assert/strict";

import { ingest, uploadMedia } from "../app/sync.js";

test("uploadMedia envía multipart a /uploads", async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return new Response(JSON.stringify({ href: "/media/x.png" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const res = await uploadMedia(new Blob(["x"], { type: "image/png" }), "x.png", "http://localhost:8000");
    assert.equal(res.href, "/media/x.png");
    assert.match(calls[0].url, /\/uploads$/);
    assert.equal(calls[0].opts.method, "POST");
  } finally {
    globalThis.fetch = orig;
  }
});

test("ingest envía JSON a /ingest/{entity}", async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return new Response(JSON.stringify({ status: "created" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await ingest("media-item", { id: "1" }, "http://localhost:8000");
    assert.match(calls[0].url, /\/ingest\/media-item$/);
    assert.equal(JSON.parse(calls[0].opts.body).id, "1");
  } finally {
    globalThis.fetch = orig;
  }
});
