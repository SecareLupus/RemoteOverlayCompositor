# Stream Overlay Remote Compositor – With Fully‑Integrated OBS Plugin

**Version:** 1.0 (Draft)

**Audience:** Engineers (C++/OBS), Web devs (Node/TS), QA, DevOps, PMs

**Purpose:** Define a production‑grade system that renders all overlays on a remote compositor device while allowing streamers to control individual overlay layers using *native* OBS source visibility toggles (the “eye” icons). The plugin auto‑provisions an ingest source for the composite video feed and auto‑manages one control item per remote layer in a dedicated group.

---

## 1) Problem & Goals

### Problem

- OBS Browser Sources consume CPU/GPU and are brittle across platform/browser/CEF versions.
- Streamers want the convenience of OBS scene/source toggles without hosting/rendering overlays locally.

### Goals (must‑haves)

1. Render all overlays **remotely** on a headless compositor (SBC/server).
2. Ingest **one** pre‑composited video feed in OBS (primary: NDI; fallback: WebRTC Browser Source).
3. Control **each remote layer** via native OBS visibility toggles (per scene item) with 2‑way sync.
4. Automatic **setup and lifecycle**: discovery (mDNS), registration, layer list mirroring, reconnection.
5. Low latency (< 150 ms video ingest target LAN, control < 30 ms round‑trip).
6. Safe/obvious UI: a single group (e.g., **“Remote Compositor – Layers (DeviceName)”**) that contains control items representing layers.

### Non‑Goals (for v1)

- We do **not** implement transform/position/scale control (visibility only in v1).
- We do **not** provide arbitrary HTML rendering inside OBS.
- We do **not** ship a cloud relay. LAN first; WAN possible via user‑provided networking.

---

## 2) High‑Level Architecture

```
+-----------------------+          Control WS (JSON)          +------------------+
|      OBS (client)     |  <--------------------------------> |  Remote Compositor|
|  +-----------------+  |                                      |  (CEF mini-RT)   |
|  |  Plugin (C++)   |--|-- OBS API / Sources / UI             +---------+--------+
|  |  - RemoteComp.  |  |                                               |
|  |  - Layer Items  |  |                             Video (NDI)       |  (fallback: WebRTC Browser Source)
|  +----+-------+----+  |                                               |
|       |       |       |                                      +--------v---------+
|    NDI Ingest  |      |                                      |  NDI Sender      |
| (auto-provision)|      |                                      +------------------+
+-----------------------+
```

**Components**

- **Remote Compositor (server)**: Renders overlays via CEF; exposes WebSocket API; maintains authoritative layer state.
- **OBS Plugin (client)**: C++ plugin providing two source types:
  - **Remote Composite Source** (helper): auto‑adds/maintains the NDI ingest source (with WebRTC fallback) and the control group.
  - **Remote Overlay Layer** (control‑only): renders nothing; mirrors a single remote layer’s state and responds to show/hide.
- **Transport**: NDI for color+alpha (primary). **Fallback:** WebRTC Browser Source (v1). SRT/RIST dual‑stream alpha is a v2 option.

---

## 3) User Experience (UX)

1. User installs plugin. New menu: **Tools → Remote Compositor**.
2. On first run, user enters **Compositor URL** and **token**, **or uses mDNS discovery** to select from detected devices.
3. Plugin creates/updates:
   - An **NDI Source** (e.g., `RemoteCompositor (DeviceName)`) added to current scene. If NDI not detected/healthy, it provisions a **WebRTC Browser Source** fallback automatically.
   - A **group** `Remote Compositor – Layers (DeviceName)` with one **Remote Overlay Layer** item per `layerId` from the compositor.
4. User toggles the eye next to any layer item → the remote layer shows/hides in the composite feed.
5. If the compositor changes a layer (macro, timer, bot), the plugin updates the **eye** state accordingly.
6. Scenes can be duplicated; items persist and stay bound by `layerId`.

