import { StatusBar } from 'expo-status-bar';
import { useWindowDimensions, Image, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  primary: '#8B1E2D',
  primaryDark: '#641522',
  background: '#FFF8F8',
  softPink: '#F8DDE0',
  softPinkLight: '#FCECEE',
  text: '#2A2526',
  textSecondary: '#6F6869',
  white: '#FFFFFF',
};

const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

function WelcomeBottomDecor() {
  return (
    <View style={styles.bottomDecor} pointerEvents="none">
      <View style={styles.bottomWaveLarge} />
      <View style={styles.bottomWaveMedium} />
      <View style={styles.bottomWaveAccent} />
      <View style={styles.bottomHeartWrap}>
        <Ionicons name="heart-outline" size={28} color={COLORS.softPink} />
      </View>
    </View>
  );
}

export default function WelcomeScreen({ navigation }) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const heroHeight = Math.min(windowHeight * 0.48, 430);
  const contentMaxWidth = Math.min(windowWidth - SPACING.lg * 2, 420);
  const heroClipWidth = Math.min(windowWidth * 0.88, 380);
  const heroClipHeight = Math.min(heroHeight * 0.94, heroClipWidth * 1.08);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.container}>
        <View style={[styles.heroSection, { height: heroHeight }]}>
          <View
            style={[
              styles.heroOvalClip,
              {
                width: heroClipWidth,
                height: heroClipHeight,
                borderRadius: heroClipWidth / 2,
              },
            ]}
          >
            <View style={styles.heroOvalGlow} />
            <Image
              source={require('../../assets/welcome-hero.webp')}
              style={[
                styles.heroImage,
                {
                  width: heroClipWidth * 1.1,
                  height: heroClipHeight * 1.1,
                  marginTop: -(heroClipHeight * 0.03),
                },
              ]}
              resizeMode="cover"
              accessibilityLabel="Blood donation illustration showing donor, blood bag, and recipient"
            />
          </View>
        </View>

        <View style={[styles.contentSection, { maxWidth: contentMaxWidth }]}>
          <View style={styles.textBlock}>
            <Text style={styles.title}>BloodConnect</Text>
            <Text style={styles.subtitle}>Give Blood. Save Lives.</Text>
            <Text style={styles.description}>
              Donate blood. Find the help you need. Save lives in your community.
            </Text>
            <Text style={styles.descriptionSupport}>
              For donors and recipients, every connection can save a life.
            </Text>
          </View>

          <View style={styles.ctaBlock}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.88}
            >
              <View style={styles.primaryButtonIconWrap}>
                <Ionicons name="heart" size={16} color={COLORS.white} />
              </View>
              <Text style={styles.primaryButtonText}>Get Started</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.white} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
            >
              <Text style={styles.loginText}>
                Already have an account?{' '}
                <Text style={styles.loginLink}>Login</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <WelcomeBottomDecor />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },

  heroSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    position: 'relative',
  },

  heroOvalClip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.softPinkLight,
    shadowColor: COLORS.softPink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 4,
  },

  heroOvalGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.softPinkLight,
    opacity: 0.65,
  },

  heroImage: {
    alignSelf: 'center',
  },

  contentSection: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    justifyContent: 'space-between',
  },

  textBlock: {
    alignItems: 'center',
  },

  title: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },

  subtitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },

  description: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },

  descriptionSupport: {
    marginTop: SPACING.xs,
    fontSize: 13,
    lineHeight: 18,
    color: '#9A9293',
    textAlign: 'center',
    maxWidth: 300,
  },

  ctaBlock: {
    width: '100%',
    paddingBottom: SPACING.sm,
  },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    minHeight: 56,
    paddingHorizontal: SPACING.lg,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },

  primaryButtonIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  loginButton: {
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

  bottomDecor: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: -1,
  },

  bottomWaveLarge: {
    position: 'absolute',
    bottom: -80,
    left: -40,
    width: 280,
    height: 180,
    borderRadius: 140,
    backgroundColor: COLORS.softPink,
    opacity: 0.45,
  },

  bottomWaveMedium: {
    position: 'absolute',
    bottom: -100,
    right: -60,
    width: 260,
    height: 160,
    borderRadius: 130,
    backgroundColor: COLORS.softPinkLight,
    opacity: 0.7,
  },

  bottomWaveAccent: {
    position: 'absolute',
    bottom: -24,
    right: -20,
    width: 120,
    height: 90,
    borderTopLeftRadius: 80,
    borderTopRightRadius: 20,
    backgroundColor: COLORS.primary,
    opacity: 0.12,
  },

  bottomHeartWrap: {
    position: 'absolute',
    bottom: 28,
    right: 36,
    opacity: 0.35,
  },
});
