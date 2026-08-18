import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
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

import { getCurrentUser } from '../services/api';
import {
  getAIUserRole,
  getInitialAssistantMessage,
  sendAIMessage,
} from '../services/aiService';
import BottomTabBar, { bottomTabBarSafeAreaStyle } from '../components/BottomTabBar';
import ChatKeyboardLayout from '../components/ChatKeyboardLayout';
import {
  getHomeRouteForUser,
  getProfileRouteForUser,
  getRequestsRouteForUser,
} from '../utils/authHelpers';
import { useKeyboardInsets } from '../hooks/useKeyboardInsets';
import { getVisibleTextInputProps, keyboardLayoutStyles } from '../utils/keyboardHelpers';

const COLORS = {
  background: '#FFF8F8',
  white: '#FFFFFF',
  primary: '#8B1E2D',
  softPinkLight: '#FCECEE',
  text: '#2A2526',
  textSecondary: '#6F6869',
  border: '#E8D4D6',
  cardShadow: 'rgba(139, 30, 45, 0.08)',
  errorBg: '#FEE2E2',
  errorText: '#B91C1C',
  successBg: '#ECFDF3',
  successText: '#166534',
  warningBg: '#FFF7ED',
  warningText: '#9A3412',
  reviewBg: '#EFF6FF',
  reviewText: '#1D4ED8',
};

const MESSAGE_MAX_LENGTH = 1000;

function createMessageId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function getEligibilityPresentation(status) {
  switch (status) {
    case 'eligible':
      return {
        title: 'Preliminary Assessment',
        headline: 'May be eligible to donate',
        tone: 'success',
      };
    case 'not_eligible':
      return {
        title: 'Preliminary Assessment',
        headline: 'Should not donate at this time',
        tone: 'warning',
      };
    case 'needs_review':
      return {
        title: 'Preliminary Assessment',
        headline: 'Needs additional review',
        tone: 'review',
      };
    default:
      return {
        title: 'Preliminary Assessment',
        headline: 'Review recommended',
        tone: 'review',
      };
  }
}

