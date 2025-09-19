#pragma once

#include <memory>
#include <string>

#include "roc/LayerState.hpp"

namespace roc {

class PluginCoordinator;

class RemoteLayerItem {
 public:
  RemoteLayerItem(std::string layer_id, std::weak_ptr<PluginCoordinator> coordinator);

  void set_visible(bool visible);
  [[nodiscard]] bool visible() const;
  [[nodiscard]] const std::string& layer_id() const;

 private:
  std::string layer_id_;
  bool visible_ = false;
  std::weak_ptr<PluginCoordinator> coordinator_;
};

}  // namespace roc
