#include <cstdlib>

namespace roc::tests {
void run_control_protocol_tests();
void run_remote_control_session_tests();
void run_remote_state_store_tests();
}  // namespace roc::tests

int main() {
  roc::tests::run_control_protocol_tests();
  roc::tests::run_remote_control_session_tests();
  roc::tests::run_remote_state_store_tests();
  return EXIT_SUCCESS;
}