function EligibilityResultCard({ eligibility }) {
  if (!eligibility?.status) {
    return null;
  }

  const presentation = getEligibilityPresentation(eligibility.status);
  const toneStyles =
    presentation.tone === 'success'
      ? styles.resultCardSuccess
      : presentation.tone === 'warning'
        ? styles.resultCardWarning
        : styles.resultCardReview;

  const reasons = Array.isArray(eligibility.reasons)
    ? eligibility.reasons.filter(Boolean)
    : [];

  return (
    <View style={[styles.resultCard, toneStyles]}>
      <Text style={styles.resultCardTitle}>{presentation.title}</Text>
      <Text style={styles.resultCardHeadline}>{presentation.headline}</Text>
      {reasons.length > 0 ? (
        <View style={styles.resultReasonsWrap}>
          <Text style={styles.resultReasonsTitle}>Reasons:</Text>
          {reasons.map((reason, index) => (
            <Text key={`${reason}-${index}`} style={styles.resultReasonItem}>
              • {reason}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.resultDisclaimer}>
        Final eligibility is determined by the blood donation center&apos;s screening process.
      </Text>
    </View>
  );
}

function ChatBubble({ message }) {
  const isUser = message.sender === 'user';

  return (
    <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAi]}>
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.messageBubbleUser : styles.messageBubbleAi,
        ]}
      >
        <Text style={[styles.messageText, isUser && styles.messageTextUser]}>{message.text}</Text>
        {!isUser && message.eligibility ? (
          <EligibilityResultCard eligibility={message.eligibility} />
        ) : null}
        <Text style={[styles.messageTime, isUser && styles.messageTimeUser]}>
          {formatMessageTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
}

function createInitialMessages(role) {
  return [
    {
      id: createMessageId('ai-welcome'),
      sender: 'ai',
      text: getInitialAssistantMessage(role),
      timestamp: new Date().toISOString(),
      eligibility: null,
    },
  ];
}

export default function AIAssistantScreen() {
  const navigation = useNavigation();
  const scrollRef = useRef(null);
  const { isKeyboardVisible } = useKeyboardInsets();

  const [user, setUser] = useState(null);
  const [activeRole, setActiveRole] = useState(null);
  const [messages, setMessages] = useState(() => createInitialMessages(null));
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const previousRoleRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      getCurrentUser()
        .then((data) => {
          if (isMounted) {
            const nextUser = data.user || data;
            setUser(nextUser);
            setActiveRole(getAIUserRole(nextUser));
          }
        })
        .catch(() => {
          if (isMounted) {
            setUser(null);
          }
        });

      return () => {
        isMounted = false;
      };
    }, [])
  );

  useEffect(() => {
    const role = getAIUserRole(user);
    const previousRole = previousRoleRef.current;

    if (role !== previousRole) {
      previousRoleRef.current = role;
      setActiveRole(role);
      setMessages(createInitialMessages(role));
      setSessionId(null);
      setInputValue('');
      setError('');
      setSubmitting(false);
    }
  }, [user]);

  const tabRoutes = useMemo(
    () => ({
      home: getHomeRouteForUser(user),
      requests: getRequestsRouteForUser(user),
      profile: getProfileRouteForUser(user),
    }),
    [user]
  );

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

  const handleNewConversation = useCallback(() => {
    setMessages(createInitialMessages(activeRole));
    setSessionId(null);
    setInputValue('');
    setError('');
    setSubmitting(false);
  }, [activeRole]);

  const handleSend = async () => {
    const trimmed = inputValue.trim();

    if (!trimmed || submitting) {
      return;
    }

    if (trimmed.length > MESSAGE_MAX_LENGTH) {
      setError(`Message must be ${MESSAGE_MAX_LENGTH} characters or less.`);
      return;
    }

    const userMessage = {
      id: createMessageId('user'),
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
      eligibility: null,
    };

    setMessages((current) => [...current, userMessage]);
    setInputValue('');
    setError('');
    setSubmitting(true);
    scrollToBottom();

    try {
      const data = await sendAIMessage(trimmed, {
        sessionId,
        role: activeRole,
      });

      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      const isDonorCompleted =
        (data.role === 'donor' || activeRole === 'donor') && data.status === 'completed';

      const aiMessage = {
        id: createMessageId('ai'),
        sender: 'ai',
        text:
          data.message ||
          (activeRole === 'recipient'
            ? "I'm here to help with your blood request questions."
            : "I'm here to help with your preliminary eligibility assessment."),
        timestamp: new Date().toISOString(),
        eligibility: isDonorCompleted ? data.eligibility : null,
      };

      setMessages((current) => [...current, aiMessage]);
      scrollToBottom();
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        "Sorry, I couldn't connect to the AI assistant. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <StatusBar style="dark" />
      <ChatKeyboardLayout
      safeAreaStyle={styles.safeArea}
      header={
        <>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>AI Assistant</Text>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleNewConversation}
              accessibilityLabel="Start new AI conversation"
            >
              <Ionicons name="refresh-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerDivider} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      }
      footer={
        <View style={styles.composerWrap}>
          <TextInput
            style={styles.input}
            value={inputValue}
            onChangeText={(value) => {
              setInputValue(value);
              scrollToBottom();
            }}
            onFocus={scrollToBottom}
            placeholder="Type your message..."
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={MESSAGE_MAX_LENGTH}
            editable={!submitting}
            {...getVisibleTextInputProps({ cursorColor: COLORS.primary, multiline: true })}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (submitting || !inputValue.trim()) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={submitting || !inputValue.trim()}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      }
      bottomBar={
        <SafeAreaView edges={['bottom']} style={bottomTabBarSafeAreaStyle}>
          <BottomTabBar
            activeKey="ai"
            navigation={navigation}
            onHomePress={() => navigation.navigate(tabRoutes.home)}
            onRequestsPress={() => navigation.navigate(tabRoutes.requests)}
            onAiPress={() => navigation.navigate('AIAssistant')}
            onMessagesPress={() => navigation.navigate('Messages')}
            onProfilePress={() => navigation.navigate(tabRoutes.profile)}
          />
        </SafeAreaView>
      }
    >
      <ScrollView
        ref={scrollRef}
        style={keyboardLayoutStyles.flex}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToBottom}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}

        {submitting ? (
          <View style={styles.typingRow}>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.typingText}>AI is typing...</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ChatKeyboardLayout>
    </>
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
  headerButton: {
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
  headerDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
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
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  messageRow: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAi: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '86%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  messageBubbleUser: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  messageBubbleAi: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
  },
  messageTextUser: {
    color: COLORS.white,
  },
  messageTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  messageTimeUser: {
    color: 'rgba(255, 255, 255, 0.82)',
  },
  typingRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  resultCard: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  resultCardSuccess: {
    backgroundColor: COLORS.successBg,
    borderColor: '#BBF7D0',
  },
  resultCardWarning: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#FED7AA',
  },
  resultCardReview: {
    backgroundColor: COLORS.reviewBg,
    borderColor: '#BFDBFE',
  },
  resultCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  resultCardHeadline: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  resultReasonsWrap: {
    marginBottom: 8,
  },
  resultReasonsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  resultReasonItem: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  resultDisclaimer: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
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
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
