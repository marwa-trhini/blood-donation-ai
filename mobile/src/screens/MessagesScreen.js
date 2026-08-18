import { useCallback, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { deleteChatConversation, getChatConversations, getCurrentUser } from '../services/api';
import BottomTabBar, { bottomTabBarSafeAreaStyle } from '../components/BottomTabBar';
import {
  getHomeRouteForUser,
  getProfileRouteForUser,
  getRequestsRouteForUser,
} from '../utils/authHelpers';

const COLORS = {
  background: '#FFF8F8',
  white: '#FFFFFF',
  primary: '#8B1E2D',
  primaryDark: '#641522',
  softPink: '#F8DDE0',
  softPinkLight: '#FCECEE',
  text: '#2A2526',
  textSecondary: '#6F6869',
  grayLight: '#9CA3AF',
  border: '#E8D4D6',
  cardShadow: 'rgba(139, 30, 45, 0.08)',
  errorBg: '#FEE2E2',
  errorText: '#641522',
};

function formatConversationTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function ConversationAvatar() {
  return (
    <View style={styles.avatar}>
      <MaterialCommunityIcons name="water" size={20} color={COLORS.primary} />
    </View>
  );
}

function UnreadBadge({ count }) {
  if (!count || count <= 0) {
    return null;
  }

  const label = count > 99 ? '99+' : String(count);

  return (
    <View style={styles.unreadBadge}>
      <Text style={styles.unreadBadgeText}>{label}</Text>
    </View>
  );
}

function DeleteConfirmationModal({ visible, onCancel, onConfirm, deleting }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <Pressable style={styles.modalSheet} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>Delete conversation?</Text>
          <Text style={styles.modalMessage}>
            This will remove this conversation from your Messages.
          </Text>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={onCancel}
              disabled={deleting}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalDeleteButton, deleting && styles.modalDeleteButtonDisabled]}
              onPress={onConfirm}
              disabled={deleting}
              activeOpacity={0.85}
            >
              {deleting ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.modalDeleteText}>Delete</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ConversationRow({ conversation, onPress, onDeletePress }) {
  const unreadCount = conversation.unreadCount || 0;
  const hasUnread = unreadCount > 0;
  const previewText =
    conversation.lastMessage ||
    (conversation.chatClosed ? 'Donation completed — chat is closed.' : 'No messages yet.');

  return (
    <View style={styles.conversationCard}>
      <TouchableOpacity
        style={styles.conversationPressable}
        onPress={() => onPress(conversation)}
        activeOpacity={0.85}
      >
        <ConversationAvatar />

        <View style={styles.conversationMain}>
          <View style={styles.conversationHeader}>
            <Text
              style={[styles.conversationName, hasUnread && styles.conversationNameUnread]}
              numberOfLines={1}
            >
              {conversation.otherUser?.fullName || 'Contact'}
            </Text>
            <Text style={[styles.conversationTime, hasUnread && styles.conversationTimeUnread]}>
              {formatConversationTime(conversation.lastMessageAt)}
            </Text>
          </View>

          {conversation.otherUserSubtitle ? (
            <Text style={styles.conversationSubtitle} numberOfLines={1}>
              {conversation.otherUserSubtitle}
            </Text>
          ) : null}

          <View style={styles.conversationFooter}>
            <Text
              style={[styles.conversationPreview, hasUnread && styles.conversationPreviewUnread]}
              numberOfLines={1}
            >
              {previewText}
            </Text>
            <UnreadBadge count={unreadCount} />
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.conversationDeleteButton}
        onPress={() => onDeletePress(conversation)}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Delete conversation"
      >
        <Ionicons name="trash-outline" size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="chatbubbles-outline" size={32} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptySubtitle}>
        Your conversations with blood donors and recipients will appear here.
      </Text>
    </View>
  );
}

export default function MessagesScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [conversations, setConversations] = useState([]);
  const [user, setUser] = useState(null);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadConversations = useCallback(async () => {
    setError('');

    try {
      const [data, userData] = await Promise.all([getChatConversations(), getCurrentUser()]);
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
      setUser(userData.user || userData);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to load messages.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadConversations();
    }, [loadConversations])
  );

  const tabRoutes = useMemo(() => {
    return {
      home: getHomeRouteForUser(user),
      requests: getRequestsRouteForUser(user),
      profile: getProfileRouteForUser(user),
    };
  }, [user]);

  const handleOpenConversation = (conversation) => {
    navigation.navigate('Chat', {
      donationRequestId: String(conversation.donationRequestId),
      conversationId: conversation.conversationId
        ? String(conversation.conversationId)
        : undefined,
      contactName: conversation.otherUser?.fullName || 'Contact',
      bloodType: conversation.otherUser?.bloodType || null,
    });
  };

  const handleDeletePress = (conversation) => {
    setConversationToDelete(conversation);
  };

  const handleCancelDelete = () => {
    if (deleting) {
      return;
    }

    setConversationToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!conversationToDelete || deleting) {
      return;
    }

    setError('');
    setDeleting(true);

    try {
      await deleteChatConversation(String(conversationToDelete.donationRequestId));
      setConversationToDelete(null);
      await loadConversations();
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to delete conversation.';
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  const renderConversation = ({ item }) => (
    <ConversationRow
      conversation={item}
      onPress={handleOpenConversation}
      onDeletePress={handleDeletePress}
    />
  );

  const listHeader = error ? (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.headerDivider} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.conversationId || item.donationRequestId)}
          renderItem={renderConversation}
          contentContainerStyle={[
            styles.listContent,
            conversations.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={EmptyState}
        />
      )}

      <SafeAreaView edges={['bottom']} style={bottomTabBarSafeAreaStyle}>
        <BottomTabBar
          activeKey="messages"
          navigation={navigation}
          onHomePress={() => navigation.navigate(tabRoutes.home)}
          onRequestsPress={() => navigation.navigate(tabRoutes.requests)}
          onAiPress={() => navigation.navigate('AIAssistant')}
          onMessagesPress={() => navigation.navigate('Messages')}
          onProfilePress={() => navigation.navigate(tabRoutes.profile)}
        />
      </SafeAreaView>

      <DeleteConfirmationModal
        visible={Boolean(conversationToDelete)}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        deleting={deleting}
      />
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

  conversationCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 88,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },

  conversationPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 8,
    gap: 12,
    minWidth: 0,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.softPinkLight,
    borderWidth: 1,
    borderColor: COLORS.softPink,
    alignItems: 'center',
    justifyContent: 'center',
  },

  conversationMain: {
    flex: 1,
    minWidth: 0,
  },

  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 8,
  },

  conversationName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },

  conversationNameUnread: {
    fontWeight: '800',
  },

  conversationSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },

  conversationTime: {
    fontSize: 12,
    color: COLORS.grayLight,
    fontWeight: '500',
  },

  conversationTimeUnread: {
    color: COLORS.primary,
    fontWeight: '700',
  },

  conversationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  conversationPreview: {
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },

  conversationPreviewUnread: {
    color: COLORS.text,
    fontWeight: '600',
  },

  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },

  unreadBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '800',
  },

  conversationDeleteButton: {
    width: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  modalSheet: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
    letterSpacing: -0.2,
  },

  modalMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
    marginBottom: 24,
  },

  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },

  modalCancelButton: {
    minWidth: 96,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
  },

  modalCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },

  modalDeleteButton: {
    minWidth: 96,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },

  modalDeleteButtonDisabled: {
    opacity: 0.75,
  },

  modalDeleteText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});
