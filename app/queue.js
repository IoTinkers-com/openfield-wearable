// Cola offline-first (D4). Fase 0: en memoria; Fase 1: IndexedDB.
// NOTA (ADR-0008): no usamos Background Sync (no existe en iOS); la sincronización
// es explícita cuando hay conexión.

export function createQueue() {
  const items = [];
  return {
    enqueue(item) {
      items.push(item);
      return item;
    },
    all() {
      return [...items];
    },
    async flush(syncFn) {
      const failed = [];
      for (const item of items) {
        try {
          await syncFn(item);
        } catch {
          failed.push(item); // reintentar más tarde
        }
      }
      items.length = 0;
      items.push(...failed);
      return { synced: items.length === 0 };
    },
  };
}
