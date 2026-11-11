// Sincronización con la plataforma: subida de medios + ingesta de documentos.
// Nota: tus (subida reanudable) se agrega cuando haya medios grandes (video, D4).

export async function uploadMedia(blob, filename, baseUrl = "http://localhost:8000") {
  const form = new FormData();
  form.append("file", blob, filename);
  const res = await fetch(`${baseUrl}/uploads`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json(); // { href, filename, size }
}

export async function ingest(entityType, doc, baseUrl = "http://localhost:8000") {
  const res = await fetch(`${baseUrl}/ingest/${entityType}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`ingest failed: ${res.status}`);
  return res.json();
}
