import { useCallback, useMemo, useState } from 'react';
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
  Modal,
  Pressable,
} from 'react-native';

import {
  completeDonationRequest,
  createRideRequest,
  getMyDonorDonationRequests,
  getMyRideRequests,
  previewRideRequest,
  respondToDonationRequest,
} from '../services/api';
import BottomTabBar, { bottomTabBarSafeAreaStyle } from '../components/BottomTabBar';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'completed', label: 'Completed' },
];

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
  cardShadow: 'rgba(139, 30, 45, 0.08)',
  errorBg: '#FEE2E2',
  errorText: '#641522',
  successBg: '#DCFCE7',
  successText: '#166534',
  pendingBg: '#FEF3C7',
  pendingText: '#92400E',
  declinedBg: '#FEE2E2',
  declinedText: '#991B1B',
  cancelledBg: '#F3F4F6',
  cancelledText: '#4B5563',
  completedBg: '#FCECEE',
  completedText: '#641522',
  urgentBg: '#FFEDD5',
  urgentText: '#C2410C',
  normalBg: '#F3F4F6',
  normalText: '#6F6869',
};

function formatUrgency(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDisplayDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStatusStyle(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'accepted') {
    return { badge: styles.statusAccepted, text: styles.statusAcceptedText };
  }

  if (normalized === 'declined') {
    return { badge: styles.statusDeclined, text: styles.statusDeclinedText };
  }

  if (normalized === 'cancelled') {
    return { badge: styles.statusCancelled, text: styles.statusCancelledText };
  }

  if (normalized === 'completed') {
    return { badge: styles.statusCompleted, text: styles.statusCompletedText };
  }

  return { badge: styles.statusPending, text: styles.statusPendingText };
}

function getUrgencyStyle(urgency) {
  const normalized = String(urgency || '').toLowerCase();

  if (normalized === 'urgent' || normalized === 'critical') {
    return { badge: styles.urgencyUrgent, dot: styles.urgencyDotUrgent, text: styles.urgencyTextUrgent };
  }

  return { badge: styles.urgencyNormal, dot: styles.urgencyDotNormal, text: styles.urgencyTextNormal };
}

function formatStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'cancelled') return 'CANCELLED';
  if (normalized === 'completed') return 'COMPLETED';
  if (normalized === 'accepted') return 'ACCEPTED';
  if (normalized === 'declined') return 'DECLINED';
  return 'PENDING';
}

function formatLocationLabel(location) {
  if (!location) {
    return '—';
  }

  const parts = [location.addressLine, location.city, location.country].filter(Boolean);

  return parts.length ? parts.join(', ') : '—';
}

function formatDistanceLabel(distanceKm) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) {
    return '—';
  }

  return `${distanceKm.toFixed(1)} km`;
}

function isInactiveStatus(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'completed' || normalized === 'cancelled' || normalized === 'declined';
}

