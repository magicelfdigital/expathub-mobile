import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { tokens } from "@/theme/tokens";

interface DragBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeightFraction?: number;
  testID?: string;
}

export interface DragBottomSheetHandle {
  close: () => void;
}

export const DragBottomSheet = forwardRef<DragBottomSheetHandle, DragBottomSheetProps>(function DragBottomSheet({
  visible,
  onClose,
  children,
  maxHeightFraction = 0.85,
  testID,
}, ref) {
  const screenHeight = Dimensions.get("window").height;
  const sheetMaxHeight = Math.round(screenHeight * maxHeightFraction);
  const translateY = useRef(new Animated.Value(sheetMaxHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      dismissedRef.current = false;
      translateY.setValue(sheetMaxHeight);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 260,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    }
  }, [visible, sheetMaxHeight, translateY, backdropOpacity]);

  const animateClose = (vy = 0) => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    const duration = vy > 0.8 ? 160 : 220;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: sheetMaxHeight,
        duration,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start(() => {
      onClose();
    });
  };

  const snapOpen = () => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: Platform.OS !== "web",
      bounciness: 4,
    }).start();
  };

  useImperativeHandle(ref, () => ({ close: () => animateClose() }), []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          translateY.setValue(g.dy);
        }
      },
      onPanResponderRelease: (_, g) => {
        const shouldClose = g.dy > 120 || g.vy > 0.8;
        if (shouldClose) {
          animateClose(g.vy);
        } else {
          snapOpen();
        }
      },
    }),
  ).current;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => animateClose()}
    >
      <View style={StyleSheet.absoluteFill} testID={testID}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="auto"
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => animateClose()}
            testID="sheet-backdrop"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: sheetMaxHeight, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  handleArea: {
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: "center",
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(28,43,94,0.22)",
  },
});
