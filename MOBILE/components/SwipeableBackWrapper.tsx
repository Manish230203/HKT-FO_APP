import React, { useRef } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

interface SwipeableBackWrapperProps {
  children: React.ReactNode;
  enabled?: boolean;
  fallbackRoute?: string;
}

export function SwipeableBackWrapper({ children, enabled = true, fallbackRoute }: SwipeableBackWrapperProps) {
  const router = useRouter();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (fallbackRoute) {
      router.replace(fallbackRoute as any);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      // CAPTURE PHASE: Intercept swipe gesture BEFORE child ScrollViews consume the touch event!
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        if (!enabled) return false;
        const { pageX } = evt.nativeEvent;
        // Trigger capture if user swipes left-to-right (horizontal movement > 12px and dx > 1.5 * dy)
        const isHorizontalSwipe = gestureState.dx > 12 && gestureState.dx > Math.abs(gestureState.dy) * 1.4;
        const isLeftEdgeStart = pageX < 60 && gestureState.dx > 8;
        return isHorizontalSwipe || isLeftEdgeStart;
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 30 && Math.abs(gestureState.dy) < 90) {
          handleBack();
        }
      },
      onPanResponderTerminate: (evt, gestureState) => {
        if (gestureState.dx > 30 && Math.abs(gestureState.dy) < 90) {
          handleBack();
        }
      },
    })
  ).current;

  return (
    <View style={styles.flex1} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
});
