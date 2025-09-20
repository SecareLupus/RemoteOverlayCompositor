# Remote Overlay Compositor – Implementation Status

## Completed in this iteration

### Remote Compositor Prototype
- Central `CompositorState` driving layers, presets, and revision sequencing with event emissions used by both HTTP and WebSocket transports.
- Expanded WebSocket control server with authentication gating, client heartbeat tracking, bulk sync, preset application acknowledgements, and per-layer upsert/remove broadcasts.
- REST API surface for listing, mutating, and applying presets and layers to support automation and plugin-driven diagnostics.
- Environment configuration for device identity, accepted protocol versions, and bearer tokens, plus structured logging hooks for key control events.

### OBS Plugin Scaffold
- JSON protocol codec using `nlohmann::json` covering welcome, layer updates, presets, and error payloads.
- Transport-agnostic `RemoteControlSession` with fake transport tests driving handshake, state sync, and local visibility echoing.
- Remote state store enhancements for upsert/remove semantics aligned with server events.

## Open Questions
1. **Transport fallback** – When the compositor falls back to WebRTC, how are SDP credentials surfaced over this control channel?

## Resolved Decisions
- **Preset payload shape** – The initial `welcome` handshake continues to advertise preset metadata (id, name, tags). Full preset visibility maps are requested lazily via a follow-up fetch so that devices carrying large preset definitions do not stall the first sync. This enables our first end-to-end test to validate handshake performance independent of preset bulk.
- **Authentication UX** – The compositor issues a random bearer token on demand; OBS stores it until the user explicitly regenerates it. Authentication failures surface in compositor logs/diagnostics rather than user-facing OBS prompts for this iteration.
- **Revision contract** – Any message exchanged between the plugin and compositor increments the global revision counter, and presets do not require their own per-preset revisioning. Preset selection and mutation remain compositor responsibilities, while OBS only toggles layer visibility.
- **Layer creation lifecycle** – Layer creation and deletion stay server-driven. The OBS plugin mirrors the compositor’s declared layers and only exposes visibility toggles.
- **Preset application feedback** – Success or validation failures are emitted to stdout/logs for debugging, but the OBS client only receives the resulting state diff.

## Remaining Tasks

### Remote Compositor
- Embed a real CEF renderer, with lifecycle management and HTML sandboxing per layer.
- Implement NDI video output (color + alpha) and expose health metrics.
- Persist layer state and presets; add storage abstraction (file/SQLite).
- Harden authentication/token validation (expiry, rotation) and expose metrics/diagnostics endpoints.
- Add comprehensive unit/integration tests, including fake OBS clients and preset edge cases.

### OBS Plugin
- Integrate OBS SDK headers and implement source factories plus UI to mirror layer/preset changes.
- Implement real WebSocket transport (likely `asio`/`ixwebsocket`) with reconnection, backoff, and heartbeat handling.
- Auto-provision NDI or Browser Source ingest and manage scene tree updates per specification.
- Provide UI panels (Properties, Tools dialog) for device discovery, connection management, diagnostics, and preset actions.
- Expand test coverage using OBS unit test harness or a mocked API layer, including preset application flows.
- Package build scripts for Windows/macOS/Linux with CI configuration.
