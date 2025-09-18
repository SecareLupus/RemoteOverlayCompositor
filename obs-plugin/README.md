# OBS Remote Overlay Plugin (Scaffold)

This directory contains a buildable C++20 scaffold for the OBS plugin described in the product brief. It does not yet link against the OBS SDK, but it now provides the state management core, protocol codec, and control-session state machine that will back the eventual plugin sources.

## Components

- **RemoteStateStore** – thread-safe cache of layer visibility and revision data, now supporting upsert/remove semantics.
- **PluginCoordinator** – orchestrates synchronization between OBS scene items and the remote compositor, exposing callbacks for visibility changes and reacting to remote layer lifecycle events.
- **ControlProtocol** – JSON serializer/deserializer for the compositor control messages, using `nlohmann::json`.
- **RemoteControlSession** – transport-agnostic controller that manages the WebSocket handshake, revision tracking, and keeps the `RemoteStateStore` synchronized. Tests exercise it with a fake transport.
- **RemoteLayerItem** – lightweight representation of a control-only OBS source that forwards local visibility changes to the coordinator.

Unit tests (currently simple `assert`-based executables) are available via `ctest` after configuring the project with CMake.

## Building

```bash
cmake -S . -B build
cmake --build build
ctest --test-dir build
```

Linking with OBS requires the official OBS headers and will be added in a later milestone.
