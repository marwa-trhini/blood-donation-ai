import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  primary: '#E53935',
  grayLight: '#9CA3AF',
  white: '#FFFFFF',
};

function formatBadgeCount(unreadCount) {
  if (unreadCount > 9) {
    return '9+';
  }

  return String(unreadCount);
}

export default function NotificationBellButton({ unreadCount = 0, onPress }) {
  const showBadge = unreadCount > 0;

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={
        showBadge ? `Notifications, ${unreadCount} unread` : 'Notifications'
      }
    >
      <Ionicons name="notifications-outline" size={24} color={COLORS.grayLight} />
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatBadgeCount(unreadCount)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
