#include "roc/RemoteStateStore.hpp"

#include <algorithm>

namespace roc {

void RemoteStateStore::set_layers(std::vector<RevisionedLayerState> layers) {
  std::scoped_lock lock(mutex_);
  layers_.clear();
  for (auto& layer : layers) {
    revision_ = std::max(revision_, layer.revision);
    layers_.emplace(layer.layer.id, std::move(layer));
  }
}

std::vector<RevisionedLayerState> RemoteStateStore::layers_snapshot() const {
  std::scoped_lock lock(mutex_);
  std::vector<RevisionedLayerState> snapshot;
  snapshot.reserve(layers_.size());
  for (const auto& [_, layer] : layers_) {
    snapshot.push_back(layer);
  }
  return snapshot;
}

std::optional<RevisionedLayerState> RemoteStateStore::update_visibility(
    const std::string& layer_id, bool visible, std::uint64_t revision) {
  std::scoped_lock lock(mutex_);
  auto it = layers_.find(layer_id);
  if (it == layers_.end()) {
    return std::nullopt;
  }
  if (revision <= it->second.revision) {
    return it->second;
  }
  it->second.layer.visible = visible;
  it->second.revision = revision;
  revision_ = std::max(revision_, revision);
  return it->second;
}

std::optional<RevisionedLayerState> RemoteStateStore::get_layer(const std::string& layer_id) const {
  std::scoped_lock lock(mutex_);
  auto it = layers_.find(layer_id);
  if (it == layers_.end()) {
    return std::nullopt;
  }
  return it->second;
}

void RemoteStateStore::upsert_layer(const LayerState& layer, std::uint64_t revision) {
  std::scoped_lock lock(mutex_);
  auto& entry = layers_[layer.id];
  entry.layer = layer;
  entry.revision = revision;
  revision_ = std::max(revision_, revision);
}

bool RemoteStateStore::remove_layer(const std::string& layer_id, std::uint64_t revision) {
  std::scoped_lock lock(mutex_);
  auto erased = layers_.erase(layer_id);
  if (erased > 0) {
    revision_ = std::max(revision_, revision);
    return true;
  }
  revision_ = std::max(revision_, revision);
  return false;
}

std::uint64_t RemoteStateStore::revision() const {
  std::scoped_lock lock(mutex_);
  return revision_;
}

}  // namespace roc
