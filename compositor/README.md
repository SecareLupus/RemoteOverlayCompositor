# Remote Overlay Compositor (Prototype)

This package implements a development-grade reference server for the Remote Overlay Compositor project. It now includes a stateful control plane that mirrors the JSON protocol expected by the OBS plugin, along with a JSON HTTP API that can be exercised during integration tests.

## Features

- WebSocket control server implementing `hello`, `welcome`, `layer.setVisible`, `layer.sync`, and `preset.apply` messages with revision tracking and idempotent updates.
- Central `CompositorState` that manages layers, presets, and revision numbers while emitting events for WebSocket broadcasts and HTTP mutations.
- REST-style HTTP API for managing layers and presets, including applying presets and retrieving the full compositor snapshot.
- Configurable authentication token, heartbeat interval, device identifiers, and accepted protocol versions via environment variables.
- Structured logging hooks for client connections, layer mutations, and preset changes to aid in debugging the OBS integration.

## Running Locally

```bash
npm install
npm run dev
```

The server listens on `http://localhost:8080` by default. Control clients should connect to `ws://localhost:8080/control`.

### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `COMPOSITOR_PORT` | HTTP listen port | `8080` |
| `COMPOSITOR_WS_PATH` | WebSocket upgrade path | `/control` |
| `COMPOSITOR_HEARTBEAT` | Heartbeat interval in seconds | `10` |
| `COMPOSITOR_DEVICE_NAME` | Human-readable label used in logs | `RemoteCompositor` |
| `COMPOSITOR_DEVICE_ID` | Stable device identifier advertised to clients | random UUID per process |
| `COMPOSITOR_AUTH_TOKEN` | Optional bearer token required during handshake | unset |
| `COMPOSITOR_ACCEPT_VERSIONS` | Comma-separated list of accepted client protocol versions | `1.0` |

## HTTP API Overview

All responses are JSON. Selected endpoints:

- `GET /healthz` – basic health probe.
- `GET /api/state` – snapshot of layers and presets with the current revision.
- `GET /api/layers` / `GET /api/layers/:id` – enumerate or inspect layers.
- `POST /api/layers` – upsert a layer (`{ "id": "chat", "name": "Chat", "visible": true }`).
- `PATCH /api/layers/:id` – rename or toggle visibility.
- `DELETE /api/layers/:id` – remove a layer.
- `GET /api/presets` / `GET /api/presets/:id` – list presets.
- `POST /api/presets` – create or replace a preset with a visibility map.
- `PATCH /api/presets/:id` – update metadata or visibility maps.
- `POST /api/presets/:id/apply` – apply a preset, returning the visibility deltas.
- `DELETE /api/presets/:id` – remove a preset definition.

Example preset creation:

```bash
curl -X POST http://localhost:8080/api/presets \
  -H 'Content-Type: application/json' \
  -d '{"id":"brb","name":"Be Right Back","visibility":{"chat":false,"alerts":false}}'
```

## Next Steps

- Integrate with a CEF runtime that renders HTML overlays and produces a composited video stream.
- Persist layer metadata and visibility across restarts.
- Implement authentication hardening, metrics, and diagnostics endpoints.
