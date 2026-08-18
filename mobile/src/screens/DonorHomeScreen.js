import { useCallback, useState } from 'react';
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
  getCompletedDonations,
  getCurrentUser,
  getCompatibleBloodRequests,
  getMyDonorProfile,
  getUnreadNotificationCount,
  updateDonorAvailability,
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
  border: '#E8D4D6',
  errorBg: '#FEE2E2',
  errorText: '#641522',
  green: '#166534',
  greenBg: '#DCFCE7',
  greenBorder: '#86EFAC',
  openBg: '#DCFCE7',
  openText: '#166534',
  cardShadow: 'rgba(139, 30, 45, 0.08)',
};

function getFirstName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) return 'Donor';
  return trimmed.split(/\s+/)[0];
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function formatUrgency(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatImpactDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeActivityDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return formatImpactDate(value);
}

function getLocationLabel(request) {
  const city = request.hospital?.city || request.location?.city;
  const region = request.hospital?.region || request.location?.region;
  const country = request.hospital?.country || request.location?.country;

  return [city, region, country].filter(Boolean).join(', ') || '—';
}

function SectionHeader({ title, subtitle, actionLabel, onAction, showAction }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {showAction && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.sectionAction}>{actionLabel || 'View All'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function DonorSummaryCard({ profile }) {
  const age = calculateAge(profile?.dateOfBirth);
  const isAvailable = profile?.isAvailable === true;

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Blood Type</Text>
        <Text style={styles.summaryValue}>{profile?.bloodType || '—'}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Age</Text>
        <Text style={styles.summaryValue}>{age != null ? age : '—'}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Availability</Text>
        <Text style={[styles.summaryValue, isAvailable ? styles.summaryAvailable : styles.summaryUnavailable]}>
          {isAvailable ? 'Available' : 'Unavailable'}
        </Text>
      </View>
    </View>
  );
}

function AvailabilityCard({ isAvailable, loading, onToggle }) {
  return (
    <View style={styles.availabilityCard}>
      <Text style={styles.cardEyebrow}>Your Donor Status</Text>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, isAvailable ? styles.statusDotAvailable : styles.statusDotUnavailable]} />
        <Text style={[styles.statusTitle, isAvailable ? styles.statusTitleAvailable : styles.statusTitleUnavailable]}>
          {isAvailable ? 'Available' : 'Unavailable'}
        </Text>
      </View>

      <Text style={styles.statusMessage}>
        {isAvailable ? 'Ready to help save a life' : 'You are currently not accepting donation requests'}
      </Text>

      <TouchableOpacity
        style={[styles.updateStatusButton, loading && styles.updateStatusButtonDisabled]}
        onPress={onToggle}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.primary} size="small" />
        ) : (
          <>
            <Text style={styles.updateStatusText}>Update Status</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function ImpactCard({ totalDonations, lastDonationDate }) {
  return (
    <View style={styles.impactCard}>
      <Text style={styles.cardEyebrow}>Your Impact</Text>
      <View style={styles.impactStatsRow}>
        <View style={styles.impactStat}>
          <Text style={styles.impactEmoji}>🩸</Text>
          <Text style={styles.impactStatValue}>{totalDonations ?? 0}</Text>
          <Text style={styles.impactStatLabel}>Donations</Text>
        </View>
        <View style={styles.impactStatDivider} />
        <View style={styles.impactStat}>
          <Ionicons name="calendar-outline" size={22} color={COLORS.primary} />
          <Text style={styles.impactStatValueSmall}>{formatImpactDate(lastDonationDate)}</Text>
          <Text style={styles.impactStatLabel}>Last Donation</Text>
        </View>
      </View>
    </View>
  );
}

function CompatibleRequestPreviewCard({ request, onViewRequest }) {
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewCardTop}>
        <View style={styles.bloodTypeBadge}>
          <MaterialCommunityIcons name="water" size={16} color={COLORS.primary} />
          <Text style={styles.bloodTypeBadgeText}>{request.bloodTypeNeeded}</Text>
        </View>
        <View style={styles.urgencyBadge}>
          <Text style={styles.urgencyBadgeText}>{formatUrgency(request.urgency)}</Text>
        </View>
      </View>

      <View style={styles.previewMetaRow}>
        <Ionicons name="location-outline" size={15} color={COLORS.textSecondary} />
        <Text style={styles.previewMetaText} numberOfLines={1}>
          {getLocationLabel(request)}
        </Text>
      </View>

      <Text style={styles.previewSubText}>
        {request.unitsNeeded} unit{request.unitsNeeded === 1 ? '' : 's'} needed
      </Text>

      <TouchableOpacity
        style={styles.previewActionButton}
        onPress={() => onViewRequest(request.id)}
        activeOpacity={0.85}
      >
        <Text style={styles.previewActionText}>View Request</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}

