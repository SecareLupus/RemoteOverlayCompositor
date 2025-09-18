cmake_minimum_required(VERSION 3.22)
project(RemoteOverlayObsPlugin VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(remote_overlay_plugin STATIC
  src/ControlProtocol.cpp
  src/PluginCoordinator.cpp
  src/RemoteControlSession.cpp
  src/RemoteLayerItem.cpp
  src/RemoteStateStore.cpp
)

target_include_directories(remote_overlay_plugin
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party
)

target_compile_features(remote_overlay_plugin PUBLIC cxx_std_20)

enable_testing()
add_executable(remote_overlay_plugin_tests
  tests/TestMain.cpp
  tests/ControlProtocolTests.cpp
  tests/RemoteControlSessionTests.cpp
  tests/RemoteStateStoreTests.cpp
)

target_link_libraries(remote_overlay_plugin_tests PRIVATE remote_overlay_plugin)

add_test(NAME RemoteStateStoreTests COMMAND remote_overlay_plugin_tests)
