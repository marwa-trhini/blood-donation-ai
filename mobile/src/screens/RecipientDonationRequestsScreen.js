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
  Alert,
} from 'react-native';

import {
  cancelDonationRequest,
  completeDonationRequest,
  getMyRecipientDonationRequests,
} from '../services/api';
import BottomTabBar, { bottomTabBarSafeAreaStyle } from '../components/BottomTabBar';
import {
  buildDonorWhatsAppMessage,
  openWhatsAppContact,
} from '../utils/whatsappHelpers';

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
  errorBg: '#FDE4E4',
  errorText: '#641522',
  successBg: '#DDF6E7',
  successText: '#166534',
  pendingBg: '#FFF1D6',
  pendingText: '#92400E',
  declinedBg: '#FDE4E4',
  declinedText: '#991B1B',
  cancelledBg: '#F3F4F6',
  cancelledText: '#6F6869',
  completedBg: '#DBEAFE',
  completedText: '#1D4ED8',
};

function getStatusStyle(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'accepted') {
    return { badge: styles.statusAccepted, text: styles.statusAcceptedText, label: 'Accepted' };
  }

  if (normalized === 'declined') {
    return { badge: styles.statusDeclined, text: styles.statusDeclinedText, label: 'Declined' };
  }

  if (normalized === 'cancelled') {
    return { badge: styles.statusCancelled, text: styles.statusCancelledText, label: 'Cancelled' };
  }

  if (normalized === 'completed') {
    return { badge: styles.statusCompleted, text: styles.statusCompletedText, label: 'Completed' };
  }

  return { badge: styles.statusPending, text: styles.statusPendingText, label: 'Pending' };
}

function formatDisplayDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatUrgency(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function RecipientDonationRequestCard({
  request,
  actionId,
  onCancel,
  onComplete,
  onContactWhatsApp,
  onOpenChat,
}) {
  const statusStyle = getStatusStyle(request.status);
  const donor = request.donor || {};
  const bloodRequest = request.bloodRequest || {};
  const normalizedStatus = String(request.status || '').toLowerCase();
  const isPending = normalizedStatus === 'pending';
  const isAccepted = normalizedStatus === 'accepted';
  const isActing = actionId === request.id;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.donorName} numberOfLines={1}>
          {donor.fullName || 'Donor'}
        </Text>
        <View style={statusStyle.badge}>
          <Text style={statusStyle.text}>{statusStyle.label.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="water" size={16} color={COLORS.primary} />
        <Text style={styles.metaText}>{donor.bloodType || '—'}</Text>
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={15} color={COLORS.textSecondary} />
        <Text style={styles.metaText} numberOfLines={1}>
          {[donor.location?.city, donor.location?.country].filter(Boolean).join(', ') || '—'}
        </Text>
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>Blood Request</Text>
        <Text style={styles.summaryText}>
          {bloodRequest.bloodTypeNeeded} · {bloodRequest.unitsNeeded} unit
          {bloodRequest.unitsNeeded === 1 ? '' : 's'} · {formatUrgency(bloodRequest.urgency)}
        </Text>
        {bloodRequest.hospital?.name ? (
          <Text style={styles.summarySubtext} numberOfLines={1}>
            {bloodRequest.hospital.name}
          </Text>
        ) : null}
      </View>

      <Text style={styles.createdText}>Sent {formatDisplayDate(request.createdAt)}</Text>

      {isPending ? (
        <TouchableOpacity
          style={[styles.cancelButton, isActing && styles.buttonDisabled]}
          onPress={() => onCancel(request.id)}
          disabled={isActing}
          activeOpacity={0.85}
        >
          {isActing ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Text style={styles.cancelButtonText}>Cancel Request</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {isAccepted ? (
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => onOpenChat(request)}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-outline" size={18} color={COLORS.white} />
          <Text style={styles.chatButtonText}>Chat in BloodConnect</Text>
        </TouchableOpacity>
      ) : null}

      {isAccepted ? (
        <TouchableOpacity
          style={styles.whatsappButton}
          onPress={() => onContactWhatsApp(request)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="whatsapp" size={18} color="#128C7E" />
          <Text style={styles.whatsappButtonText}>Contact on WhatsApp</Text>
        </TouchableOpacity>
      ) : null}

      {isAccepted ? (
        <TouchableOpacity
          style={[styles.completeButton, isActing && styles.buttonDisabled]}
          onPress={() => onComplete(request.id)}
          disabled={isActing}
          activeOpacity={0.85}
        >
          {isActing ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Text style={styles.completeButtonText}>Mark as Completed</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SectionEmptyState({ title, subtitle }) {
  return (
    <View style={styles.sectionEmpty}>
      <Ionicons name="hand-left-outline" size={24} color={COLORS.textSecondary} />
      <Text style={styles.sectionEmptyTitle}>{title}</Text>
      <Text style={styles.sectionEmptyText}>{subtitle}</Text>
    </View>
  );
}

function RequestSection({
  title,
  requests,
  actionId,
  onCancel,
  onComplete,
  onContactWhatsApp,
  onOpenChat,
  showWhenEmpty,
  emptyTitle,
  emptySubtitle,
}) {
  if (!showWhenEmpty && !requests.length) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>
            {requests.length} Request{requests.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {requests.length === 0 ? (
        <SectionEmptyState title={emptyTitle} subtitle={emptySubtitle} />
      ) : (
        requests.map((request) => (
          <RecipientDonationRequestCard
            key={String(request.id)}
            request={request}
            actionId={actionId}
            onCancel={onCancel}
            onComplete={onComplete}
            onContactWhatsApp={onContactWhatsApp}
            onOpenChat={onOpenChat}
          />
        ))
      )}
    </View>
  );
}

export default function RecipientDonationRequestsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [requests, setRequests] = useState([]);
  const [actionId, setActionId] = useState(null);

  const loadRequests = useCallback(async () => {
    setError('');

    try {
      const data = await getMyRecipientDonationRequests();
      const nextRequests = Array.isArray(data.requests) ? data.requests : [];
      setRequests(nextRequests);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to load donation requests.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadRequests();
    }, [loadRequests])
  );

  const handleCancel = async (requestId) => {
    setActionId(requestId);
    setError('');
    setSuccess('');

    try {
      const data = await cancelDonationRequest(requestId);
      setSuccess(data.message || 'Donation request cancelled.');
      await loadRequests();
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to cancel donation request.';
      setError(message);
    } finally {
      setActionId(null);
    }
  };

  const handleComplete = async (requestId) => {
    setActionId(requestId);
    setError('');
    setSuccess('');

    try {
      const data = await completeDonationRequest(requestId);
      setSuccess(data.message || 'Donation request marked as completed.');
      await loadRequests();
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to complete donation request.';
      setError(message);
    } finally {
      setActionId(null);
    }
  };

  const handleContactWhatsApp = async (request) => {
    const donor = request.donor || {};
    const bloodRequest = request.bloodRequest || {};
    const message = buildDonorWhatsAppMessage(donor.fullName, bloodRequest.bloodTypeNeeded);
    const result = await openWhatsAppContact(donor.phoneNumber, message);

    if (!result.ok) {
      Alert.alert('Unable to Contact', result.error);
    }
  };

  const handleOpenChat = (request) => {
    const donor = request.donor || {};
    const bloodRequest = request.bloodRequest || {};

    navigation.navigate('Chat', {
      donationRequestId: String(request.id),
      contactName: donor.fullName || 'Donor',
      bloodType: bloodRequest.bloodTypeNeeded || donor.bloodType || null,
    });
  };

  const pending = requests.filter((item) => item.status === 'pending');
  const accepted = requests.filter((item) => item.status === 'accepted');
  const declined = requests.filter((item) => item.status === 'declined');
  const cancelled = requests.filter((item) => item.status === 'cancelled');
  const completed = requests.filter((item) => item.status === 'completed');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Donation Requests</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.headerDivider} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading donation requests...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          {requests.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="hand-heart-outline" size={32} color={COLORS.primary} />
              <Text style={styles.emptyTitle}>No donation requests yet</Text>
              <Text style={styles.emptyText}>
                When donors respond to your blood requests, they will appear here.
              </Text>
            </View>
          ) : (
            <>
              <RequestSection
                title="Pending"
                requests={pending}
                actionId={actionId}
                onCancel={handleCancel}
                onComplete={handleComplete}
                onContactWhatsApp={handleContactWhatsApp}
                onOpenChat={handleOpenChat}
                showWhenEmpty
                emptyTitle="No pending requests"
                emptySubtitle="Your requests waiting for donor responses will appear here."
              />
              <RequestSection
                title="Accepted"
                requests={accepted}
                actionId={actionId}
                onCancel={handleCancel}
                onComplete={handleComplete}
                onContactWhatsApp={handleContactWhatsApp}
                onOpenChat={handleOpenChat}
                showWhenEmpty
                emptyTitle="No accepted requests"
                emptySubtitle="Donors who accept your requests will appear here."
              />
              <RequestSection
                title="Completed"
                requests={completed}
                actionId={actionId}
                onCancel={handleCancel}
                onComplete={handleComplete}
                onContactWhatsApp={handleContactWhatsApp}
                onOpenChat={handleOpenChat}
              />
              <RequestSection
                title="Declined"
                requests={declined}
                actionId={actionId}
                onCancel={handleCancel}
                onComplete={handleComplete}
                onContactWhatsApp={handleContactWhatsApp}
                onOpenChat={handleOpenChat}
              />
              <RequestSection
                title="Cancelled"
                requests={cancelled}
                actionId={actionId}
                onCancel={handleCancel}
                onComplete={handleComplete}
                onContactWhatsApp={handleContactWhatsApp}
                onOpenChat={handleOpenChat}
              />
            </>
          )}
        </ScrollView>
      )}

      <SafeAreaView edges={['bottom']} style={bottomTabBarSafeAreaStyle}>
        <BottomTabBar
          activeKey="requests"
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
  safeArea: { flex: 1, backgroundColor: COLORS.background },
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
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  headerSpacer: { width: 40 },
  headerDivider: { height: 1, backgroundColor: COLORS.border },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  scrollContent: { padding: 16, paddingBottom: 24 },
  errorBanner: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorText: { color: COLORS.errorText, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  successBanner: {
    backgroundColor: COLORS.successBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successText: { color: COLORS.successText, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: { marginTop: 12, fontSize: 17, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  emptyText: { marginTop: 6, fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
  },
  countPill: {
    backgroundColor: COLORS.softPinkLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  countPillText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  sectionEmpty: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionEmptyTitle: { marginTop: 10, fontSize: 15, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  sectionEmptyText: { marginTop: 4, fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  donorName: { fontSize: 17, fontWeight: '800', color: COLORS.text, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  metaText: { fontSize: 14, color: COLORS.textSecondary, flex: 1 },
  summaryBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.softPinkLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
  summaryText: { fontSize: 14, color: COLORS.text, fontWeight: '600', marginBottom: 2 },
  summarySubtext: { fontSize: 13, color: COLORS.textSecondary },
  createdText: { fontSize: 12, color: COLORS.grayLight, marginBottom: 4 },
  cancelButton: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  cancelButtonText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  chatButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  chatButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  whatsappButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#25D366',
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: '#F0FDF4',
  },
  whatsappButtonText: { color: '#128C7E', fontSize: 15, fontWeight: '700' },
  completeButton: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  completeButtonText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  buttonDisabled: { opacity: 0.7 },
  statusPending: { backgroundColor: COLORS.pendingBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusPendingText: { fontSize: 10, fontWeight: '800', color: COLORS.pendingText, letterSpacing: 0.3 },
  statusAccepted: { backgroundColor: COLORS.successBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusAcceptedText: { fontSize: 10, fontWeight: '800', color: COLORS.successText, letterSpacing: 0.3 },
  statusDeclined: { backgroundColor: COLORS.declinedBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusDeclinedText: { fontSize: 10, fontWeight: '800', color: COLORS.declinedText, letterSpacing: 0.3 },
  statusCancelled: { backgroundColor: COLORS.cancelledBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusCancelledText: { fontSize: 10, fontWeight: '800', color: COLORS.cancelledText, letterSpacing: 0.3 },
  statusCompleted: { backgroundColor: COLORS.completedBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusCompletedText: { fontSize: 10, fontWeight: '800', color: COLORS.completedText, letterSpacing: 0.3 },
});
