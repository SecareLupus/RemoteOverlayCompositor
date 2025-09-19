#pragma once

#include <functional>
#include <memory>
#include <string>
#include <string_view>

namespace roc {

class ControlTransport {
 public:
  using OpenHandler = std::function<void()>;
  using MessageHandler = std::function<void(std::string_view)>;
  using CloseHandler = std::function<void()>;
  using ErrorHandler = std::function<void(const std::string&)>;

  virtual ~ControlTransport() = default;

  virtual void open(const std::string& uri,
                    OpenHandler on_open,
                    MessageHandler on_message,
                    CloseHandler on_close,
                    ErrorHandler on_error) = 0;
  virtual void send(std::string_view payload) = 0;
  virtual void close() = 0;
};

using ControlTransportPtr = std::shared_ptr<ControlTransport>;

}  // namespace roc
