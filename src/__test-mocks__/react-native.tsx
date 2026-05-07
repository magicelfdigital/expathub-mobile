/**
 * Lightweight react-native mock for screen-level tests via
 * react-test-renderer. Each "component" is a thin host wrapper that
 * preserves children, props (testID, onPress, value, onChangeText, etc.)
 * so the test tree can find pressables and invoke their handlers.
 *
 * Animated.timing / Animated.Value are no-ops that synchronously invoke
 * the start() callback so tests don't have to wait for animations to
 * finish before tapping the next element.
 */
import * as React from "react";

type AnyProps = Record<string, any>;

function makeHost(name: string) {
  const C = React.forwardRef<unknown, AnyProps>((props, ref) => {
    const { children, ...rest } = props;
    return React.createElement(name, { ...rest, ref }, children);
  });
  C.displayName = name;
  return C;
}

export const View = makeHost("View");
export const Text = makeHost("Text");
export const ScrollView = makeHost("ScrollView");
export const Pressable = makeHost("Pressable");
export const TextInput = makeHost("TextInput");
export const ActivityIndicator = makeHost("ActivityIndicator");
export const Modal = makeHost("Modal");
export const Image = makeHost("Image");
export const SafeAreaView = makeHost("SafeAreaView");
export const FlatList = makeHost("FlatList");
export const KeyboardAvoidingView = makeHost("KeyboardAvoidingView");
export const TouchableOpacity = makeHost("TouchableOpacity");
export const Switch = makeHost("Switch");

export const StyleSheet = {
  create<T extends AnyProps>(styles: T): T {
    return styles;
  },
  flatten(s: any) {
    return Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s;
  },
  hairlineWidth: 1,
  absoluteFill: {},
  absoluteFillObject: {},
};

export const Platform = {
  OS: "ios" as "ios" | "android" | "web",
  select: (obj: AnyProps) => obj.ios ?? obj.default,
  Version: 17,
};

class AnimatedValue {
  private v: number;
  constructor(v: number) {
    this.v = v;
  }
  setValue(v: number) {
    this.v = v;
  }
  interpolate() {
    return this;
  }
}

const AnimatedTiming = (_value: AnimatedValue, _config: AnyProps) => ({
  start: (cb?: () => void) => {
    if (cb) cb();
  },
});

export const Animated = {
  Value: AnimatedValue,
  View: makeHost("Animated.View"),
  Text: makeHost("Animated.Text"),
  ScrollView: makeHost("Animated.ScrollView"),
  timing: AnimatedTiming,
  spring: AnimatedTiming,
  parallel: (anims: any[]) => ({
    start: (cb?: () => void) => {
      anims.forEach((a) => a?.start?.());
      if (cb) cb();
    },
  }),
  sequence: (anims: any[]) => ({
    start: (cb?: () => void) => {
      anims.forEach((a) => a?.start?.());
      if (cb) cb();
    },
  }),
  createAnimatedComponent: (C: any) => C,
};

export function useWindowDimensions() {
  return { width: 400, height: 800, scale: 2, fontScale: 1 };
}

export const Dimensions = {
  get: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
  addEventListener: () => ({ remove: () => {} }),
};

export const Alert = {
  alert: (..._args: any[]) => {},
};

export const Linking = {
  openURL: async (_url: string) => true,
  canOpenURL: async (_url: string) => true,
};

export const Keyboard = {
  dismiss: () => {},
};

export const InteractionManager = {
  runAfterInteractions: (cb: () => void) => {
    cb();
    return { cancel: () => {} };
  },
};

export const NativeModules = {};

export default {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  Image,
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Platform,
  Animated,
  useWindowDimensions,
  Dimensions,
  Alert,
  Linking,
  Keyboard,
  InteractionManager,
  NativeModules,
};
