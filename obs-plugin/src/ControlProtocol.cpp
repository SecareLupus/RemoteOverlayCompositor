#include "roc/ControlProtocol.hpp"

#include <nlohmann/json.hpp>

namespace roc {
namespace {

LayerState parse_layer(const nlohmann::json& json_layer) {
  LayerState layer;
  layer.id = json_layer.at("id").get<std::string>();
  layer.name = json_layer.value("name", layer.id);
  layer.visible = json_layer.value("visible", false);
  return layer;
}

PresetDefinition parse_preset(const nlohmann::json& json_preset) {
  PresetDefinition preset;
  preset.id = json_preset.at("id").get<std::string>();
  preset.name = json_preset.value("name", preset.id);
  preset.description = json_preset.value("description", std::string{});
  if (json_preset.contains("visibility")) {
    for (const auto& [key, value] : json_preset.at("visibility").items()) {
      preset.visibility[key] = value.get<bool>();
    }
  }
  return preset;
}

}  // namespace

std::string serialize_hello(const HelloMessage& hello) {
  nlohmann::json payload{
      {"op", "hello"},
      {"client", hello.client},
      {"ver", hello.version},
  };
  if (!hello.capabilities.empty()) {
    payload["caps"] = hello.capabilities;
  }
  if (hello.auth_token.has_value()) {
    payload["auth"] = *hello.auth_token;
  }
  return payload.dump();
}

std::string serialize_layer_set_visible(const LayerSetVisibleCommand& command) {
  nlohmann::json payload{
      {"op", "layer.setVisible"},
      {"layerId", command.layer_id},
      {"visible", command.visible},
      {"rev", command.revision},
  };
  if (!command.source.empty()) {
    payload["source"] = command.source;
  }
  return payload.dump();
}

std::optional<ControlOutboundMessage> parse_control_message(std::string_view payload,
                                                            std::string* error_message) {
  try {
    const auto json = nlohmann::json::parse(payload.begin(), payload.end());
    if (!json.contains("op")) {
      if (error_message) {
        *error_message = "Missing op field";
      }
      return std::nullopt;
    }
    const auto op = json.at("op").get<std::string>();
    if (op == "welcome") {
      WelcomeEnvelope welcome;
      welcome.server = json.value("server", std::string{});
      welcome.version = json.value("ver", std::string{});
      welcome.device_id = json.value("deviceId", std::string{});
      welcome.revision = json.value("rev", static_cast<std::uint64_t>(0));
      welcome.heartbeat_seconds = json.value("heartbeatSec", static_cast<std::uint32_t>(0));
      // TODO: Capture compositor-provided WebRTC negotiation blobs (SDP, ICE)
      //       alongside the welcome envelope once those fields are defined so
      //       the plugin can configure the browser-source fallback automatically.
      if (json.contains("layers")) {
        for (const auto& layer_json : json.at("layers")) {
          welcome.layers.push_back(parse_layer(layer_json));
        }
      }
      if (json.contains("presets")) {
        for (const auto& preset_json : json.at("presets")) {
          welcome.presets.push_back(parse_preset(preset_json));
        }
      }
      return welcome;
    }
    if (op == "layer.state") {
      LayerStateUpdate update;
      update.layer_id = json.at("layerId").get<std::string>();
      update.visible = json.value("visible", false);
      update.revision = json.value("rev", static_cast<std::uint64_t>(0));
      return update;
    }
    if (op == "layer.upsert") {
      LayerUpsertNotice notice;
      notice.layer = parse_layer(json.at("layer"));
      notice.revision = json.value("rev", static_cast<std::uint64_t>(0));
      notice.created = json.value("created", false);
      return notice;
    }
    if (op == "layer.removed") {
      LayerRemovedNotice notice;
      notice.layer_id = json.at("layerId").get<std::string>();
      notice.revision = json.value("rev", static_cast<std::uint64_t>(0));
      return notice;
    }
    if (op == "layer.bulkState") {
      LayerBulkState bulk;
      bulk.revision = json.value("rev", static_cast<std::uint64_t>(0));
      if (json.contains("layers")) {
        for (const auto& layer_json : json.at("layers")) {
          bulk.layers.push_back(parse_layer(layer_json));
        }
      }
      return bulk;
    }
    if (op == "preset.upsert") {
      PresetUpsertNotice notice;
      notice.preset = parse_preset(json.at("preset"));
      notice.revision = json.value("rev", static_cast<std::uint64_t>(0));
      notice.created = json.value("created", false);
      return notice;
    }
    if (op == "preset.removed") {
      PresetRemovedNotice notice;
      notice.preset_id = json.at("presetId").get<std::string>();
      notice.revision = json.value("rev", static_cast<std::uint64_t>(0));
      return notice;
    }
    if (op == "error") {
      ErrorNotice notice;
      notice.code = json.value("code", std::string{"UNKNOWN"});
      notice.message = json.value("message", std::string{});
      return notice;
    }
    if (error_message) {
      *error_message = "Unsupported op: " + op;
    }
    return std::nullopt;
  } catch (const std::exception& ex) {
    if (error_message) {
      *error_message = ex.what();
    }
    return std::nullopt;
  }
}

}  // namespace roc
