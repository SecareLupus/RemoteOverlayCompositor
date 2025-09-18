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
1. **Preset payload shape** – Should the handshake expose full visibility maps or only metadata, and how do large preset definitions impact initial sync performance?
2. **Authentication UX** – How is the bearer token provisioned/rotated inside OBS, and should the compositor expose additional diagnostics when auth fails?
3. **Revision contract** – Are presets expected to advance the global revision counter, and do clients require per-preset revisioning for conflict resolution?
4. **Layer creation lifecycle** – Does the plugin ever authoritatively create/delete layers, or should those operations remain server-driven with user confirmation flows?
5. **Transport fallback** – When the compositor falls back to WebRTC, how are SDP credentials surfaced over this control channel?
6. **Preset application feedback** – Beyond the current change list, should the server emit explicit success/failure codes for partial applications or validation errors?

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
