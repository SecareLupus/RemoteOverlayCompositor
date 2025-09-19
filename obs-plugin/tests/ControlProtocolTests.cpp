#include "roc/ControlProtocol.hpp"

#include <cassert>
#include <nlohmann/json.hpp>
#include <string>

namespace roc::tests {

void run_control_protocol_tests() {
  HelloMessage hello;
  hello.client = "obs";
  hello.version = "1.0";
  hello.capabilities = {"layers", "presets"};
  hello.auth_token = std::string{"secret"};
  auto hello_json = nlohmann::json::parse(serialize_hello(hello));
  assert(hello_json.at("op") == "hello");
  assert(hello_json.at("client") == "obs");
  assert(hello_json.at("auth") == "secret");

  const std::string welcome_payload = R"JSON({
    "op": "welcome",
    "server": "compositor",
    "ver": "1.0",
    "deviceId": "dev1",
    "rev": 3,
    "heartbeatSec": 10,
    "layers": [
      {"id":"chat","name":"Chat","visible":true},
      {"id":"alerts","name":"Alerts","visible":false}
    ],
    "presets": [
      {"id":"brb","name":"BRB"}
    ]
  })JSON";

  auto welcome = parse_control_message(welcome_payload);
  assert(welcome.has_value());
  auto* welcome_msg = std::get_if<WelcomeEnvelope>(&welcome.value());
  assert(welcome_msg != nullptr);
  assert(welcome_msg->layers.size() == 2);
  assert(welcome_msg->presets.size() == 1);
  assert(welcome_msg->presets[0].id == "brb");

  const std::string state_payload = R"JSON({"op":"layer.state","layerId":"alerts","visible":true,"rev":4})JSON";
  auto state_msg = parse_control_message(state_payload);
  assert(state_msg.has_value());
  auto* layer_state = std::get_if<LayerStateUpdate>(&state_msg.value());
  assert(layer_state != nullptr);
  assert(layer_state->layer_id == "alerts");
  assert(layer_state->visible);
  assert(layer_state->revision == 4);

  const std::string invalid_payload = R"JSON({"foo":"bar"})JSON";
  std::string error;
  auto invalid = parse_control_message(invalid_payload, &error);
  assert(!invalid.has_value());
  assert(!error.empty());
}

}  // namespace roc::tests
