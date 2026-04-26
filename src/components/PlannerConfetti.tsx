import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

const PIECES = ["🎉", "🎊", "✨", "⭐", "🥳"];
const NUM_PIECES = 28;

type Piece = {
  emoji: string;
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  rotateTo: number;
};

function buildPieces(width: number): Piece[] {
  return Array.from({ length: NUM_PIECES }, (_, i) => ({
    emoji: PIECES[i % PIECES.length],
    left: Math.random() * Math.max(width - 24, 24),
    size: 16 + Math.round(Math.random() * 18),
    delay: Math.round(Math.random() * 250),
    duration: 1400 + Math.round(Math.random() * 900),
    drift: (Math.random() - 0.5) * 80,
    rotateTo: (Math.random() - 0.5) * 720,
  }));
}

export function PlannerConfetti({
  visible,
  width,
  height,
  onComplete,
}: {
  visible: boolean;
  width: number;
  height: number;
  onComplete?: () => void;
}) {
  const pieces = useMemo(() => buildPieces(width || 360), [width]);
  const progress = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      fired.current = false;
      return;
    }
    if (fired.current) return;
    fired.current = true;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 2200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== "web",
    }).start(() => {
      onComplete?.();
    });
  }, [visible, progress, onComplete]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]}>
      {pieces.map((p, i) => {
        const translateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-40, height || 600],
        });
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, p.drift],
        });
        const rotate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${p.rotateTo}deg`],
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.1, 0.85, 1],
          outputRange: [0, 1, 1, 0],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                left: p.left,
                opacity,
                transform: [{ translateY }, { translateX }, { rotate }],
              },
            ]}
          >
            <Text style={{ fontSize: p.size }}>{p.emoji}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    zIndex: 50,
  },
  piece: {
    position: "absolute",
    top: 0,
  },
});
