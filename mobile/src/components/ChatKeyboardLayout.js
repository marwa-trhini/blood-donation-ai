import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardInsets } from '../hooks/useKeyboardInsets';
import {
  getAndroidKeyboardLiftHeight,
  keyboardLayoutStyles,
} from '../utils/keyboardHelpers';

/**
 * Chat-style layout: header + scrollable messages + bottom composer (+ optional tab bar).
 * Lifts the composer above the Android keyboard using measured keyboard height.
 */
export default function ChatKeyboardLayout({
  header,
  footer,
  children,
  bottomBar = null,
  safeAreaStyle,
  safeAreaEdges = ['top'],
}) {
  const insets = useSafeAreaInsets();
  const { keyboardHeight, isKeyboardVisible } = useKeyboardInsets();

  const androidKeyboardLift = getAndroidKeyboardLiftHeight({
    keyboardHeight,
    isKeyboardVisible,
  });

  const showBottomBar = Boolean(bottomBar) && !isKeyboardVisible;

  return (
    <SafeAreaView style={[styles.safeArea, safeAreaStyle]} edges={safeAreaEdges}>
      {header}

      <KeyboardAvoidingView
        style={keyboardLayoutStyles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <View
          style={[
            keyboardLayoutStyles.flex,
            androidKeyboardLift > 0 && { paddingBottom: androidKeyboardLift },
          ]}
        >
          {children}
          {footer}
        </View>
      </KeyboardAvoidingView>

      {showBottomBar ? bottomBar : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