function ActivityPreviewCard({ donation }) {
  return (
    <View style={styles.previewCard}>
      <View style={styles.activityPreviewHeader}>
        <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
        <Text style={styles.activityPreviewTitle}>Donation completed</Text>
        <Text style={styles.activityPreviewDate}>{formatRelativeActivityDate(donation.completedAt)}</Text>
      </View>
      <Text style={styles.activityPreviewSubtitle}>
        {donation.bloodTypeNeeded || '—'} blood request
      </Text>
      {donation.hospital?.name ? (
        <Text style={styles.activityPreviewMeta} numberOfLines={1}>
          {donation.hospital.name}
        </Text>
      ) : null}
    </View>
  );
}

export default function DonorHomeScreen() {
  const navigation = useNavigation();
  const [profileLoading, setProfileLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestsError, setRequestsError] = useState('');
  const [displayName, setDisplayName] = useState('Donor');
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [completedDonations, setCompletedDonations] = useState([]);
  const [activityError, setActivityError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAllBloodRequests, setShowAllBloodRequests] = useState(false);

  const previewRequests = showAllBloodRequests ? requests : requests.slice(0, PREVIEW_LIMIT);
  const previewActivity = completedDonations.slice(0, PREVIEW_LIMIT);
  const hasMoreRequests = requests.length > PREVIEW_LIMIT;
  const hasMoreActivity = completedDonations.length > PREVIEW_LIMIT;

  const loadUnreadCount = useCallback(async () => {
    try {
      const data = await getUnreadNotificationCount();
      setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0);
    } catch (err) {
      console.warn('[DonorHomeScreen] Failed to load unread notifications:', err?.message);
    }
  }, []);

  const loadDonorHomeData = useCallback(async () => {
    setError('');
    setRequestsError('');
    setActivityError('');
    setProfileLoading(true);
    setRequestsLoading(true);
    setActivityLoading(true);
    setShowAllBloodRequests(false);

    let donorProfile = null;

    try {
      donorProfile = await getMyDonorProfile();

      if (!donorProfile) {
        navigation.replace('DonorProfile');
        return;
      }

      setProfile(donorProfile);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to load donor home. Please try again.';
      setError(message);
    } finally {
      setProfileLoading(false);
    }

    if (!donorProfile) {
      setRequestsLoading(false);
      setActivityLoading(false);
      return;
    }

    const userPromise = getCurrentUser()
      .then((userData) => {
        setDisplayName(getFirstName(userData?.user?.fullName));
      })
      .catch((err) => {
        console.warn('[DonorHomeScreen] Failed to load user name:', err?.message);
      });

    const requestsPromise = getCompatibleBloodRequests()
      .then((requestsData) => {
        setRequests(Array.isArray(requestsData.requests) ? requestsData.requests : []);
        setRequestsError('');
      })
      .catch((requestsErr) => {
        const message =
          (typeof requestsErr?.message === 'string' && requestsErr.message.trim()) ||
          'Failed to load compatible blood requests.';
        setRequestsError(message);
        setRequests([]);
      })
      .finally(() => {
        setRequestsLoading(false);
      });

    const activityPromise = getCompletedDonations()
      .then((activityData) => {
        setCompletedDonations(
          Array.isArray(activityData.requests) ? activityData.requests : []
        );
        setActivityError('');
      })
      .catch((activityErr) => {
        const message =
          (typeof activityErr?.message === 'string' && activityErr.message.trim()) ||
          'Failed to load recent donation activity.';
        setActivityError(message);
        setCompletedDonations([]);
      })
      .finally(() => {
        setActivityLoading(false);
      });

    await Promise.allSettled([userPromise, requestsPromise, activityPromise]);
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      loadDonorHomeData();
      loadUnreadCount();
    }, [loadDonorHomeData, loadUnreadCount])
  );

  const handleToggleAvailability = async () => {
    if (!profile || availabilityLoading) return;

    const nextValue = !profile.isAvailable;
    setAvailabilityLoading(true);
    setError('');

    try {
      const data = await updateDonorAvailability(nextValue);
      setProfile(data.profile);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to update availability. Please try again.';
      setError(message);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleViewRequest = (requestId) => {
    navigation.navigate('BloodRequestDetails', {
      requestId: String(requestId),
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <HomeScreenHeader role="donor" navigation={navigation} unreadCount={unreadCount} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeHeader}>
          <Text style={styles.welcomeTitle}>Welcome back, {displayName}</Text>
          <Text style={styles.welcomeSubtitle}>Your donation can make a difference today.</Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {profileLoading ? (
          <View style={styles.sectionLoadingCard}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.sectionLoadingText}>Loading your profile...</Text>
          </View>
        ) : null}

        {!profileLoading && profile ? (
          <AvailabilityCard
            isAvailable={profile.isAvailable === true}
            loading={availabilityLoading}
            onToggle={handleToggleAvailability}
          />
        ) : null}

        {!profileLoading && profile ? <DonorSummaryCard profile={profile} /> : null}

        {!profileLoading && profile ? (
          <ImpactCard
            totalDonations={profile.totalDonations}
            lastDonationDate={profile.lastDonationDate}
          />
        ) : null}

        <View style={styles.sectionBlock}>
          <SectionHeader
            title="Nearby Blood Requests"
            subtitle="People who may need your blood"
            showAction={hasMoreRequests && !showAllBloodRequests}
            onAction={() => setShowAllBloodRequests(true)}
          />

          {requestsLoading ? (
            <View style={styles.sectionLoadingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.sectionLoadingText}>Loading blood requests...</Text>
            </View>
          ) : null}

          {requestsError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{requestsError}</Text>
            </View>
          ) : null}

          {!requestsLoading && !requestsError && requests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🩸</Text>
              <Text style={styles.emptyTitle}>No nearby blood requests</Text>
              <Text style={styles.emptyText}>
                New requests will appear here when someone needs your blood type.
              </Text>
            </View>
          ) : null}

          {!requestsLoading && !requestsError
            ? previewRequests.map((request) => (
                <CompatibleRequestPreviewCard
                  key={String(request.id)}
                  request={request}
                  onViewRequest={handleViewRequest}
                />
              ))
            : null}

          {showAllBloodRequests && hasMoreRequests ? (
            <TouchableOpacity
              style={styles.showLessButton}
              onPress={() => setShowAllBloodRequests(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.showLessText}>Show Less</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.sectionBlock}>
          <SectionHeader
            title="Recent Activity"
            showAction={hasMoreActivity}
            onAction={() => navigation.navigate('DonationRequests')}
          />

          {activityLoading ? (
            <View style={styles.sectionLoadingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.sectionLoadingText}>Loading recent activity...</Text>
            </View>
          ) : null}

          {activityError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{activityError}</Text>
            </View>
          ) : null}

          {!activityLoading && !activityError && completedDonations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={28} color={COLORS.textSecondary} />
              <Text style={styles.emptyTitle}>No donation activity yet</Text>
              <Text style={styles.emptyText}>Your completed donations will appear here.</Text>
            </View>
          ) : null}

          {!activityLoading && !activityError
            ? previewActivity.map((donation) => (
                <ActivityPreviewCard key={String(donation.id)} donation={donation} />
              ))
            : null}
        </View>

        <TouchableOpacity
          style={styles.profileShortcut}
          onPress={() => navigation.navigate('DonorProfile')}
          activeOpacity={0.85}
        >
          <Ionicons name="person-outline" size={20} color={COLORS.primary} />
          <Text style={styles.profileShortcutText}>My Donor Profile</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={bottomTabBarSafeAreaStyle}>
        <BottomTabBar
          activeKey="home"
          navigation={navigation}
          onHomePress={() => navigation.navigate('DonorHome')}
          onRequestsPress={() => navigation.navigate('DonationRequests')}
          onAiPress={() => navigation.navigate('AIAssistant')}
          onMessagesPress={() => navigation.navigate('Messages')}
          onProfilePress={() => navigation.navigate('DonorProfile')}
        />
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  sectionLoadingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sectionLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  sectionLoadingText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  welcomeHeader: { marginBottom: 16 },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  welcomeSubtitle: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22 },
  errorBanner: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorText: { color: COLORS.errorText, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cardEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  availabilityCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusDotAvailable: { backgroundColor: COLORS.green },
  statusDotUnavailable: { backgroundColor: COLORS.primary },
  statusTitle: { fontSize: 18, fontWeight: '800' },
  statusTitleAvailable: { color: COLORS.green },
  statusTitleUnavailable: { color: COLORS.primary },
  statusMessage: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 14 },
  updateStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    alignSelf: 'flex-end',
  },
  updateStatusButtonDisabled: { opacity: 0.7 },
  updateStatusText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  summaryLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  summaryAvailable: { color: COLORS.green },
  summaryUnavailable: { color: COLORS.primary },
  impactCard: {
    backgroundColor: COLORS.softPinkLight,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  impactStatsRow: { flexDirection: 'row', alignItems: 'center' },
  impactStat: { flex: 1, alignItems: 'center', gap: 4 },
  impactStatDivider: { width: 1, height: 56, backgroundColor: COLORS.border },
  impactEmoji: { fontSize: 22 },
  impactStatValue: { fontSize: 28, fontWeight: '800', color: COLORS.primary },
  impactStatValueSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 18,
  },
  impactStatLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', textAlign: 'center' },
  sectionBlock: { marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  sectionSubtitle: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  sectionAction: { fontSize: 14, fontWeight: '700', color: COLORS.primary, paddingTop: 2 },
  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  previewCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bloodTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.softPinkLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bloodTypeBadgeText: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  urgencyBadge: {
    backgroundColor: COLORS.openBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  urgencyBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.openText },
  previewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  previewMetaText: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' },
  previewSubText: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 10 },
  previewActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  previewActionText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  activityPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  activityPreviewTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  activityPreviewDate: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  activityPreviewSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 2 },
  activityPreviewMeta: { fontSize: 13, color: COLORS.textSecondary },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  emptyIcon: { fontSize: 28, marginBottom: 8, opacity: 0.7 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 6, textAlign: 'center' },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  showLessButton: { alignItems: 'center', paddingVertical: 8, marginBottom: 6 },
  showLessText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  profileShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    marginTop: 8,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  profileShortcutText: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
});
