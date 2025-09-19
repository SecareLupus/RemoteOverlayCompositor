#include "roc/RemoteLayerItem.hpp"

#include "roc/PluginCoordinator.hpp"

namespace roc {

RemoteLayerItem::RemoteLayerItem(std::string layer_id, std::weak_ptr<PluginCoordinator> coordinator)
    : layer_id_(std::move(layer_id)), coordinator_(std::move(coordinator)) {}

void RemoteLayerItem::set_visible(bool visible) {
  visible_ = visible;
  if (auto coord = coordinator_.lock()) {
    coord->on_local_visibility_changed(layer_id_, visible_);
  }
}

bool RemoteLayerItem::visible() const { return visible_; }

const std::string& RemoteLayerItem::layer_id() const { return layer_id_; }

}  // namespace roc
