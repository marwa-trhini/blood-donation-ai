import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  getChatMessages,
  getCurrentUser,
  markChatMessagesAsRead,
  sendChatMessage,
} from '../services/api';
import ChatKeyboardLayout from '../components/ChatKeyboardLayout';
import { useKeyboardInsets } from '../hooks/useKeyboardInsets';
import { getVisibleTextInputProps, keyboardLayoutStyles } from '../utils/keyboardHelpers';

const COLORS = {
  background: '#FAF8F6',
  white: '#FFFFFF',
  primary: '#E53935',
  navy: '#1F2937',
  gray: '#6B7280',
  grayLight: '#9CA3AF',
  border: '#E5E7EB',
  errorBg: '#FEE2E2',
  errorText: '#B91C1C',
  mineBg: '#FFF5F5',
  mineBorder: '#FECDD3',
  theirsBg: '#FFFFFF',
};

const MESSAGE_MAX_LENGTH = 1000;

function formatMessageTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ChatBubble({ message, isMine }) {
  return (
    <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowTheirs]}>
      <View
        style={[
          styles.messageBubble,
          isMine ? styles.messageBubbleMine : styles.messageBubbleTheirs,
        ]}
      >
        <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{message.message}</Text>
        <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
          {formatMessageTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const scrollRef = useRef(null);
  const { isKeyboardVisible } = useKeyboardInsets();

  const donationRequestId = String(route.params?.donationRequestId || '');
  const contactName = route.params?.contactName || 'Chat';
  const bloodType = route.params?.bloodType || null;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [chatClosed, setChatClosed] = useState(false);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (isKeyboardVisible) {
      scrollToBottom();
    }
  }, [isKeyboardVisible, scrollToBottom]);

  const loadChat = useCallback(async () => {
    if (!donationRequestId) {
      setError('Donation request is missing.');
      setLoading(false);
      return;
    }

    setError('');

    try {
      const [messagesData, userData] = await Promise.all([
        getChatMessages(donationRequestId),
        getCurrentUser(),
      ]);

      setMessages(Array.isArray(messagesData.messages) ? messagesData.messages : []);
      setChatClosed(messagesData.chatClosed === true);
      setCurrentUserId(String(userData.user?.id || userData.id || ''));

      try {
        await markChatMessagesAsRead(donationRequestId);
      } catch {
        // Non-blocking read receipt update.
      }
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to load chat messages.';
      setError(message);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [donationRequestId, scrollToBottom]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadChat();
    }, [loadChat])
  );

  const handleSend = async () => {
    const trimmed = inputValue.trim();

    if (!trimmed || submitting || chatClosed) {
      return;
    }

    if (trimmed.length > MESSAGE_MAX_LENGTH) {
      setError(`Message must be ${MESSAGE_MAX_LENGTH} characters or less.`);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const data = await sendChatMessage(donationRequestId, trimmed);
      const createdMessage = data.chatMessage;

      if (createdMessage) {
        setMessages((current) => [...current, createdMessage]);
      } else {
        await loadChat();
      }

      setInputValue('');
      scrollToBottom();
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to send message.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const subtitle = bloodType
    ? `BloodConnect donation chat • ${bloodType}`
    : 'BloodConnect donation chat';

  return (
    <>
      <StatusBar style="dark" />
      <ChatKeyboardLayout
        safeAreaStyle={styles.safeArea}
        header={
          <>
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
              </TouchableOpacity>
              <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>{contactName}</Text>
                <Text style={styles.headerSubtitle}>{subtitle}</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>
            <View style={styles.headerDivider} />
          </>
        }
        footer={
          !loading ? (
            <View style={styles.composerWrap}>
              <TextInput
                style={[styles.input, chatClosed && styles.inputDisabled]}
                value={inputValue}
                onChangeText={(value) => {
                  setInputValue(value);
                  scrollToBottom();
                }}
                onFocus={scrollToBottom}
                placeholder={chatClosed ? 'Chat is closed' : 'Type a message...'}
                placeholderTextColor={COLORS.grayLight}
                multiline
                maxLength={MESSAGE_MAX_LENGTH}
                editable={!chatClosed && !submitting}
                {...getVisibleTextInputProps({ cursorColor: COLORS.primary, multiline: true })}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (chatClosed || submitting || !inputValue.trim()) && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={chatClosed || submitting || !inputValue.trim()}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.sendButtonText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading chat...</Text>
          </View>
        ) : (
          <>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {chatClosed ? (
              <View style={styles.closedBanner}>
                <Text style={styles.closedBannerText}>
                  Donation completed — chat is closed.
                </Text>
              </View>
            ) : null}

            <ScrollView
              ref={scrollRef}
              style={keyboardLayoutStyles.flex}
              contentContainerStyle={styles.messagesContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={scrollToBottom}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              {messages.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>No messages yet. Start the conversation.</Text>
                </View>
              ) : (
                messages.map((message) => (
                  <ChatBubble
                    key={String(message.id)}
                    message={message}
                    isMine={String(message.senderId) === String(currentUserId)}
                  />
                ))
              )}
            </ScrollView>
          </>
        )}
      </ChatKeyboardLayout>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.navy },
  headerSubtitle: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  headerSpacer: { width: 40 },
  headerDivider: { height: 1, backgroundColor: COLORS.border },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.gray },
  errorText: {
    color: COLORS.errorText,
    backgroundColor: COLORS.errorBg,
    padding: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 14,
  },
  closedBanner: {
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closedBannerText: {
    fontSize: 13,
    color: COLORS.gray,
    textAlign: 'center',
    fontWeight: '600',
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: COLORS.gray, textAlign: 'center' },
  messageRow: { marginBottom: 10, flexDirection: 'row' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTheirs: { justifyContent: 'flex-start' },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  messageBubbleMine: {
    backgroundColor: COLORS.mineBg,
    borderColor: COLORS.mineBorder,
    borderBottomRightRadius: 4,
  },
  messageBubbleTheirs: {
    backgroundColor: COLORS.theirsBg,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  messageText: { fontSize: 15, color: COLORS.navy, lineHeight: 21 },
  messageTextMine: { color: COLORS.navy },
  messageTime: { fontSize: 11, color: COLORS.grayLight, marginTop: 6, alignSelf: 'flex-end' },
  messageTimeMine: { color: COLORS.gray },
  composerWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'android' ? 10 : 10,
    paddingBottom: Platform.OS === 'android' ? 10 : 10,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.navy,
    backgroundColor: COLORS.white,
  },
  inputDisabled: { backgroundColor: '#F3F4F6', color: COLORS.gray },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.6 },
  sendButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
});
