import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  View,
} from 'react-native';

import { checkEmailAvailability, registerUser } from '../services/api';
import {
  isValidEmailFormat,
  validateRegistrationFields,
} from '../utils/validation';
import KeyboardAwareScrollForm from '../components/KeyboardAwareScrollForm';
import { getVisibleTextInputProps } from '../utils/keyboardHelpers';

const EMAIL_CHECK_DEBOUNCE_MS = 600;
const DUPLICATE_EMAIL_MESSAGE =
  'An account with this email already exists. Please log in.';

const COLORS = {
  primary: '#8B1E2D',
  primaryDark: '#641522',
  background: '#FFF8F8',
  softPink: '#F8DDE0',
  softPinkLight: '#FCECEE',
  text: '#2A2526',
  textSecondary: '#6F6869',
  white: '#FFFFFF',
  border: '#E8D4D6',
  inputShadow: 'rgba(139, 30, 45, 0.08)',
  errorBg: '#FEE2E2',
  errorText: '#641522',
  placeholder: '#A3A3A3',
  logoBg: '#FFF0F1',
  successText: '#166534',
  successBg: '#DCFCE7',
};

const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

const RADIUS = {
  input: 16,
  button: 28,
  logo: 36,
};

function RegisterDecor() {
  return (
    <View style={styles.decorWrap} pointerEvents="none">
      <View style={styles.decorCurve} />
      <View style={styles.decorDrop}>
        <Text style={styles.decorDropIcon}>🩸</Text>
      </View>
      <View style={styles.decorHeart}>
        <Ionicons name="heart-outline" size={24} color={COLORS.softPink} />
      </View>
    </View>
  );
}

