import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  getCurrentUser,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../services/api';

const COLORS = {
  background: '#FFF8F8',
  white: '#FFFFFF',
  primary: '#8B1E2D',
  primaryDark: '#641522',
  softPink: '#F8DDE0',
  softPinkLight: '#FCECEE',
  text: '#2A2526',
  textSecondary: '#6F6869',
  grayLight: '#9A9495',
  border: '#E8D4D6',
  cardShadow: 'rgba(139, 30, 45, 0.08)',
  errorBg: '#FEE2E2',
  errorText: '#641522',
  green: '#166534',
  greenBg: '#DDF6E7',
  blue: '#1D4ED8',
  blueBg: '#DBEAFE',
  orange: '#C2410C',
  orangeBg: '#FFEDD5',
  cancelledBg: '#FEE2E2',
  cancelledText: '#991B1B',
};

function formatRelativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return 'Just now';
  }

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMins / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getNotificationStyle(type) {
  switch (type) {
    case 'donation_request':
    case 'emergency_blood_request':
      return {
        name: 'water-outline',
        color: COLORS.primary,
        bg: COLORS.softPinkLight,
        set: 'ionicons',
      };
    case 'donation_accepted':
    case 'donation_completed':
      return {
        name: 'checkmark-circle-outline',
        color: COLORS.green,
        bg: COLORS.greenBg,
        set: 'ionicons',
      };
    case 'donation_declined':
    case 'donation_cancelled':
      return {
        name: 'close-circle-outline',
        color: COLORS.cancelledText,
        bg: COLORS.cancelledBg,
        set: 'ionicons',
      };
    case 'blood_request_update':
      return {
        name: 'refresh-circle-outline',
        color: COLORS.primary,
        bg: COLORS.softPinkLight,
        set: 'ionicons',
      };
    case 'ride_requested':
      return {
        name: 'car-outline',
        color: COLORS.orange,
        bg: COLORS.orangeBg,
        set: 'ionicons',
      };
    case 'ride_accepted':
      return {
        name: 'car-outline',
        color: COLORS.green,
        bg: COLORS.greenBg,
        set: 'ionicons',
      };
    case 'ride_completed':
      return {
        name: 'checkmark-circle-outline',
        color: COLORS.blue,
        bg: COLORS.blueBg,
        set: 'ionicons',
      };
    case 'ride_cancelled':
      return {
        name: 'close-circle-outline',
        color: COLORS.cancelledText,
        bg: COLORS.cancelledBg,
        set: 'ionicons',
      };
    case 'chat_message':
      return {
        name: 'chatbubble-outline',
        color: COLORS.primary,
        bg: COLORS.softPinkLight,
        set: 'ionicons',
      };
    default:
      return {
        name: 'notifications-outline',
        color: COLORS.textSecondary,
        bg: '#F3F4F6',
        set: 'ionicons',
      };
  }
}

function isDonorUser(user) {
  return (
    user?.primaryRole === 'donor' ||
    (Array.isArray(user?.roles) && user.roles.includes('donor'))
  );
}

function isRecipientUser(user) {
  return (
    user?.primaryRole === 'recipient' ||
    (Array.isArray(user?.roles) && user.roles.includes('recipient'))
  );
}

function getNotificationDestination(type, user) {
  switch (type) {
    case 'donation_request':
    case 'donation_cancelled':
      return isDonorUser(user) ? 'DonationRequests' : null;
    case 'donation_accepted':
    case 'donation_declined':
      return isRecipientUser(user) ? 'RecipientDonationRequests' : null;
    case 'donation_completed':
      if (isDonorUser(user) && !isRecipientUser(user)) {
        return 'DonationRequests';
      }

      if (isRecipientUser(user) && !isDonorUser(user)) {
        return 'RecipientDonationRequests';
      }

      return user?.primaryRole === 'recipient'
        ? 'RecipientDonationRequests'
        : 'DonationRequests';
    case 'ride_requested':
      return isRecipientUser(user) ? 'RecipientRideRequests' : null;
    case 'ride_accepted':
      return isDonorUser(user) ? 'MyRideRequests' : null;
    case 'ride_cancelled':
    case 'ride_completed':
      if (isDonorUser(user) && !isRecipientUser(user)) {
        return 'MyRideRequests';
      }

      if (isRecipientUser(user)) {
        return 'RecipientRideRequests';
      }

      return isDonorUser(user) ? 'MyRideRequests' : null;
    case 'chat_message':
      return 'Chat';
    default:
      return null;
  }
}

