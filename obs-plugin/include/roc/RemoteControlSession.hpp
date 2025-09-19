#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "roc/ControlProtocol.hpp"
#include "roc/ControlTransport.hpp"
#include "roc/PluginCoordinator.hpp"
#include "roc/RemoteStateStore.hpp"

namespace roc {

struct ConnectionConfig {
  std::string uri;
  std::string client_name = "obs-plugin";
  std::string version = "1.0";
  std::vector<std::string> capabilities = {"layers"};
  std::optional<std::string> auth_token;
};

class RemoteControlSession {
 public:
  RemoteControlSession(std::shared_ptr<PluginCoordinator> coordinator,
                       std::shared_ptr<RemoteStateStore> state_store,
                       ControlTransportPtr transport);

  void set_log_sink(std::function<void(const std::string&)> sink);
  void connect(const ConnectionConfig& config);
  void disconnect();
  void request_layer_sync();
  void handle_transport_message(std::string_view payload);

 private:
  enum class State { kIdle, kConnecting, kConnected };

  void send_hello();
  void on_open();
  void on_close();
  void on_error(const std::string& message);
  void process_message(const ControlOutboundMessage& message);
  void handle_welcome(const WelcomeEnvelope& welcome);
  void handle_layer_state(const LayerStateUpdate& update);
  void handle_layer_upsert(const LayerUpsertNotice& notice);
  void handle_layer_removed(const LayerRemovedNotice& notice);
  void handle_bulk_state(const LayerBulkState& bulk);
  void handle_preset_upsert(const PresetUpsertNotice& notice);
  void handle_preset_removed(const PresetRemovedNotice& notice);
  void handle_preset_applied(const PresetAppliedNotice& notice);
  void handle_error(const ErrorNotice& notice);
  void send_layer_visibility(const std::string& layer_id, bool visible);
  void log(const std::string& line);

  std::shared_ptr<PluginCoordinator> coordinator_;
  std::shared_ptr<RemoteStateStore> state_store_;
  ControlTransportPtr transport_;
  std::function<void(const std::string&)> log_sink_;
  ConnectionConfig config_;
  State state_ = State::kIdle;
  std::uint64_t local_revision_ = 0;
  std::unordered_map<std::string, PresetDefinition> presets_;
};

}  // namespace roc