function RequestFilterRow({ activeFilter, onChange, counts }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {FILTER_OPTIONS.map((option) => {
        const isActive = activeFilter === option.key;
        const count = counts[option.key] ?? 0;

        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.filterChip, isActive && styles.filterChipActive]}
            onPress={() => onChange(option.key)}
            activeOpacity={0.85}
          >
            <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
              {option.label}
              {option.key !== 'all' ? ` (${count})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function RideRequestModal({
  visible,
  loading,
  submitting,
  preview,
  onClose,
  onConfirm,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={submitting ? undefined : onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>Request a ride to the donation location?</Text>

          {loading ? (
            <View style={styles.modalLoadingWrap}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={styles.modalLoadingText}>Loading ride details...</Text>
            </View>
          ) : (
            <>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Pickup</Text>
                <Text style={styles.modalValue}>
                  {formatLocationLabel(preview?.pickupLocation)}
                </Text>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Destination</Text>
                <Text style={styles.modalValue}>
                  {formatLocationLabel(preview?.destinationLocation)}
                </Text>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Distance</Text>
                <Text style={styles.modalValue}>{formatDistanceLabel(preview?.distanceKm)}</Text>
              </View>
            </>
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalCancelButton, submitting && styles.buttonDisabled]}
              onPress={onClose}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalConfirmButton,
                (loading || submitting) && styles.buttonDisabled,
              ]}
              onPress={onConfirm}
              disabled={loading || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.modalConfirmButtonText}>Request Ride</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({ icon, children }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={15} color={COLORS.textSecondary} />
      <Text style={styles.detailText}>{children}</Text>
    </View>
  );
}

function DonationRequestCard({
  request,
  actionId,
  existingRide,
  onRespond,
  onComplete,
  onRequestRide,
  onOpenChat,
}) {
  const bloodRequest = request.bloodRequest || {};
  const requiredDateLabel = formatDisplayDate(bloodRequest.requiredDate);
  const statusStyle = getStatusStyle(request.status);
  const urgencyStyle = getUrgencyStyle(bloodRequest.urgency);
  const normalizedStatus = String(request.status || '').toLowerCase();
  const isPending = normalizedStatus === 'pending';
  const isAccepted = normalizedStatus === 'accepted';
  const isActing = actionId === request.id;
  const isInactive = isInactiveStatus(normalizedStatus);

  return (
    <View style={[styles.card, isInactive && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <View style={urgencyStyle.badge}>
          <View style={urgencyStyle.dot} />
          <Text style={urgencyStyle.text}>{formatUrgency(bloodRequest.urgency)}</Text>
        </View>
        <View style={statusStyle.badge}>
          <Text style={statusStyle.text}>{formatStatusLabel(request.status)}</Text>
        </View>
      </View>

      <Text style={styles.bloodLine}>{bloodRequest.bloodTypeNeeded} blood needed</Text>

      <View style={styles.detailsBlock}>
        <DetailRow icon="person-outline">
          From: {request.recipient?.fullName || 'Recipient'}
        </DetailRow>
        <DetailRow icon="water-outline">Units: {bloodRequest.unitsNeeded ?? '—'}</DetailRow>
        <DetailRow icon="business-outline">
          Hospital: {bloodRequest.hospital?.name || '—'}
        </DetailRow>
        {requiredDateLabel ? (
          <DetailRow icon="calendar-outline">Required: {requiredDateLabel}</DetailRow>
        ) : null}
      </View>

      {request.message ? (
        <Text style={styles.messageText}>&quot;{request.message}&quot;</Text>
      ) : null}

      {normalizedStatus === 'accepted' ? (
        <View style={styles.acceptedBanner}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.successText} />
          <Text style={styles.resultText}>Donation request accepted</Text>
        </View>
      ) : null}

      {normalizedStatus === 'declined' ? (
        <Text style={styles.resultTextDeclined}>Donation request declined</Text>
      ) : null}

      {normalizedStatus === 'cancelled' ? (
        <Text style={styles.resultTextMuted}>Donation request cancelled by recipient</Text>
      ) : null}

      {normalizedStatus === 'completed' ? (
        <Text style={styles.resultTextCompleted}>Donation completed</Text>
      ) : null}

      {isPending ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.acceptButton, isActing && styles.buttonDisabled]}
            onPress={() => onRespond(request.id, 'accepted')}
            disabled={isActing}
            activeOpacity={0.88}
          >
            {isActing ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Text style={styles.acceptButtonText}>Accept</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.declineButton, isActing && styles.buttonDisabled]}
            onPress={() => onRespond(request.id, 'declined')}
            disabled={isActing}
            activeOpacity={0.88}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isAccepted ? (
        <>
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => onOpenChat(request)}
            activeOpacity={0.88}
          >
            <Ionicons name="chatbubble-outline" size={18} color={COLORS.white} />
            <Text style={styles.chatButtonText}>💬 In-App Chat</Text>
          </TouchableOpacity>

          <View style={styles.rideSection}>
            <Text style={styles.rideSectionTitle}>Need a Ride?</Text>

            {existingRide ? (
              <>
                <Text style={styles.rideStatusText}>
                  Ride status:{' '}
                  {String(existingRide.status || 'requested').charAt(0).toUpperCase() +
                    String(existingRide.status || 'requested').slice(1)}
                </Text>
                <Text style={styles.rideDistanceText}>
                  📏 {formatDistanceLabel(existingRide.distanceKm)}
                </Text>
                <View style={[styles.rideRequestedButton, styles.buttonDisabled]}>
                  <MaterialCommunityIcons name="car-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.rideRequestedButtonText}>Ride Requested</Text>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={styles.rideButton}
                onPress={() => onRequestRide(request)}
                activeOpacity={0.88}
              >
                <MaterialCommunityIcons name="car-outline" size={18} color={COLORS.primary} />
                <Text style={styles.rideButtonText}>Request a Ride</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.completeButton, isActing && styles.buttonDisabled]}
            onPress={() => onComplete(request.id)}
            disabled={isActing}
            activeOpacity={0.88}
          >
            {isActing ? (
              <ActivityIndicator color={COLORS.successText} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-done-outline" size={18} color={COLORS.successText} />
                <Text style={styles.completeButtonText}>Mark as Completed</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

export default function DonationRequestsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [requests, setRequests] = useState([]);
  const [actionId, setActionId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [ridesByDonationRequestId, setRidesByDonationRequestId] = useState(new Map());
  const [rideModalVisible, setRideModalVisible] = useState(false);
  const [rideModalRequest, setRideModalRequest] = useState(null);
  const [ridePreview, setRidePreview] = useState(null);
  const [rideModalLoading, setRideModalLoading] = useState(false);
  const [rideModalSubmitting, setRideModalSubmitting] = useState(false);

  const filterCounts = useMemo(() => {
    const counts = { all: requests.length, pending: 0, accepted: 0, completed: 0 };

    requests.forEach((request) => {
      const status = String(request.status || '').toLowerCase();
      if (status === 'pending') counts.pending += 1;
      if (status === 'accepted') counts.accepted += 1;
      if (status === 'completed') counts.completed += 1;
    });

    return counts;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    if (activeFilter === 'all') {
      return requests;
    }

    return requests.filter(
      (request) => String(request.status || '').toLowerCase() === activeFilter
    );
  }, [activeFilter, requests]);

  const loadRequests = useCallback(async () => {
    setError('');

    try {
      const [requestsData, ridesData] = await Promise.all([
        getMyDonorDonationRequests(),
        getMyRideRequests(),
      ]);

      setRequests(Array.isArray(requestsData.requests) ? requestsData.requests : []);

      const rideMap = new Map();
      (ridesData.rides || []).forEach((ride) => {
        if (ride.donationRequestId != null) {
          rideMap.set(String(ride.donationRequestId), ride);
        }
      });
      setRidesByDonationRequestId(rideMap);
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

  const handleRespond = async (requestId, status) => {
    setActionId(requestId);
    setError('');
    setSuccess('');

    try {
      const data = await respondToDonationRequest(requestId, status);
      setSuccess(data.message || 'Response saved.');
      await loadRequests();
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to respond to donation request.';
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

  const closeRideModal = () => {
    if (rideModalSubmitting) {
      return;
    }

    setRideModalVisible(false);
    setRideModalRequest(null);
    setRidePreview(null);
    setRideModalLoading(false);
  };

  const handleRequestRide = async (request) => {
    setError('');
    setSuccess('');
    setRideModalRequest(request);
    setRidePreview(null);
    setRideModalVisible(true);
    setRideModalLoading(true);

    try {
      const data = await previewRideRequest(String(request.id));
      setRidePreview(data.preview || null);
    } catch (err) {
      closeRideModal();
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Unable to prepare ride request.';
      setError(message);
    } finally {
      setRideModalLoading(false);
    }
  };

  const handleConfirmRideRequest = async () => {
    if (!rideModalRequest || rideModalSubmitting) {
      return;
    }

    setRideModalSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const data = await createRideRequest(String(rideModalRequest.id));
      const createdRide = data.ride;

      if (createdRide?.donationRequestId != null) {
        setRidesByDonationRequestId((current) => {
          const next = new Map(current);
          next.set(String(createdRide.donationRequestId), createdRide);
          return next;
        });
      }

      setSuccess(data.message || 'Ride request sent');
      closeRideModal();
      await loadRequests();
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to request ride.';
      setError(message);
      closeRideModal();
    } finally {
      setRideModalSubmitting(false);
    }
  };

  const handleOpenChat = (request) => {
    navigation.navigate('Chat', {
      donationRequestId: String(request.id),
      contactName: request.recipient?.fullName || 'Recipient',
      bloodType: request.bloodRequest?.bloodTypeNeeded || null,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
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
          {requests.length > 0 ? (
            <RequestFilterRow
              activeFilter={activeFilter}
              onChange={setActiveFilter}
              counts={filterCounts}
            />
          ) : null}

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
              <Text style={styles.emptyIcon}>🩸</Text>
              <Text style={styles.emptyTitle}>No donation requests yet</Text>
              <Text style={styles.emptyText}>
                When you accept a donation request, it will appear here.
              </Text>
            </View>
          ) : filteredRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="filter-outline" size={28} color={COLORS.textSecondary} />
              <Text style={styles.emptyTitle}>No {activeFilter} requests</Text>
              <Text style={styles.emptyText}>Try another filter to see more requests.</Text>
            </View>
          ) : (
            filteredRequests.map((request) => (
              <DonationRequestCard
                key={String(request.id)}
                request={request}
                actionId={actionId}
                existingRide={ridesByDonationRequestId.get(String(request.id))}
                onRespond={handleRespond}
                onComplete={handleComplete}
                onRequestRide={handleRequestRide}
                onOpenChat={handleOpenChat}
              />
            ))
          )}
        </ScrollView>
      )}

      <RideRequestModal
        visible={rideModalVisible}
        loading={rideModalLoading}
        submitting={rideModalSubmitting}
        preview={ridePreview}
        onClose={closeRideModal}
        onConfirm={handleConfirmRideRequest}
      />

      <SafeAreaView edges={['bottom']} style={bottomTabBarSafeAreaStyle}>
        <BottomTabBar
          activeKey="requests"
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
  filterRow: { gap: 8, paddingBottom: 14 },
  filterChip: {
    backgroundColor: COLORS.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.softPinkLight,
    borderColor: COLORS.primary,
  },
  filterChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  errorBanner: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorText: { color: COLORS.errorText, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  successBanner: {
    backgroundColor: COLORS.successBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successText: { color: COLORS.successText, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIcon: { fontSize: 32, marginBottom: 10, opacity: 0.75 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  cardInactive: {
    backgroundColor: '#FDFBFB',
    shadowOpacity: 0.5,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  urgencyUrgent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.urgentBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  urgencyDotUrgent: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.urgentText },
  urgencyTextUrgent: { fontSize: 12, fontWeight: '700', color: COLORS.urgentText },
  urgencyNormal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.normalBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  urgencyDotNormal: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.normalText },
  urgencyTextNormal: { fontSize: 12, fontWeight: '700', color: COLORS.normalText },
  bloodLine: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  detailsBlock: { gap: 4, marginBottom: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 14, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },
  messageText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.text,
    fontStyle: 'italic',
    lineHeight: 20,
    backgroundColor: COLORS.softPinkLight,
    borderRadius: 12,
    padding: 10,
  },
  acceptedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: COLORS.successBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultText: { fontSize: 14, fontWeight: '700', color: COLORS.successText },
  resultTextDeclined: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.declinedText,
  },
  resultTextMuted: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.cancelledText,
  },
  resultTextCompleted: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.completedText,
  },
  statusPending: {
    backgroundColor: COLORS.pendingBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPendingText: { fontSize: 11, fontWeight: '800', color: COLORS.pendingText },
  statusAccepted: {
    backgroundColor: COLORS.successBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusAcceptedText: { fontSize: 11, fontWeight: '800', color: COLORS.successText },
  statusDeclined: {
    backgroundColor: COLORS.declinedBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDeclinedText: { fontSize: 11, fontWeight: '800', color: COLORS.declinedText },
  statusCancelled: {
    backgroundColor: COLORS.cancelledBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusCancelledText: { fontSize: 11, fontWeight: '800', color: COLORS.cancelledText },
  statusCompleted: {
    backgroundColor: COLORS.completedBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusCompletedText: { fontSize: 11, fontWeight: '800', color: COLORS.completedText },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  acceptButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  acceptButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  declineButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  declineButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 14,
  },
  chatButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  rideSection: {
    marginTop: 14,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderRadius: 14,
    backgroundColor: COLORS.softPinkLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rideSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
  },
  rideStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.successText,
    marginBottom: 4,
  },
  rideDistanceText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  rideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  rideButtonText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  rideRequestedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
  },
  rideRequestedButtonText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  completeButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.successBg,
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
  },
  completeButtonText: { color: COLORS.successText, fontSize: 15, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 16,
    lineHeight: 24,
  },
  modalSection: { marginBottom: 12 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  modalValue: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  modalLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  modalLoadingText: { fontSize: 14, color: COLORS.textSecondary },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancelButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  modalCancelButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  buttonDisabled: { opacity: 0.7 },
});
