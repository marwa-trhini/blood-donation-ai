import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useKeyboardInsets } from '../hooks/useKeyboardInsets';
import {
  getKeyboardAvoidingBehavior,
  getScrollContentPaddingBottom,
  keyboardLayoutStyles,
} from '../utils/keyboardHelpers';

/**
 * Scrollable form layout used by Login, Register, profiles, and other TextInput screens.
 * Applies the same Android keyboard padding strategy that makes Login work.
 */
export default function KeyboardAwareScrollForm({
  scrollRef,
  children,
  contentContainerStyle,
  extraBottomPadding = 24,
  scrollViewProps = {},
  style,
}) {
  const { keyboardHeight, isKeyboardVisible } = useKeyboardInsets();

  return (
    <KeyboardAvoidingView
      style={[keyboardLayoutStyles.flex, style]}
      behavior={getKeyboardAvoidingBehavior()}
    >
      <ScrollView
        ref={scrollRef}
        style={keyboardLayoutStyles.flex}
        contentContainerStyle={[
          contentContainerStyle,
          isKeyboardVisible && {
            paddingBottom: getScrollContentPaddingBottom(keyboardHeight, extraBottomPadding),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
