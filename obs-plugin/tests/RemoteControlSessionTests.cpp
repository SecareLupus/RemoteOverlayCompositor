#include "roc/RemoteControlSession.hpp"

#include <cassert>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

class FakeTransport : public roc::ControlTransport {
 public:
  void open(const std::string& uri,
            OpenHandler on_open,
            MessageHandler on_message,
            CloseHandler on_close,
            ErrorHandler on_error) override {
    uri_ = uri;
    on_open_ = std::move(on_open);
    on_message_ = std::move(on_message);
    on_close_ = std::move(on_close);
    on_error_ = std::move(on_error);
  }

  void send(std::string_view payload) override { sent_messages_.emplace_back(payload); }

  void close() override {
    closed_ = true;
    if (on_close_) {
      on_close_();
    }
  }

  void trigger_open() {
    if (on_open_) {
      on_open_();
    }
  }

  void deliver(std::string_view payload) {
    if (on_message_) {
      on_message_(payload);
    }
  }

  const std::vector<std::string>& sent_messages() const { return sent_messages_; }
  bool closed() const { return closed_; }

 private:
  std::string uri_;
  OpenHandler on_open_;
  MessageHandler on_message_;
  CloseHandler on_close_;
  ErrorHandler on_error_;
  std::vector<std::string> sent_messages_;
  bool closed_ = false;
};

namespace roc::tests {

void run_remote_control_session_tests() {
  auto state_store = std::make_shared<RemoteStateStore>();
  auto coordinator = std::make_shared<PluginCoordinator>(state_store);
  auto transport = std::make_shared<FakeTransport>();
  RemoteControlSession session(coordinator, state_store, transport);
  session.set_log_sink([](const std::string&) {});

  ConnectionConfig config;
  config.uri = "ws://localhost/control";
  config.auth_token = std::string{"token"};
  session.connect(config);
  transport->trigger_open();

  assert(!transport->sent_messages().empty());
  auto hello_payload = nlohmann::json::parse(transport->sent_messages().front());
  assert(hello_payload.at("op") == "hello");
  assert(hello_payload.at("auth") == "token");

  const std::string welcome_payload = R"JSON({
    "op":"welcome",
    "server":"compositor",
    "ver":"1.0",
    "deviceId":"dev1",
    "rev":1,
    "heartbeatSec":10,
    "layers":[{"id":"chat","name":"Chat","visible":true},{"id":"alerts","name":"Alerts","visible":false}]
  })JSON";
  transport->deliver(welcome_payload);

  auto snapshot = state_store->layers_snapshot();
  assert(snapshot.size() == 2);
  auto alerts = state_store->get_layer("alerts");
  assert(alerts.has_value());
  assert(!alerts->layer.visible);

  const std::string visibility_payload = R"JSON({"op":"layer.state","layerId":"alerts","visible":true,"rev":2})JSON";
  transport->deliver(visibility_payload);
  alerts = state_store->get_layer("alerts");
  assert(alerts.has_value());
  assert(alerts->layer.visible);
  assert(alerts->revision == 2);

  coordinator->on_local_visibility_changed("chat", false);
  assert(transport->sent_messages().size() >= 2);
  auto set_visible = nlohmann::json::parse(transport->sent_messages().back());
  assert(set_visible.at("op") == "layer.setVisible");
  assert(set_visible.at("layerId") == "chat");
  assert(set_visible.at("visible") == false);

  const std::string upsert_payload = R"JSON({"op":"layer.upsert","layer":{"id":"ticker","name":"Ticker","visible":true},"rev":3,
"created":true})JSON";
  transport->deliver(upsert_payload);
  auto ticker = state_store->get_layer("ticker");
  assert(ticker.has_value());
  assert(ticker->layer.name == "Ticker");

  const std::string remove_payload = R"JSON({"op":"layer.removed","layerId":"alerts","rev":4})JSON";
  transport->deliver(remove_payload);
  alerts = state_store->get_layer("alerts");
  assert(!alerts.has_value());

  session.disconnect();
  assert(transport->closed());
}

}  // namespace roc::tests
