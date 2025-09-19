#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <variant>
#include <vector>

#include "roc/LayerState.hpp"

namespace roc {

struct HelloMessage {
  std::string client;
  std::string version = "1.0";
  std::vector<std::string> capabilities;
  std::optional<std::string> auth_token;
};

struct LayerSetVisibleCommand {
  std::string layer_id;
  bool visible = false;
  std::uint64_t revision = 0;
  std::string source = "obs";
};

struct PresetDefinition {
  std::string id;
  std::string name;
  std::string description;
  std::unordered_map<std::string, bool> visibility;
};

struct WelcomeEnvelope {
  std::string server;
  std::string version;
  std::string device_id;
  std::uint64_t revision = 0;
  std::vector<LayerState> layers;
  std::vector<PresetDefinition> presets;
  std::uint32_t heartbeat_seconds = 0;
};

struct LayerStateUpdate {
  std::string layer_id;
  bool visible = false;
  std::uint64_t revision = 0;
};

struct LayerUpsertNotice {
  LayerState layer;
  std::uint64_t revision = 0;
  bool created = false;
};

struct LayerRemovedNotice {
  std::string layer_id;
  std::uint64_t revision = 0;
};

struct LayerBulkState {
  std::vector<LayerState> layers;
  std::uint64_t revision = 0;
};

struct PresetUpsertNotice {
  PresetDefinition preset;
  std::uint64_t revision = 0;
  bool created = false;
};

struct PresetRemovedNotice {
  std::string preset_id;
  std::uint64_t revision = 0;
};

struct PresetAppliedChange {
  std::string layer_id;
  bool visible = false;
  std::uint64_t revision = 0;
};

struct PresetAppliedNotice {
  std::string preset_id;
  std::vector<PresetAppliedChange> changes;
};

struct ErrorNotice {
  std::string code;
  std::string message;
};

using ControlInboundCommand = LayerSetVisibleCommand;

using ControlOutboundMessage = std::variant<WelcomeEnvelope,
                                            LayerStateUpdate,
                                            LayerUpsertNotice,
                                            LayerRemovedNotice,
                                            LayerBulkState,
                                            PresetUpsertNotice,
                                            PresetRemovedNotice,
                                            PresetAppliedNotice,
                                            ErrorNotice>;

std::string serialize_hello(const HelloMessage& hello);
std::string serialize_layer_set_visible(const LayerSetVisibleCommand& command);
std::optional<ControlOutboundMessage> parse_control_message(std::string_view payload,
                                                            std::string* error_message = nullptr);

}  // namespace roc
