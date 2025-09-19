# Remote Overlay Compositor

This repository houses two major workstreams:

1. **`compositor/`** – a Node.js/TypeScript prototype of the remote compositor control plane. It exposes the WebSocket protocol described in the product brief, a revision-aware HTTP API for managing layers/presets, and provides scaffolding for integrating a headless CEF renderer plus NDI output.
2. **`obs-plugin/`** – a CMake/C++20 scaffold of the OBS plugin, including core state-management primitives, a JSON protocol codec, a reconnectable control session, and unit tests that exercise the fake transport plus message parsing.

Status tracking, open questions, and follow-up tasks are documented in [`docs/STATUS.md`](docs/STATUS.md).
