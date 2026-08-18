import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import {
  getCurrentUser,
  getMyBloodRequests,
  getMyRecipientProfile,
  getUnreadNotificationCount,
} from '../services/api';
import BottomTabBar, { bottomTabBarSafeAreaStyle } from '../components/BottomTabBar';
import HomeScreenHeader from '../components/HomeScreenHeader';

const PREVIEW_LIMIT = 3;

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
  urgentBg: '#FFEDD5',
  urgentText: '#C2410C',
  normalBg: '#F3F4F6',
  normalText: '#6F6869',
};

function getFirstName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

function formatUrgency(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDisplayDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getUrgencyStyle(urgency) {
  const normalized = String(urgency || '').toLowerCase();

  if (normalized === 'urgent' || normalized === 'emergency' || normalized === 'critical') {
    return { badge: styles.urgencyUrgent, text: styles.urgencyUrgentText };
  }

  return { badge: styles.urgencyNormal, text: styles.urgencyNormalText };
}

function SectionHeader({ title, showAction, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {showAction && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.sectionAction}>View All</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function WelcomeCard({ firstName }) {
  return (
    <View style={styles.welcomeCard}>
      <View style={styles.welcomeIconWrap}>
        <MaterialCommunityIcons name="water" size={22} color={COLORS.primary} />
      </View>
      <View style={styles.welcomeTextWrap}>
        <Text style={styles.welcomeGreeting}>Hello, {firstName}</Text>
        <Text style={styles.welcomeSubtitle}>
          We&apos;re here to help you find the blood you need.
        </Text>
      </View>
    </View>
  );
}

function RequestBloodCard({ onPress }) {
  return (
    <View style={styles.ctaCard}>
      <Text style={styles.ctaTitle}>Need Blood?</Text>
      <Text style={styles.ctaSubtitle}>
        Create a blood request and connect with compatible donors.
      </Text>
      <TouchableOpacity style={styles.ctaButton} onPress={onPress} activeOpacity={0.9}>
        <Ionicons name="add-circle-outline" size={20} color={COLORS.white} />
        <Text style={styles.ctaButtonText}>Request Blood</Text>
      </TouchableOpacity>
    </View>
  );
}

function QuickStatsRow({ totalRequests, activeRequests }) {
  return (
    <View style={styles.statsRow}>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{totalRequests}</Text>
        <Text style={styles.statLabel}>Requests</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{activeRequests}</Text>
        <Text style={styles.statLabel}>Active</Text>
      </View>
    </View>
  );
}

function BloodRequestPreviewCard({ request, onViewMatches }) {
  const urgencyStyle = getUrgencyStyle(request.urgency);
  const createdDateLabel = formatDisplayDate(request.createdAt);

  return (
    <View style={styles.previewCard}>
      <View style={styles.previewCardTop}>
        <View style={styles.bloodTypeRow}>
          <MaterialCommunityIcons name="water" size={16} color={COLORS.primary} />
          <Text style={styles.bloodTypeText}>{request.bloodTypeNeeded} blood needed</Text>
        </View>
        <View style={urgencyStyle.badge}>
          <Text style={urgencyStyle.text}>{formatUrgency(request.urgency).toUpperCase() || 'NORMAL'}</Text>
        </View>
      </View>

      <View style={styles.previewMetaRow}>
        <Ionicons name="business-outline" size={15} color={COLORS.textSecondary} />
        <Text style={styles.previewMetaText} numberOfLines={1}>
          {request.hospital?.name || '—'}
        </Text>
      </View>

      <Text style={styles.previewSubText}>
        {request.unitsNeeded} unit{request.unitsNeeded === 1 ? '' : 's'}
        {createdDateLabel ? ` · ${createdDateLabel}` : ''}
      </Text>

      <TouchableOpacity
        style={styles.previewActionButton}
        onPress={() => onViewMatches(request.id)}
        activeOpacity={0.85}
      >
        <Text style={styles.previewActionText}>View Request</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}

function HelpCard() {
  return (
    <View style={styles.helpCard}>
      <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
      <View style={styles.helpTextWrap}>
        <Text style={styles.helpTitle}>Need help?</Text>
        <Text style={styles.helpText}>
          BloodConnect connects recipients with compatible blood donors.
        </Text>
      </View>
    </View>
  );
}

export default function RecipientHomeScreen() {
  const navigation = useNavigation();
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestsError, setRequestsError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const data = await getUnreadNotificationCount();
      setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0);
    } catch (err) {
      console.warn('[RecipientHomeScreen] Failed to load unread notifications:', err?.message);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadHomeData() {
      try {
        const [userData, recipientProfile] = await Promise.all([
          getCurrentUser(),
          getMyRecipientProfile(),
        ]);

        if (!isMounted) {
          return;
        }

        setUserName(userData?.user?.fullName || 'Recipient');
        setProfile(recipientProfile);
      } catch (err) {
        console.warn('[RecipientHomeScreen] Load failed:', err?.message);
      }
    }

    loadHomeData();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError('');

    try {
      const data = await getMyBloodRequests();
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to load blood requests. Please try again.';
      setRequestsError(message);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
      loadUnreadCount();
    }, [loadRequests, loadUnreadCount])
  );

  const activeRequests = useMemo(
    () => requests.filter((request) => String(request.status || '').toLowerCase() === 'open'),
    [requests]
  );

  const previewRequests = useMemo(() => {
    const source = activeRequests.length > 0 ? activeRequests : requests;
    return source.slice(0, PREVIEW_LIMIT);
  }, [activeRequests, requests]);

  const activeCount = activeRequests.length;
  const hasMoreRequests = (activeRequests.length > 0 ? activeRequests : requests).length > PREVIEW_LIMIT;

  const handleViewMatches = (rawRequestId) => {
    const requestId =
      rawRequestId != null ? String(rawRequestId).trim() : '';

    if (!requestId || requestId === 'undefined' || requestId === 'null') {
      return;
    }

    navigation.navigate('MatchingDonors', { requestId });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <HomeScreenHeader role="recipient" navigation={navigation} unreadCount={unreadCount} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <WelcomeCard firstName={getFirstName(userName)} />

        <RequestBloodCard onPress={() => navigation.navigate('CreateBloodRequest')} />

        {profile || requests.length > 0 ? (
          <QuickStatsRow totalRequests={requests.length} activeRequests={activeCount} />
        ) : null}

        <View style={styles.sectionBlock}>
          <SectionHeader
            title="Active Requests"
            showAction={hasMoreRequests}
            onAction={() => navigation.navigate('RecipientDonationRequests')}
          />

          {requestsLoading ? (
            <View style={styles.requestsLoadingWrap}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.requestsLoadingText}>Loading requests...</Text>
            </View>
          ) : null}

          {requestsError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{requestsError}</Text>
            </View>
          ) : null}

          {!requestsLoading && !requestsError && requests.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="water-off" size={28} color={COLORS.textSecondary} />
              <Text style={styles.emptyTitle}>No blood requests yet</Text>
              <Text style={styles.emptyText}>
                Create your first request to connect with compatible donors.
              </Text>
            </View>
          ) : null}

          {!requestsLoading && !requestsError
            ? previewRequests.map((request) => (
                <BloodRequestPreviewCard
                  key={String(request.id)}
                  request={request}
                  onViewMatches={handleViewMatches}
                />
              ))
            : null}
        </View>

        <HelpCard />
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={bottomTabBarSafeAreaStyle}>
        <BottomTabBar
          activeKey="home"
          navigation={navigation}
          onHomePress={() => navigation.navigate('RecipientHome')}
          onRequestsPress={() => navigation.navigate('RecipientDonationRequests')}
          onAiPress={() => navigation.navigate('AIAssistant')}
          onMessagesPress={() => navigation.navigate('Messages')}
          onProfilePress={() => navigation.navigate('RecipientProfile')}
        />
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },

  welcomeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.softPinkLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    alignItems: 'flex-start',
  },

  welcomeIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  welcomeTextWrap: {
    flex: 1,
  },

  welcomeGreeting: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },

  welcomeSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  ctaCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },

  ctaTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },

  ctaSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginBottom: 14,
  },

  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },

  ctaButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },

  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },

  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 2,
  },

  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  sectionBlock: {
    marginBottom: 14,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },

  sectionAction: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },

  requestsLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    justifyContent: 'center',
  },

  requestsLoadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
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

  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },

  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },

  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },

  previewCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },

  bloodTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },

  bloodTypeText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
  },

  urgencyUrgent: {
    backgroundColor: COLORS.urgentBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  urgencyUrgentText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.urgentText,
    letterSpacing: 0.3,
  },

  urgencyNormal: {
    backgroundColor: COLORS.normalBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  urgencyNormalText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.normalText,
    letterSpacing: 0.3,
  },

  previewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },

  previewMetaText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },

  previewSubText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },

  previewActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  previewActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },

  helpCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.softPinkLight,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  helpTextWrap: {
    flex: 1,
  },

  helpTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },

  helpText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
});
