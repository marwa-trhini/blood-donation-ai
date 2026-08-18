import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { registerLogoutConfirmationHandler, executeLogout } from '../utils/authHelpers';

const COLORS = {
  white: '#FFFFFF',
  primary: '#8B1E2D',
  text: '#2A2526',
  textSecondary: '#6F6869',
  softPinkLight: '#FCECEE',
  border: '#E5D5D7',
  cardShadow: 'rgba(139, 30, 45, 0.08)',
};

function LogoutConfirmationModal({ visible, onCancel, onConfirm, loggingOut }) {
  const { width } = useWindowDimensions();
  const modalWidth = Math.min(width * 0.88, 360);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable
          style={[styles.sheet, { width: modalWidth }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="log-out-outline" size={28} color={COLORS.primary} />
          </View>

          <Text style={styles.title}>Log out?</Text>
          <Text style={styles.message}>
            Are you sure you want to log out of BloodConnect?
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              disabled={loggingOut}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.logoutButton, loggingOut && styles.logoutButtonDisabled]}
              onPress={onConfirm}
              disabled={loggingOut}
              activeOpacity={0.85}
            >
              {loggingOut ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.logoutText}>Log Out</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function LogoutConfirmationProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const navigationRef = useRef(null);

  const showConfirmation = useCallback((navigation) => {
    navigationRef.current = navigation;
    setVisible(true);
  }, []);

  const handleCancel = useCallback(() => {
    if (loggingOut) {
      return;
    }

    setVisible(false);
    navigationRef.current = null;
  }, [loggingOut]);

  const handleConfirm = useCallback(async () => {
    const navigation = navigationRef.current;

    if (!navigation || loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await executeLogout(navigation);
      setVisible(false);
    } finally {
      setLoggingOut(false);
      navigationRef.current = null;
    }
  }, [loggingOut]);

  useEffect(() => {
    registerLogoutConfirmationHandler(showConfirmation);

    return () => {
      registerLogoutConfirmationHandler(null);
    };
  }, [showConfirmation]);

  return (
    <>
      {children}
      <LogoutConfirmationModal
        visible={visible}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
        loggingOut={loggingOut}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  sheet: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
  },

  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.softPinkLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  title: {
    fontSize: 23,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.3,
  },

  message: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 26,
    paddingHorizontal: 4,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },

  cancelButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },

  logoutButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  logoutButtonDisabled: {
    opacity: 0.75,
  },

  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default LogoutConfirmationModal;
