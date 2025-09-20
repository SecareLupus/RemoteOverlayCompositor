#include "roc/RemoteControlSession.hpp"

#include <algorithm>
#include <type_traits>
#include <utility>

namespace roc {

RemoteControlSession::RemoteControlSession(std::shared_ptr<PluginCoordinator> coordinator,
                                           std::shared_ptr<RemoteStateStore> state_store,
                                           ControlTransportPtr transport)
    : coordinator_(std::move(coordinator)),
      state_store_(std::move(state_store)),
      transport_(std::move(transport)),
      log_sink_([](const std::string&) {}) {
  if (coordinator_) {
    coordinator_->set_visibility_callback(
        [this](const std::string& layer_id, bool visible) { send_layer_visibility(layer_id, visible); });
  }
  // TODO: Teach the coordinator about server-authoritative layer creation so
  //       we can present confirmation flows instead of blindly mirroring any
  //       new OBS scene items.
}

void RemoteControlSession::set_log_sink(std::function<void(const std::string&)> sink) {
  log_sink_ = std::move(sink);
}

void RemoteControlSession::connect(const ConnectionConfig& config) {
  if (!transport_) {
    log("No transport configured.");
    return;
  }
  config_ = config;
  state_ = State::kConnecting;
  transport_->open(config.uri,
                   [this]() { on_open(); },
                   [this](std::string_view payload) { handle_transport_message(payload); },
                   [this]() { on_close(); },
                   [this](const std::string& message) { on_error(message); });
}

void RemoteControlSession::disconnect() {
  if (transport_) {
    transport_->close();
  }
  state_ = State::kIdle;
}

void RemoteControlSession::request_layer_sync() {
  if (!transport_) {
    return;
  }
  transport_->send("{\"op\":\"layer.sync\"}");
}

void RemoteControlSession::handle_transport_message(std::string_view payload) {
  std::string error;
  auto message = parse_control_message(payload, &error);
  if (!message.has_value()) {
    if (!error.empty()) {
      log("Failed to parse control message: " + error);
    }
    return;
  }
  process_message(*message);
}

void RemoteControlSession::send_hello() {
  HelloMessage hello;
  hello.client = config_.client_name;
  hello.version = config_.version;
  hello.capabilities = config_.capabilities;
  hello.auth_token = config_.auth_token;
  // TODO: Attach pending WebRTC fallback negotiation hints (e.g., desired SDP
  //       role) once the compositor exposes the required signalling fields.
  if (transport_) {
    transport_->send(serialize_hello(hello));
  }
}

void RemoteControlSession::on_open() {
  log("Control transport open");
  local_revision_ = state_store_ ? state_store_->revision() : 0;
  send_hello();
}

void RemoteControlSession::on_close() {
  log("Control transport closed");
  state_ = State::kIdle;
}

void RemoteControlSession::on_error(const std::string& message) {
  log("Transport error: " + message);
}

void RemoteControlSession::process_message(const ControlOutboundMessage& message) {
  std::visit(
      [this](auto&& payload) {
        using T = std::decay_t<decltype(payload)>;
        if constexpr (std::is_same_v<T, WelcomeEnvelope>) {
          handle_welcome(payload);
        } else if constexpr (std::is_same_v<T, LayerStateUpdate>) {
          handle_layer_state(payload);
        } else if constexpr (std::is_same_v<T, LayerUpsertNotice>) {
          handle_layer_upsert(payload);
        } else if constexpr (std::is_same_v<T, LayerRemovedNotice>) {
          handle_layer_removed(payload);
        } else if constexpr (std::is_same_v<T, LayerBulkState>) {
          handle_bulk_state(payload);
        } else if constexpr (std::is_same_v<T, PresetUpsertNotice>) {
          handle_preset_upsert(payload);
        } else if constexpr (std::is_same_v<T, PresetRemovedNotice>) {
          handle_preset_removed(payload);
        } else if constexpr (std::is_same_v<T, ErrorNotice>) {
          handle_error(payload);
        }
      },
      message);
}

void RemoteControlSession::handle_welcome(const WelcomeEnvelope& welcome) {
  log("Received welcome from " + welcome.server + " device=" + welcome.device_id);
  state_ = State::kConnected;
  local_revision_ = std::max(local_revision_, welcome.revision);
  std::vector<RevisionedLayerState> layers;
  layers.reserve(welcome.layers.size());
  for (const auto& layer : welcome.layers) {
    layers.push_back({layer, welcome.revision});
  }
  if (coordinator_) {
    coordinator_->on_remote_state(layers);
  }
  presets_.clear();
  for (const auto& preset : welcome.presets) {
    presets_[preset.id] = preset;
  }
  // TODO: Request full preset definitions after connect if the handshake keeps
  //       shipping only summaries so preset UIs can hydrate visibility maps on
  //       demand.
}

void RemoteControlSession::handle_layer_state(const LayerStateUpdate& update) {
  local_revision_ = std::max(local_revision_, update.revision);
  if (coordinator_) {
    coordinator_->on_remote_visibility(update.layer_id, update.visible, update.revision);
  }
}

void RemoteControlSession::handle_layer_upsert(const LayerUpsertNotice& notice) {
  local_revision_ = std::max(local_revision_, notice.revision);
  if (coordinator_) {
    coordinator_->on_remote_layer_upsert({notice.layer, notice.revision});
  }
}

void RemoteControlSession::handle_layer_removed(const LayerRemovedNotice& notice) {
  local_revision_ = std::max(local_revision_, notice.revision);
  if (coordinator_) {
    coordinator_->on_remote_layer_removed(notice.layer_id, notice.revision);
  }
}

void RemoteControlSession::handle_bulk_state(const LayerBulkState& bulk) {
  local_revision_ = std::max(local_revision_, bulk.revision);
  std::vector<RevisionedLayerState> layers;
  layers.reserve(bulk.layers.size());
  for (const auto& layer : bulk.layers) {
    layers.push_back({layer, bulk.revision});
  }
  if (coordinator_) {
    coordinator_->on_remote_state(layers);
  }
}

void RemoteControlSession::handle_preset_upsert(const PresetUpsertNotice& notice) {
  local_revision_ = std::max(local_revision_, notice.revision);
  presets_[notice.preset.id] = notice.preset;
  log("Preset upserted: " + notice.preset.id);
}

void RemoteControlSession::handle_preset_removed(const PresetRemovedNotice& notice) {
  local_revision_ = std::max(local_revision_, notice.revision);
  presets_.erase(notice.preset_id);
  log("Preset removed: " + notice.preset_id);
}

void RemoteControlSession::handle_error(const ErrorNotice& notice) {
  log("Server error: " + notice.code + " - " + notice.message);
}

void RemoteControlSession::send_layer_visibility(const std::string& layer_id, bool visible) {
  if (state_ != State::kConnected || !transport_) {
    return;
  }
  local_revision_ = std::max(local_revision_, state_store_ ? state_store_->revision() : 0) + 1;
  // TODO: Reconcile this optimistic revision bump with the compositor's
  //       monotonic counter once the global revision contract is finalised so
  //       concurrent writers cannot desync.
  LayerSetVisibleCommand command;
  command.layer_id = layer_id;
  command.visible = visible;
  command.revision = local_revision_;
  command.source = "obs";
  transport_->send(serialize_layer_set_visible(command));
}

void RemoteControlSession::log(const std::string& line) {
  if (log_sink_) {
    log_sink_(line);
  }
}

}  // namespace roc
