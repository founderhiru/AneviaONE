/**
 * Manual mock for `react-native-gesture-handler` in tests. The real
 * package's v3 native gesture detectors reach into `react-native-reanimated`
 * internals at import time in a way the Jest/jsdom-less RN test environment
 * can't satisfy. Since this app only uses `GestureHandlerRootView` as a
 * plain wrapping View (for real gesture support on-device), a minimal
 * passthrough is enough for navigation/UI tests.
 */
const React = require('react');
const { View } = require('react-native');

function GestureHandlerRootView({ children, ...props }) {
  return React.createElement(View, props, children);
}

module.exports = {
  GestureHandlerRootView,
  Swipeable: View,
  DrawerLayout: View,
  State: {},
  ScrollView: require('react-native').ScrollView,
  Slider: View,
  Switch: require('react-native').Switch,
  TextInput: require('react-native').TextInput,
  ToolbarAndroid: View,
  ViewPagerAndroid: View,
  DrawerLayoutAndroid: View,
  WebView: View,
  NativeViewGestureHandler: View,
  TapGestureHandler: View,
  FlingGestureHandler: View,
  ForceTouchGestureHandler: View,
  LongPressGestureHandler: View,
  PanGestureHandler: View,
  PinchGestureHandler: View,
  RotationGestureHandler: View,
  RawButton: View,
  BaseButton: View,
  RectButton: View,
  BorderlessButton: View,
  FlatList: require('react-native').FlatList,
  gestureHandlerRootHOC: (Component) => Component,
  Directions: {},
};