**UI affordances**

- Each layer item shows a friendly name and a dim secondary label `layerId`.
- Context menu: **Rename locally**, **Bind to different layerId**, **Jump to Compositor UI**.
- Group toolbar: **Refresh layers**, **Apply preset…**, **Reconnect**, **Diagnostics**.

---

## 4) Data & State Model

- **Authoritative state**: the compositor’s layer registry and visibility.
- **Plugin state** (per OBS profile/scene collection):
  - Connection profile(s): URL, token, device alias, transport preference.
  - Layer index: `layerId → item GUIDs (per scene)`.
  - Local overrides (user display names, ordering hints).
- **Scene‑item state**: OBS visibility (the “eye”); on change → emit `layer.setVisible`.
- **Revision**: Every state change carries `rev` (monotonic). The plugin drops stale updates.

---

## 5) Control Protocol (JSON over WebSocket)

**Handshake**

```jsonc
// Client → Server
{ "op":"hello", "client":"obs-plugin", "ver":"1.0", "caps":["layers","presets","transforms"], "auth":"<bearer>" }
// Server → Client
{ "op":"welcome", "server":"compositor", "ver":"1.0", "deviceId":"abc123", "rev":391,
  "layers":[{"id":"chat","name":"Chat Box","visible":true},{"id":"alerts","name":"Alerts","visible":false}],
  "presets":["BRB","StartingSoon"], "heartbeatSec":10 }
```

**Visibility**

```jsonc
// Client → Server
{ "op":"layer.setVisible", "layerId":"alerts", "visible":true, "rev":392, "source":"obs" }
// Server → Client (authoritative echo)
{ "op":"layer.state", "layerId":"alerts", "visible":true, "rev":392 }
```

**Bulk sync**

```jsonc
{ "op":"layer.list", "sinceRev":387 }
{ "op":"layer.bulkState", "rev":393, "layers":[{"id":"chat","visible":false}, {"id":"alerts","visible":true}] }
```

**Transforms (v1 subset, optional)**

```jsonc
{ "op":"layer.setTransform", "layerId":"chat", "t":{"x":0.12,"y":0.85,"scale":1.0,"rot":0} }
```

**Presets**

```jsonc
{ "op":"scene.applyPreset", "name":"BRB", "rev":440 }
```

**Heartbeat**

```jsonc
{ "op":"ping", "t":1731880000 }  →  { "op":"pong", "t":1731880000 }
```

**Errors**

```jsonc
{ "op":"error", "code":"UNKNOWN_LAYER","msg":"No layer with id 'alerts2'" }
```

---

## 6) Sequences (Happy Path)

**First connect & mirror**

```
Plugin → WS: hello(auth)
Server → Plugin: welcome(layers=[chat,alerts], rev=391)
Plugin: create/refresh NDI source + group + layer items
User: toggles eye on "alerts" → OBS emits show
Plugin: intercept show → WS: layer.setVisible(alerts,true,rev=392)
Server → Plugin: layer.state(alerts,true,rev=392)
Plugin: ensure OBS item visible (idempotent)
```

**Compositor‑driven change**

```
Server → Plugin: layer.state(chat,false,rev=500)
Plugin: set OBS eye off for chat in all scenes where present
```

**Reconnect**

```
WS closed → exponential backoff (1s..30s)
Plugin → hello(auth)
Server → welcome(rev=680)
Plugin → layer.list(sinceRev=last)
Server → layer.bulkState(rev=680,…)
Plugin: reconcile, apply diffs
```

---

## 7) OBS Integration Details

- **Plugin Language:** C++17/20 using OBS Studio SDK.
- **Build system:** CMake; GitHub Actions for triplet builds (Win/macOS/Linux x64; arm64 later).
- **NDI dependency:** Optional at build; if missing, enable **WebRTC fallback** ingest path.
- **WebSocket Client:** libwebsockets or Boost.Beast; JSON via RapidJSON.
- **Sources**
  - *Remote Composite Source* (`remote_composite_source`): a helper, not user‑visible in mixer; owns connection, maintains group and NDI ingest (with WebRTC fallback). Stores credentials.
  - *Remote Overlay Layer* (`remote_layer_source`): a control‑only source with properties `{layerId, displayName, bind}`; handles show/hide callbacks.
