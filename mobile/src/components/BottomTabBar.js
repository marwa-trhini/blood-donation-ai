import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getChatConversations, getCurrentUser } from '../services/api';
import { getProfileRouteForUser } from '../utils/authHelpers';

const COLORS = {
  white: '#FFFFFF',
  primary: '#8B1E2D',
  softPinkLight: '#FCECEE',
  grayLight: '#9CA3AF',
  border: '#E8D4D6',
};

const BOTTOM_NAV_ITEMS = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'requests', label: 'Requests', icon: 'water-outline' },
  {
    key: 'ai',
    label: 'AI',
    accessibilityLabel: 'AI Assistant',
    icon: 'sparkles-outline',
    isCenter: true,
  },
  { key: 'messages', label: 'Messages', icon: 'chatbubble-outline' },
  { key: 'profile', label: 'Profile', icon: 'person-outline' },
];

export const bottomTabBarSafeAreaStyle = {
  backgroundColor: COLORS.white,
  borderTopWidth: 1,
  borderTopColor: COLORS.border,
};

export default function BottomTabBar({
  activeKey,
  navigation,
  onHomePress,
  onRequestsPress,
  onAiPress,
  onMessagesPress,
  onProfilePress,
}) {
  const [messagesBadgeCount, setMessagesBadgeCount] = useState(0);

  const handleProfilePress = useCallback(async () => {
    if (navigation) {
      try {
        const data = await getCurrentUser();
        const user = data.user || data;
        navigation.navigate(getProfileRouteForUser(user));
        return;
      } catch (err) {
        console.warn('[BottomTabBar] Failed to resolve profile route:', err?.message);
      }
    }

    onProfilePress?.();
  }, [navigation, onProfilePress]);

  const handleAiPress = useCallback(() => {
    if (onAiPress) {
      onAiPress();
      return;
    }

    navigation?.navigate('AIAssistant');
  }, [navigation, onAiPress]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      getChatConversations()
        .then((data) => {
          if (!active) {
            return;
          }

          const total =
            typeof data.totalUnreadCount === 'number'
              ? data.totalUnreadCount
              : (data.conversations || []).reduce(
                  (sum, item) => sum + (item.unreadCount || 0),
                  0
                );

          setMessagesBadgeCount(total);
        })
        .catch(() => {
          if (active) {
            setMessagesBadgeCount(0);
          }
        });

      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <View style={styles.bottomNav}>
      {BOTTOM_NAV_ITEMS.map((item) => {
        const isActive = item.key === activeKey;
        const isCenterAi = item.isCenter === true;

        let onPress;
        if (item.key === 'home') onPress = onHomePress;
        else if (item.key === 'requests') onPress = onRequestsPress;
        else if (item.key === 'ai') onPress = handleAiPress;
        else if (item.key === 'messages') onPress = onMessagesPress;
        else if (item.key === 'profile') onPress = handleProfilePress;

        const showBadge = item.key === 'messages' && messagesBadgeCount > 0;
        const iconColor = isActive ? COLORS.primary : COLORS.grayLight;

        return (
          <TouchableOpacity
            key={item.key}
            style={styles.bottomNavItem}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={item.accessibilityLabel || item.label}
          >
            <View
              style={[
                styles.iconWrap,
                isCenterAi && styles.centerIconWrap,
                isCenterAi && isActive && styles.centerIconWrapActive,
              ]}
            >
              <Ionicons name={item.icon} size={isCenterAi ? 23 : 22} color={iconColor} />
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {messagesBadgeCount > 9 ? '9+' : String(messagesBadgeCount)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.bottomNavLabel, isActive && styles.bottomNavLabelActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: COLORS.white,
  },
  bottomNavItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    flex: 1,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  centerIconWrapActive: {
    backgroundColor: COLORS.softPinkLight,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  bottomNavLabel: {
    fontSize: 11,
    color: COLORS.grayLight,
    marginTop: 4,
    fontWeight: '500',
  },
  bottomNavLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});
