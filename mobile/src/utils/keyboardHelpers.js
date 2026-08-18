import { Platform, StyleSheet } from 'react-native';

import { useKeyboardInsets } from '../hooks/useKeyboardInsets';

/** KeyboardAvoidingView behavior — iOS uses padding; Android uses manual insets. */
export function getKeyboardAvoidingBehavior() {
  return Platform.OS === 'ios' ? 'padding' : undefined;
}

/** Bottom padding for scrollable forms when the keyboard is open (Login pattern). */
export function getScrollContentPaddingBottom(keyboardHeight, extraPadding = 24) {
  if (!keyboardHeight) {
    return extraPadding;
  }

  return keyboardHeight + extraPadding;
}

/** Lift fixed bottom UI by the keyboard height reported on Android. */
export function getAndroidKeyboardLiftHeight({ keyboardHeight, isKeyboardVisible }) {
  if (Platform.OS !== 'android' || !isKeyboardVisible || !keyboardHeight) {
    return 0;
  }

  return keyboardHeight;
}

/** Hook returning contentContainerStyle fragment for scrollable forms. */
export function useScrollKeyboardPadding(extraPadding = 24) {
  const { keyboardHeight, isKeyboardVisible } = useKeyboardInsets();

  if (!isKeyboardVisible) {
    return null;
  }

  return {
    paddingBottom: getScrollContentPaddingBottom(keyboardHeight, extraPadding),
  };
}

/** Shared TextInput props for readable, visible text on Android and iOS. */
export function getVisibleTextInputProps({
  cursorColor,
  multiline = false,
} = {}) {
  return {
    cursorColor,
    selectionColor: cursorColor,
    ...(Platform.OS === 'android'
      ? {
          includeFontPadding: false,
          textAlignVertical: multiline ? 'top' : 'center',
          underlineColorAndroid: 'transparent',
        }
      : null),
  };
}

export const keyboardLayoutStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
