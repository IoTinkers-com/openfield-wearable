# AGENTS.md — openfield-wearable

App de captura de OpenField (IoTinkers): **PWA primero** + capa de hardware desacoplada.

## Reglas
- La capa de hardware (`app/hardware/`) es **desacoplada** (D8): interfaz + implementación
  web (Fase 1) o simulada (Fase 0). Envolver con Capacitor/nativo después.
- Todo documento emitido (`Session`, `MediaItem`, `ThermalCapture`, `Transcript`, `Device`,
  `SyncEvent`) valida contra `schemas/` (via `app/schema.js`).
- Offline-first (D4): `id` en el dispositivo, cola local, `tus` reanudable, reloj.
  **No usar Background Sync** (no existe en iOS, ADR-0008).
- Consentimiento + indicador de grabación antes de capturar (D15).
- Coordenadas en WGS84 (D2).
- La capa de app (`app/*.js`, `hardware/`) y `public/style.css` se duplican con
  `openfield-platform/app/static/pwa/` (ver ADR-0018): al cambiar una copia, actualiza la otra.

## Terminado
- `npm test` pasa.

## Referencias del plan
Paquete de planificación en `../openfield-planning/`: `DECISIONS.md`, `03-adr/`,
`04-esquemas/`, `06-backlog-mvp.md`.