function NotificationIcon({ type }) {
  const icon = getNotificationStyle(type);

  if (icon.set === 'material') {
    return (
      <MaterialCommunityIcons name={icon.name} size={20} color={icon.color} />
    );
  }

  return <Ionicons name={icon.name} size={20} color={icon.color} />;
}

function NotificationRow({ notification, onPress }) {
  const isUnread = notification.isRead !== true;
  const iconStyle = getNotificationStyle(notification.type);

  return (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        isUnread ? styles.notificationCardUnread : styles.notificationCardRead,
      ]}
      onPress={() => onPress(notification)}
      activeOpacity={0.85}
    >
      <View style={styles.notificationRow}>
        <View style={[styles.iconWrap, { backgroundColor: iconStyle.bg }]}>
          <NotificationIcon type={notification.type} />
          {isUnread ? <View style={styles.unreadDotOnIcon} /> : null}
        </View>

        <View style={styles.notificationContent}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.notificationTitle, isUnread && styles.notificationTitleUnread]}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            <Text style={styles.notificationTime}>
              {formatRelativeTime(notification.createdAt)}
            </Text>
          </View>
          <Text style={styles.notificationMessage} numberOfLines={2}>
            {notification.message}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="notifications-outline" size={32} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptySubtitle}>You&apos;re all caught up.</Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [markAllLoading, setMarkAllLoading] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [user, setUser] = useState(null);

  const loadNotifications = useCallback(async () => {
    setError('');

    try {
      const [notificationsData, userData] = await Promise.all([
        getNotifications(),
        getCurrentUser(),
      ]);

      setNotifications(
        Array.isArray(notificationsData.notifications)
          ? notificationsData.notifications
          : []
      );
      setUser(userData.user || userData);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to load notifications. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadNotifications();
    }, [loadNotifications])
  );

  const handleMarkAllAsRead = async () => {
    if (markAllLoading) {
      return;
    }

    setMarkAllLoading(true);
    setError('');

    try {
      await markAllNotificationsAsRead();
      await loadNotifications();
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to mark notifications as read. Please try again.';
      setError(message);
    } finally {
      setMarkAllLoading(false);
    }
  };

  const handleNotificationPress = async (notification) => {
    setError('');

    try {
      if (!notification.isRead) {
        await markNotificationAsRead(notification.id);
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, isRead: true } : item
          )
        );
      }

      const destination = getNotificationDestination(notification.type, user);

      if (destination === 'Chat' && notification.relatedId) {
        navigation.navigate('Chat', {
          donationRequestId: String(notification.relatedId),
        });
        return;
      }

      if (destination && notification.relatedId) {
        navigation.navigate(destination);
      }
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to update notification. Please try again.';
      setError(message);
    }
  };

  const hasUnread = notifications.some((item) => item.isRead !== true);

  const listHeader = (
    <>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {hasUnread ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={handleMarkAllAsRead}
            disabled={markAllLoading}
            activeOpacity={0.85}
          >
            {markAllLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.markAllButtonText}>Mark all as read</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.headerDivider} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <NotificationRow notification={item} onPress={handleNotificationPress} />
          )}
          contentContainerStyle={[
            styles.listContent,
            notifications.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={EmptyState}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },

  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.2,
  },

  headerSpacer: {
    width: 40,
  },

  headerDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  actionsRow: {
    paddingBottom: 8,
    alignItems: 'flex-end',
  },

  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 32,
    justifyContent: 'center',
  },

  markAllButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },

  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 48,
  },

  errorBanner: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  errorText: {
    color: COLORS.errorText,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },

  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },

  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.softPinkLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },

  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },

  notificationCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 9,
    borderWidth: 1,
    minHeight: 84,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },

  notificationCardUnread: {
    backgroundColor: COLORS.softPinkLight,
    borderColor: COLORS.softPink,
  },

  notificationCardRead: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
  },

  notificationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  unreadDotOnIcon: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },

  notificationContent: {
    flex: 1,
    minWidth: 0,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },

  notificationTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },

  notificationTitleUnread: {
    fontWeight: '800',
  },

  notificationMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  notificationTime: {
    fontSize: 12,
    color: COLORS.grayLight,
    fontWeight: '500',
  },
});
