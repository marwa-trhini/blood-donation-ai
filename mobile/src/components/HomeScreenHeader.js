import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import NotificationBellButton from './NotificationBellButton';
import { confirmLogout, isDonorPrimaryRole, isRecipientPrimaryRole } from '../utils/authHelpers';
import { getCurrentUser } from '../services/api';

const COLORS = {
  background: '#FFF8F8',
  white: '#FFFFFF',
  primary: '#8B1E2D',
  primaryDark: '#641522',
  softPink: '#F8DDE0',
  text: '#2A2526',
  textSecondary: '#6F6869',
  gray: '#6F6869',
  grayLight: '#9CA3AF',
  border: '#E8D4D6',
};

const DONOR_MENU_ITEMS = [
  { key: 'home', label: 'Home', icon: 'home-outline', route: 'DonorHome' },
  {
    key: 'requests',
    label: 'Donation Requests',
    icon: 'water-outline',
    route: 'DonationRequests',
  },
  { key: 'profile', label: 'My Profile', icon: 'person-outline', route: 'DonorProfile' },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'notifications-outline',
    route: 'Notifications',
  },
  { key: 'rides', label: 'My Rides', icon: 'car-outline', route: 'MyRideRequests' },
  { key: 'hospitals', label: 'Hospitals', icon: 'business-outline', comingSoon: true },
  { key: 'messages', label: 'Messages', icon: 'chatbubble-outline', route: 'Messages' },
];

const LOGOUT_MENU_ITEM = {
  key: 'logout',
  label: 'Log Out',
  icon: 'log-out-outline',
  isLogout: true,
};

const RECIPIENT_MENU_ITEMS = [
  { key: 'home', label: 'Home', icon: 'home-outline', route: 'RecipientHome' },
  {
    key: 'requests',
    label: 'Donation Requests',
    icon: 'water-outline',
    route: 'RecipientDonationRequests',
  },
  {
    key: 'request-blood',
    label: 'Request Blood',
    icon: 'water',
    route: 'CreateBloodRequest',
  },
  {
    key: 'profile',
    label: 'My Profile',
    icon: 'person-outline',
    route: 'RecipientProfile',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'notifications-outline',
    route: 'Notifications',
  },
  { key: 'rides', label: 'My Rides', icon: 'car-outline', route: 'RecipientRideRequests' },
  { key: 'hospitals', label: 'Hospitals', icon: 'business-outline', comingSoon: true },
  { key: 'messages', label: 'Messages', icon: 'chatbubble-outline', route: 'Messages' },
];

function HomeMenuModal({ visible, items, onClose, onItemPress }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuOverlay} onPress={onClose}>
        <Pressable style={styles.menuSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.menuHeader}>
            <Text style={styles.menuTitle}>Menu</Text>
            <TouchableOpacity style={styles.menuCloseButton} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {items.map((item) => {
            const isDisabled = item.comingSoon === true;
            const isLogout = item.isLogout === true;

            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.menuItem,
                  isDisabled && styles.menuItemDisabled,
                  isLogout && styles.menuItemLogout,
                ]}
                onPress={() => onItemPress(item)}
                disabled={isDisabled}
                activeOpacity={isDisabled ? 1 : 0.75}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={isDisabled ? COLORS.grayLight : COLORS.primary}
                />
                <View style={styles.menuItemTextWrap}>
                  <Text style={[styles.menuItemLabel, isDisabled && styles.menuItemLabelDisabled]}>
                    {item.label}
                  </Text>
                  {isDisabled ? <Text style={styles.menuItemHint}>Coming soon</Text> : null}
                </View>
                {!isDisabled && !isLogout ? (
                  <Ionicons name="chevron-forward" size={18} color={COLORS.grayLight} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function HomeScreenHeader({ role, navigation, unreadCount = 0 }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [resolvedRole, setResolvedRole] = useState(role || 'donor');

  useEffect(() => {
    if (role) {
      setResolvedRole(role);
    }
  }, [role]);

  useEffect(() => {
    let isMounted = true;

    async function refreshRole() {
      try {
        const data = await getCurrentUser();
        const user = data.user || data;

        if (!isMounted) {
          return;
        }

        if (isRecipientPrimaryRole(user)) {
          setResolvedRole('recipient');
        } else if (isDonorPrimaryRole(user)) {
          setResolvedRole('donor');
        }
      } catch {
        // Keep the role supplied by the parent screen for menu items.
      }
    }

    refreshRole();

    return () => {
      isMounted = false;
    };
  }, []);

  const menuItems = useMemo(
    () => [
      ...(resolvedRole === 'recipient' ? RECIPIENT_MENU_ITEMS : DONOR_MENU_ITEMS),
      LOGOUT_MENU_ITEM,
    ],
    [resolvedRole]
  );

  const handleMenuItemPress = (item) => {
    if (item.isLogout) {
      setMenuVisible(false);
      confirmLogout(navigation);
      return;
    }

    if (item.comingSoon || !item.route) {
      return;
    }

    setMenuVisible(false);
    navigation.navigate(item.route);
  };

  return (
    <>
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <Ionicons name="menu" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <Text style={styles.brandText} numberOfLines={1} ellipsizeMode="tail">
            BloodConnect
          </Text>

          <NotificationBellButton
            unreadCount={unreadCount}
            onPress={() => navigation.navigate('Notifications')}
          />
        </View>

        <Text style={styles.tagline}>Saving lives, one donation at a time.</Text>
      </View>

      <View style={styles.headerDivider} />

      <HomeMenuModal
        visible={menuVisible}
        items={menuItems}
        onClose={() => setMenuVisible(false)}
        onItemPress={handleMenuItemPress}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    flex: 1,
    marginHorizontal: 4,
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.2,
  },
  tagline: {
    marginTop: 2,
    marginLeft: 48,
    marginRight: 48,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.gray,
    fontWeight: '500',
  },
  headerDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-start',
  },
  menuSheet: {
    width: '82%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: COLORS.white,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  menuCloseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuItemDisabled: {
    opacity: 0.85,
  },
  menuItemLogout: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderBottomWidth: 0,
  },
  menuItemTextWrap: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  menuItemLabelDisabled: {
    color: COLORS.gray,
  },
  menuItemHint: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.grayLight,
    fontWeight: '500',
  },
});
