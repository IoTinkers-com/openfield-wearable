# openfield-wearable

App de captura de OpenField (IoTinkers): **PWA primero** con capa de hardware desacoplada.
**Fase 0:** esqueleto con implementación simulada que emite el contrato canónico.

## Estructura
```
app/
├── hardware/          # capa desacoplada: interface.js + simulated.js (Fase 0)
├── capture.js         # flujo de captura -> documentos canónicos
├── queue.js           # cola offline-first (D4)
├── schema.js          # validación local contra schemas/ (ajv)
└── ids.js             # id único + reloj (D4)
public/                # PWA: index.html, manifest, service worker
schemas/               # contrato canónico (vendored)
```

## Uso
```sh
npm install
npm test        # valida que la captura simulada emite documentos válidos
```

## Fase 1 (pendiente)
Implementación web real de la capa de hardware (`hardware/web.js`): MediaDevices,
Geolocation, micrófono; IndexedDB en la cola; `tus` para subida reanudable.
