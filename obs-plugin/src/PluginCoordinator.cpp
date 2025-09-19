#include "roc/PluginCoordinator.hpp"

#include <algorithm>

namespace roc {

PluginCoordinator::PluginCoordinator(std::shared_ptr<RemoteStateStore> state_store)
    : state_store_(std::move(state_store)) {}

void PluginCoordinator::set_visibility_callback(VisibilityCallback callback) {
  visibility_callback_ = std::move(callback);
}

void PluginCoordinator::on_remote_state(const std::vector<RevisionedLayerState>& layers) {
  state_store_->set_layers(layers);
}

void PluginCoordinator::on_remote_layer_upsert(const RevisionedLayerState& layer) {
  state_store_->upsert_layer(layer.layer, layer.revision);
}

void PluginCoordinator::on_remote_layer_removed(const std::string& layer_id, std::uint64_t revision) {
  state_store_->remove_layer(layer_id, revision);
}

void PluginCoordinator::on_remote_visibility(
    const std::string& layer_id, bool visible, std::uint64_t revision) {
  (void)state_store_->update_visibility(layer_id, visible, revision);
}

void PluginCoordinator::on_local_visibility_changed(const std::string& layer_id, bool visible) {
  if (visibility_callback_) {
    visibility_callback_(layer_id, visible);
  }
}

std::vector<LayerBinding> PluginCoordinator::bindings() const {
  std::vector<LayerBinding> result;
  result.reserve(bindings_by_layer_.size());
  for (const auto& [_, binding] : bindings_by_layer_) {
    result.push_back(binding);
  }
  std::sort(result.begin(), result.end(), [](const auto& lhs, const auto& rhs) {
    return lhs.layer_id < rhs.layer_id;
  });
  return result;
}

void PluginCoordinator::bind_layer(const std::string& layer_id, const std::string& scene_item_id) {
  LayerBinding binding{layer_id, scene_item_id};
  bindings_by_layer_[layer_id] = binding;
  bindings_by_scene_item_[scene_item_id] = binding;
}

std::optional<LayerBinding> PluginCoordinator::binding_for_scene_item(
    const std::string& scene_item_id) const {
  auto it = bindings_by_scene_item_.find(scene_item_id);
  if (it == bindings_by_scene_item_.end()) {
    return std::nullopt;
  }
  return it->second;
}

}  // namespace roc
