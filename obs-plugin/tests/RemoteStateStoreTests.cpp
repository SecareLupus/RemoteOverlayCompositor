#include "roc/RemoteStateStore.hpp"

#include <cassert>

namespace roc::tests {

void run_remote_state_store_tests() {
  RemoteStateStore store;
  store.set_layers({
      {.layer = {.id = "chat", .name = "Chat", .visible = true}, .revision = 1},
      {.layer = {.id = "alerts", .name = "Alerts", .visible = false}, .revision = 2},
  });

  auto before = store.get_layer("alerts");
  assert(before.has_value());
  assert(!before->layer.visible);

  auto update = store.update_visibility("alerts", true, 3);
  assert(update.has_value());
  auto after = store.get_layer("alerts");
  assert(after.has_value());
  assert(after->layer.visible);
  assert(after->revision == 3);
}

}  // namespace roc::tests