function RegisterInput({
  icon,
  placeholder,
  value,
  onChangeText,
  editable = true,
  secureTextEntry = false,
  showSecureToggle = false,
  secureVisible = false,
  onToggleSecure,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  onBlur,
  onFocus,
  focused = false,
  onFieldFocus,
}) {
  const handleFocus = (event) => {
    onFocus?.(event);
    onFieldFocus?.();
  };

  return (
    <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
      <Ionicons name={icon} size={20} color={focused ? COLORS.primary : COLORS.textSecondary} style={styles.inputIcon} />
      <TextInput
        style={[styles.input, showSecureToggle && styles.inputWithToggle]}
        placeholder={placeholder}
        placeholderTextColor={COLORS.placeholder}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        secureTextEntry={secureTextEntry && !secureVisible}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        onBlur={onBlur}
        onFocus={handleFocus}
        {...getVisibleTextInputProps({ cursorColor: COLORS.primary })}
      />
      {showSecureToggle ? (
        <TouchableOpacity
          style={styles.passwordToggle}
          onPress={onToggleSecure}
          disabled={!editable}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={secureVisible ? 'Hide password' : 'Show password'}
        >
          <Ionicons
            name={secureVisible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={COLORS.textSecondary}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function RegisterScreen() {
  const navigation = useNavigation();
  const scrollRef = useRef(null);
  const emailCheckRequestId = useRef(0);

  const scrollFocusedFieldIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [showLoginAction, setShowLoginAction] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState('');

  const showError = (message, options = {}) => {
    const nextMessage =
      (typeof message === 'string' && message.trim()) ||
      'Registration failed. Please try again.';

    setError(nextMessage);
    setShowLoginAction(Boolean(options.showLogin));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const runEmailAvailabilityCheck = async (value) => {
    const normalizedEmail = String(value || '')
      .trim()
      .toLowerCase();

    if (!normalizedEmail || !isValidEmailFormat(normalizedEmail)) {
      setCheckingEmail(false);
      setEmailStatus('');
      return;
    }

    const requestId = ++emailCheckRequestId.current;
    setCheckingEmail(true);

    try {
      const result = await checkEmailAvailability(normalizedEmail);

      if (requestId !== emailCheckRequestId.current) {
        return;
      }

      if (result.exists) {
        setEmailStatus('exists');
        setError(DUPLICATE_EMAIL_MESSAGE);
        setShowLoginAction(true);
      } else {
        setEmailStatus('available');
        if (error === DUPLICATE_EMAIL_MESSAGE) {
          setError('');
          setShowLoginAction(false);
        }
      }
    } catch (err) {
      if (requestId !== emailCheckRequestId.current) {
        return;
      }

      console.error('[RegisterScreen] Email check failed:', err?.message || err);
      setEmailStatus('');
    } finally {
      if (requestId === emailCheckRequestId.current) {
        setCheckingEmail(false);
      }
    }
  };

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !isValidEmailFormat(normalizedEmail)) {
      setCheckingEmail(false);
      setEmailStatus('');
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      runEmailAvailabilityCheck(normalizedEmail);
    }, EMAIL_CHECK_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [email]);

  const handleEmailChange = (value) => {
    setEmail(value);
    setEmailStatus('');
    setCheckingEmail(false);

    if (error === DUPLICATE_EMAIL_MESSAGE) {
      setError('');
      setShowLoginAction(false);
    }
  };

  const handleRegister = async () => {
    if (loading) {
      return;
    }

    const validation = validateRegistrationFields({
      fullName,
      email,
      phoneNumber,
      password,
      confirmPassword,
    });

    if (validation.error) {
      showError(validation.error, { showLogin: false });
      return;
    }

    setError('');
    setShowLoginAction(false);
    setLoading(true);

    try {
      const data = await registerUser(validation.values);

      await AsyncStorage.setItem('token', data.token);

      navigation.navigate('RoleSelection');
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        (typeof err?.data?.message === 'string' && err.data.message.trim()) ||
        'Registration failed. Please try again.';

      const shouldShowLogin =
        err?.status === 409 ||
        /already exists/i.test(message) ||
        /please log in/i.test(message);

      if (shouldShowLogin) {
        setEmailStatus('exists');
      }

      showError(message, { showLogin: shouldShowLogin });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.screenBody}>
        <RegisterDecor />

        <KeyboardAwareScrollForm
          scrollRef={scrollRef}
          style={styles.formScroll}
          contentContainerStyle={styles.scrollContent}
          extraBottomPadding={SPACING.lg}
        >
            <View style={styles.content}>
              <View style={styles.header}>
                <View style={styles.logoWrap}>
                  <Text style={styles.logoIcon}>🩸</Text>
                </View>
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>Join BloodConnect and help save lives.</Text>
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {showLoginAction ? (
                <TouchableOpacity
                  style={styles.loginActionButton}
                  onPress={() => navigation.navigate('Login')}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.loginActionButtonText}>Go to Login</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.form}>
                <RegisterInput
                  icon="person-outline"
                  placeholder="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  editable={!loading}
                  focused={focusedField === 'fullName'}
                  onFocus={() => setFocusedField('fullName')}
                  onBlur={() => setFocusedField('')}
                />

                <RegisterInput
                  icon="mail-outline"
                  placeholder="Email"
                  value={email}
                  onChangeText={handleEmailChange}
                  onBlur={() => {
                    setFocusedField('');
                    runEmailAvailabilityCheck(email);
                  }}
                  editable={!loading}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  focused={focusedField === 'email'}
                  onFocus={() => setFocusedField('email')}
                />

                {checkingEmail ? (
                  <Text style={styles.emailStatusChecking}>Checking email...</Text>
                ) : null}

                {!checkingEmail && emailStatus === 'available' ? (
                  <Text style={styles.emailStatusAvailable}>Email is available.</Text>
                ) : null}

                {!checkingEmail && emailStatus === 'exists' ? (
                  <Text style={styles.emailStatusExists}>{DUPLICATE_EMAIL_MESSAGE}</Text>
                ) : null}

                <RegisterInput
                  icon="call-outline"
                  placeholder="Phone Number (e.g. 03xxxxxx)"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  editable={!loading}
                  keyboardType="phone-pad"
                  focused={focusedField === 'phoneNumber'}
                  onFocus={() => setFocusedField('phoneNumber')}
                  onBlur={() => setFocusedField('')}
                />

                <RegisterInput
                  icon="lock-closed-outline"
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                  secureTextEntry
                  showSecureToggle
                  secureVisible={showPassword}
                  onToggleSecure={() => setShowPassword((current) => !current)}
                  focused={focusedField === 'password'}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField('')}
                  onFieldFocus={scrollFocusedFieldIntoView}
                />

                <RegisterInput
                  icon="lock-closed-outline"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!loading}
                  secureTextEntry
                  showSecureToggle
                  secureVisible={showConfirmPassword}
                  onToggleSecure={() => setShowConfirmPassword((current) => !current)}
                  focused={focusedField === 'confirmPassword'}
                  onFocus={() => setFocusedField('confirmPassword')}
                  onBlur={() => setFocusedField('')}
                  onFieldFocus={scrollFocusedFieldIntoView}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleRegister}
                  disabled={loading}
                  activeOpacity={0.88}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Create Account</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                disabled={loading}
                activeOpacity={0.7}
                style={styles.loginWrap}
              >
                <Text style={styles.loginText}>
                  Already have an account?{' '}
                  <Text style={styles.loginLink}>Login</Text>
                </Text>
              </TouchableOpacity>
            </View>
        </KeyboardAwareScrollForm>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  flex: {
    flex: 1,
  },

  screenBody: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  formScroll: {
    flex: 1,
    zIndex: 1,
  },

  decorWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },

  decorCurve: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.softPink,
    opacity: 0.35,
  },

  decorDrop: {
    position: 'absolute',
    bottom: 120,
    left: -18,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.softPinkLight,
    opacity: 0.55,
    alignItems: 'center',
    justifyContent: 'center',
  },

  decorDropIcon: {
    fontSize: 28,
    opacity: 0.45,
  },

  decorHeart: {
    position: 'absolute',
    bottom: 48,
    right: 28,
    opacity: 0.35,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },

  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    zIndex: 1,
  },

  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },

  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.logo,
    backgroundColor: COLORS.logoBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },

  logoIcon: {
    fontSize: 32,
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: SPACING.xs,
  },

  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },

  errorBanner: {
    backgroundColor: COLORS.errorBg,
    borderRadius: RADIUS.input,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  errorText: {
    color: COLORS.errorText,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  loginActionButton: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.input,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },

  loginActionButtonText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
  },

  form: {
    gap: SPACING.md,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 52,
    shadowColor: COLORS.inputShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },

  inputWrapFocused: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.12,
  },

  inputIcon: {
    marginLeft: SPACING.md,
  },

  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: SPACING.sm,
    fontSize: 16,
    color: COLORS.text,
  },

  inputWithToggle: {
    paddingRight: 4,
  },

  passwordToggle: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emailStatusChecking: {
    marginTop: -4,
    marginBottom: -4,
    color: COLORS.textSecondary,
    fontSize: 13,
    paddingHorizontal: SPACING.xs,
  },

  emailStatusAvailable: {
    marginTop: -4,
    marginBottom: -4,
    color: COLORS.successText,
    fontSize: 13,
    paddingHorizontal: SPACING.xs,
  },

  emailStatusExists: {
    marginTop: -4,
    marginBottom: -4,
    color: COLORS.errorText,
    fontSize: 13,
    paddingHorizontal: SPACING.xs,
  },

  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
    minHeight: 56,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },

  primaryButtonDisabled: {
    opacity: 0.75,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  loginWrap: {
    marginTop: SPACING.lg,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },

  loginText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  loginLink: {
    color: COLORS.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
