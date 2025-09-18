#pragma once

#include <string>

namespace roc {

struct LayerState {
  std::string id;
  std::string name;
  bool visible = false;
};

}  // namespace roc
