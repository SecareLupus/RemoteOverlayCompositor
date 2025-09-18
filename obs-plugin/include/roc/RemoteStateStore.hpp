#pragma once

#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "roc/LayerState.hpp"

namespace roc {

struct RevisionedLayerState {
  LayerState layer;
  std::uint64_t revision = 0;
};

class RemoteStateStore {
 public:
  void set_layers(std::vector<RevisionedLayerState> layers);
  [[nodiscard]] std::vector<RevisionedLayerState> layers_snapshot() const;
  [[nodiscard]] std::optional<RevisionedLayerState> update_visibility(
      const std::string& layer_id, bool visible, std::uint64_t revision);
  [[nodiscard]] std::optional<RevisionedLayerState> get_layer(const std::string& layer_id) const;
  void upsert_layer(const LayerState& layer, std::uint64_t revision);
  bool remove_layer(const std::string& layer_id, std::uint64_t revision);
  [[nodiscard]] std::uint64_t revision() const;

 private:
  mutable std::mutex mutex_;
  std::unordered_map<std::string, RevisionedLayerState> layers_;
  std::uint64_t revision_ = 0;
};

}  // namespace roc