- **Show/Hide hooks:** Use `obs_source_update_properties`, `obs_source_show`, `obs_source_hide`, and scene‑item callbacks to catch visibility.
- **Group management:** Create/find group by deterministic name; keep items in that group ordered to match compositor’s `zIndex` (optional).
- **Idempotency:** All OBS mutations (create/move/hide) must be safe if already in desired state.
- **Threading:** Network on worker thread; OBS API calls marshalled to main thread via dispatcher.

OBS CPU\*\*: Negligible for control items; NDI/WebRTC ingest as per standard.

- **Layer scale (v1 target)**: Smooth UX with **50** mirrored layers; architecture should not hard‑limit growth beyond this—actual max depends on compositor horsepower and transport.
- **Profiling (v2)**: Built‑in per‑layer and aggregate render/transport profiler to flag heavy layers and detect lag.

---

## 11) Error Handling & Diagnostics

- **Status Pill** in group header: Connected • Degraded • Disconnected.
- **Self‑test**: Render a test layer and flip it every 500 ms on demand.
- **Logs**: Structured logs with `connectionId`, `sceneCollection`, `rev`.
- **User‑readable errors** with suggested actions (e.g., token expired; NDI stream absent).

---

## 12) Configuration & Persistence

- **Global** (per OBS profile): compositor endpoints, tokens, transport preference.
- **Per Scene Collection**: bound device, group presence, item mapping.
- **Import/Export**: JSON file for support cases.

---

## 13) API Surface (Plugin UI)

- **Tools → Remote Compositor**
  - Endpoint(s), Token
  - Device chooser via **mDNS discovery** (with manual override)
  - Transport: Auto | NDI | WebRTC
  - Buttons: *Connect*, *Refresh Layers*, *Open Web UI*, *Run Self‑Test*
- **Layer Item properties**
  - Display Name (local)
  - Bound `layerId` (with dropdown from server)
  - Lock visibility (ignore compositor changes)

---

## 14) Dev & Build Plan

1. **M1 – Skeleton** (2–3 weeks)
   - CMake project; minimal OBS plugin loading; settings dialog.
   - WS client; `hello/welcome`; console diagnostics.
2. **M2 – NDI Ingest + Group** (2 weeks)
   - Auto‑create NDI source; create group; add placeholder layer items.
3. **M3 – Visibility Sync** (2–3 weeks)
   - Scene‑item show/hide hooks → `layer.setVisible`; server → eye updates.
4. **M4 – Robustness** (2 weeks)
   - Reconnect, backoff, bulk sync, rev handling, idempotent reconcile.
5. **M5 – UX & Diagnostics** (1–2 weeks)
   - Status pill, self‑test, nice property panels.
6. **M6 – Fallback Transport (WebRTC)** (2 weeks)
   - Browser Source helper that negotiates WebRTC to the compositor; auto‑fallback logic and health checks.
7. **M7 – Packaging & QA** (2 weeks)
   - Installers (Win .exe, macOS pkg, Linux tar/deb/rpm), signing, regression suite.
   - WebRTC Browser Source helper, or SRT/RIST matte combiner (if feasible in v1).
8. **M7 – Packaging & QA** (2 weeks)
   - Installers (Win .exe, macOS pkg, Linux tar/deb/rpm), signing, regression suite.

---

## 15) QA Strategy

- **Unit**: protocol codec, rev logic, reconcile planner.
- **Integration**: fake server (Node) for deterministic scripts; OBS headless tests.
- **Latency**: tc/netem to inject jitter; assert p95 control latency.
- **Soak**: 12‑hour run, random toggles, scene switching.
- **UX**: manual matrix of OBS 30/31, Win/macOS/Linux.

