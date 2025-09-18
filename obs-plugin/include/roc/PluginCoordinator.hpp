#pragma once

#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "roc/LayerState.hpp"
#include "roc/RemoteStateStore.hpp"

namespace roc {

struct TransportHealth {
  bool ndi_available = false;
  bool webrtc_fallback = false;
  std::string details;
};

struct LayerBinding {
  std::string layer_id;
  std::string scene_item_id;
};

class PluginCoordinator {
 public:
  using VisibilityCallback = std::function<void(const std::string& layer_id, bool visible)>;

  explicit PluginCoordinator(std::shared_ptr<RemoteStateStore> state_store);

  void set_visibility_callback(VisibilityCallback callback);
  void on_remote_state(const std::vector<RevisionedLayerState>& layers);
  void on_remote_layer_upsert(const RevisionedLayerState& layer);
  void on_remote_layer_removed(const std::string& layer_id, std::uint64_t revision);
  void on_remote_visibility(const std::string& layer_id, bool visible, std::uint64_t revision);
  void on_local_visibility_changed(const std::string& layer_id, bool visible);
  [[nodiscard]] std::vector<LayerBinding> bindings() const;
  void bind_layer(const std::string& layer_id, const std::string& scene_item_id);
  [[nodiscard]] std::optional<LayerBinding> binding_for_scene_item(const std::string& scene_item_id) const;

 private:
  std::shared_ptr<RemoteStateStore> state_store_;
  VisibilityCallback visibility_callback_;
  std::unordered_map<std::string, LayerBinding> bindings_by_layer_;
  std::unordered_map<std::string, LayerBinding> bindings_by_scene_item_;
};

}  // namespace roc