---

## 16) Telemetry (Optional, opt‑in)

- Anonymous counts: connections, reconnections, avg layers mirrored, transport in use.
- Error codes frequency (to triage field issues quickly).

---

## 17) Risks & Mitigations

- **NDI licensing/availability** → Provide open transport fallback; compile‑time option.
- **OBS API changes** → Target LTS versions; adapter layer; CI against nightly.
- **Layer churn** (hundreds of layers) → Virtualize UI; paginate; lazy create items.
- **Feedback loops** → `rev` gate; dedupe identical state.
- **Multi‑OBS clients** → Single writer policy or last‑writer‑wins with server conflict resolution.

---

## 18) Future Enhancements

- Transform/position mirroring (beyond v1’s visibility‑only scope).
- Z‑order editing mapped to compositor.
- Per‑layer opacity/filters.
- **Preset enhancements**: timing and transform animations; cycling macros.
- **Profiler**: on‑device + plugin UI for per‑layer render cost and transport health.
- **Transport**: SRT/RIST color+alpha matte recombine path.
- Multi‑device orchestration (studio+backup).

---

## 19) Deliverables

- Signed OBS plugin binaries (Win/macOS/Linux) + source.
- Node.js reference compositor (or adapt to existing compositor) with matching protocol.
- Admin guide, User guide, Quickstart, Troubleshooting, Sample configs.

---

## 20) Acceptance Criteria (v1)

- Install plugin; enter URL/token; click Connect → group and items appear; NDI ingest added.
- Toggle any eye → remote layer visibility changes within 60 ms p95 on LAN.
- Kill the server; restore it → plugin resyncs without manual steps.
- Compositor hides a layer → OBS eye updates within 60 ms p95.
- 50+ layers mirrored without UI stutter.

---

## 21) Decisions Locked for v1

1. **Fallback path:** WebRTC Browser Source.
2. **Auth:** Bearer Token (mTLS optional in v2).
3. **Layer scale:** Design to comfortably handle \~50 layers; no hard cap.
4. **Controls:** **Visibility‑only** in v1; transforms deferred.
5. **Presets:** Include **transforms**; no timings in v1 (timings/animations in v2).
6. **Discovery:** mDNS on LAN to auto‑find compatible compositors.
7. **OBS support:** **OBS 30+**.

---

## 22) Glossary

- **Layer**: A logical overlay element rendered by the compositor (e.g., "Chat", "Alerts").
- **Control Item**: An OBS source that renders nothing but represents a remote layer for visibility.
- **Remote Composite Source**: Helper source that manages connection, group, ingest.
- **rev**: Monotonic revision to sequence state changes and avoid loops.

---

## 23) Appendix: Minimal Fake Server (Dev Testing, Node.js)

```js
// Run: node fake-server.js
import http from 'http';
import { WebSocketServer } from 'ws';
const layers = new Map([
  ['chat',{id:'chat',name:'Chat Box',visible:true}],
  ['alerts',{id:'alerts',name:'Alerts',visible:false}]
]);
let rev = 1;
const wss = new WebSocketServer({ server: http.createServer().listen(8080) });
wss.on('connection', ws => {
  ws.send(JSON.stringify({op:'welcome', server:'compositor', ver:'1.0', deviceId:'dev1', rev, layers:[...layers.values()], presets:['BRB'], heartbeatSec:10}));
  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.op === 'layer.setVisible') {
      const L = layers.get(msg.layerId); if (!L) return ws.send(JSON.stringify({op:'error',code:'UNKNOWN_LAYER'}));
      L.visible = !!msg.visible; rev++;
      wss.clients.forEach(c => c.send(JSON.stringify({op:'layer.state', layerId:L.id, visible:L.visible, rev})));
    }
  });
});
console.log('WS on ws://localhost:8080');
```

