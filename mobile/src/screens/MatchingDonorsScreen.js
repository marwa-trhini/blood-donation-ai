import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
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
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import {
  createDonationRequest,
  getBloodRequestMatches,
  getMyRecipientDonationRequests,
} from '../services/api';

const COLORS = {
  background: '#FAF8F6',
  white: '#FFFFFF',
  primary: '#E53935',
  navy: '#1F2937',
  gray: '#6B7280',
  grayLight: '#9CA3AF',
  border: '#E5E7EB',
  welcomeBg: '#FFF1F2',
  welcomeBorder: '#FECDD3',
  errorBg: '#FEE2E2',
  errorText: '#B91C1C',
  successBg: '#DCFCE7',
  successText: '#166534',
  green: '#22C55E',
  greenBg: '#F0FDF4',
  greenBorder: '#86EFAC',
};

const MESSAGE_MAX_LENGTH = 500;
const DONOR_FILTER_ALL = 'all';
const RADIUS_OPTIONS_KM = [5, 10, 25, 50];

function formatUrgency(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDistanceLabel(distanceKm) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return '📍 Distance unavailable';
  }

  if (distanceKm < 1) {
    return `📍 ${Math.round(distanceKm * 1000)} m away`;
  }

  return `📍 ${distanceKm.toFixed(1)} km away`;
}

function isWithinRadiusMatch(match, radiusKm) {
  return (
    typeof match.distanceKm === 'number' &&
    Number.isFinite(match.distanceKm) &&
    match.distanceKm <= radiusKm
  );
}

function requestSupportsDistance(matches) {
  return matches.some(
    (match) => typeof match.distanceKm === 'number' && Number.isFinite(match.distanceKm)
  );
}

function DonorFilterBar({ filter, onChangeFilter }) {
  const options = [
    { value: DONOR_FILTER_ALL, label: 'All' },
    ...RADIUS_OPTIONS_KM.map((km) => ({ value: km, label: `${km} km` })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {options.map((option) => {
        const isActive = filter === option.value;

        return (
          <TouchableOpacity
            key={String(option.value)}
            style={[styles.filterChip, isActive && styles.filterChipActive]}
            onPress={() => onChangeFilter(option.value)}
            activeOpacity={0.85}
          >
            <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function RequestSummaryCard({ request }) {
  if (!request) return null;

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.sectionTitle}>Blood Request Summary</Text>
      <View style={styles.summaryRow}>
        <MaterialCommunityIcons name="water" size={18} color={COLORS.primary} />
        <Text style={styles.summaryLabel}>Blood type needed:</Text>
        <Text style={styles.summaryValue}>{request.bloodTypeNeeded}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Ionicons name="flask-outline" size={18} color={COLORS.gray} />
        <Text style={styles.summaryLabel}>Units needed:</Text>
        <Text style={styles.summaryValue}>{request.unitsNeeded}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Ionicons name="alert-circle-outline" size={18} color={COLORS.gray} />
        <Text style={styles.summaryLabel}>Urgency:</Text>
        <Text style={styles.summaryValue}>{formatUrgency(request.urgency)}</Text>
      </View>
    </View>
  );
}

function getDonorRequestState(donorUserId, sentRequestsByDonor) {
  return sentRequestsByDonor.get(String(donorUserId)) || null;
}

function DonorMatchCard({ match, requestState, onRequestDonation }) {
  const donorUserId = String(match.userId);
  const hasPending = requestState?.status === 'pending';
  const hasAccepted = requestState?.status === 'accepted';
  const hasDeclined = requestState?.status === 'declined';

  return (
    <View style={styles.donorCard}>
      <Text style={styles.donorName}>{match.fullName}</Text>

      <View style={styles.donorDetailRow}>
        <MaterialCommunityIcons name="water" size={16} color={COLORS.primary} />
        <Text style={styles.donorDetailText}>Blood Type: {match.bloodType}</Text>
      </View>

      <View style={styles.donorDetailRow}>
        <Ionicons name="person-outline" size={16} color={COLORS.gray} />
        <Text style={styles.donorDetailText}>Age: {match.age}</Text>
      </View>

      <View style={styles.donorDetailRow}>
        <Ionicons name="location-outline" size={16} color={COLORS.gray} />
        <Text style={styles.donorDetailText}>
          Location: {match.location?.city || 'Unknown'}
        </Text>
      </View>

      <View style={styles.donorDetailRow}>
        <Ionicons name="navigate-outline" size={16} color={COLORS.gray} />
        <Text style={styles.donorDetailText}>{formatDistanceLabel(match.distanceKm)}</Text>
      </View>

      {match.isAvailable ? (
        <View style={styles.availableBadge}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.green} />
          <Text style={styles.availableText}>Available</Text>
        </View>
      ) : null}

      {hasPending ? (
        <View style={styles.sentBadge}>
          <Ionicons name="paper-plane" size={16} color={COLORS.primary} />
          <Text style={styles.sentText}>Request Sent</Text>
        </View>
      ) : hasAccepted ? (
        <View style={styles.acceptedBadge}>
          <Text style={styles.acceptedText}>Accepted</Text>
        </View>
      ) : hasDeclined ? (
        <View style={styles.declinedBadge}>
          <Text style={styles.declinedText}>Declined</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.requestButton}
          onPress={() => onRequestDonation(match)}
          activeOpacity={0.85}
        >
          <Ionicons name="hand-left-outline" size={18} color={COLORS.primary} />
          <Text style={styles.requestButtonText}>Request Donation</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function MatchingDonorsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const requestId =
    route.params?.requestId != null ? String(route.params.requestId).trim() : '';

  console.log('[MatchingDonors] requestId:', requestId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [request, setRequest] = useState(null);
  const [matches, setMatches] = useState([]);
  const [infoMessage, setInfoMessage] = useState('');
  const [sentRequestsByDonor, setSentRequestsByDonor] = useState(new Map());
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [donorFilter, setDonorFilter] = useState(DONOR_FILTER_ALL);

  const displayedMatches =
    donorFilter === DONOR_FILTER_ALL
      ? matches
      : matches.filter((match) => isWithinRadiusMatch(match, donorFilter));

  const hasRequestLocationForDistance = requestSupportsDistance(matches);

  const loadSentRequests = useCallback(async () => {
    if (!requestId) return;

    try {
      const data = await getMyRecipientDonationRequests();
      const map = new Map();

      (data.requests || []).forEach((item) => {
        const bloodRequestId = item.bloodRequest?.id;
        if (
          bloodRequestId != null &&
          String(bloodRequestId) === requestId &&
          item.donor?.userId
        ) {
          map.set(String(item.donor.userId), item);
        }
      });

      setSentRequestsByDonor(map);
    } catch (err) {
      console.warn('[MatchingDonorsScreen] Failed to load sent requests:', err?.message);
    }
  }, [requestId]);

  useEffect(() => {
    let isMounted = true;

    async function loadMatches() {
      if (!requestId) {
        if (isMounted) {
          setError('Missing blood request ID.');
          setLoading(false);
        }
        return;
      }

      console.log('[MatchingDonors] Loading matches...');

      if (isMounted) {
        setLoading(true);
        setError('');
        setSuccess('');
        setInfoMessage('');
      }

      try {
        const data = await getBloodRequestMatches(requestId);

        if (!isMounted) {
          return;
        }

        setRequest(data.request || null);
        setMatches(Array.isArray(data.matches) ? data.matches : []);

        if (typeof data.message === 'string' && data.message.trim()) {
          setInfoMessage(data.message.trim());
        }
      } catch (err) {
        if (isMounted) {
          const messageText =
            (typeof err?.message === 'string' && err.message.trim()) ||
            'Failed to load matching donors. Please try again.';
          setError(messageText);
          setMatches([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadMatches();

    return () => {
      isMounted = false;
    };
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      if (requestId) {
        loadSentRequests();
      }
    }, [requestId, loadSentRequests])
  );

  const openRequestModal = (match) => {
    setSelectedDonor(match);
    setMessage('');
    setModalVisible(true);
  };

  const closeRequestModal = () => {
    if (submitting) return;
    setModalVisible(false);
    setSelectedDonor(null);
    setMessage('');
  };

  const handleSendRequest = async () => {
    if (!selectedDonor || !requestId || submitting) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await createDonationRequest(String(selectedDonor.userId), String(requestId), message);
      setSuccess('Donation request sent successfully.');
      closeRequestModal();
      await loadSentRequests();
    } catch (err) {
      const messageText =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to send donation request.';
      setError(messageText);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Matching Donors</Text>
        <TouchableOpacity
          style={styles.requestsLink}
          onPress={() => navigation.navigate('RecipientDonationRequests')}
        >
          <Text style={styles.requestsLinkText}>Requests</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.headerDivider} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Finding matching donors...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {success ? <Text style={styles.successText}>{success}</Text> : null}
          {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}

          <RequestSummaryCard request={request} />

          <DonorFilterBar filter={donorFilter} onChangeFilter={setDonorFilter} />

          {matches.length === 0 && !error ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="account-search" size={40} color={COLORS.grayLight} />
              <Text style={styles.emptyText}>No compatible donors found yet.</Text>
            </View>
          ) : null}

          {donorFilter !== DONOR_FILTER_ALL &&
          matches.length > 0 &&
          displayedMatches.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="map-outline" size={40} color={COLORS.grayLight} />
              <Text style={styles.emptyText}>
                {!hasRequestLocationForDistance
                  ? "Nearby donors aren't available because this blood request has no location."
                  : `No compatible donors found within ${donorFilter} km.`}
              </Text>
              {!hasRequestLocationForDistance ? null : (
                <TouchableOpacity
                  style={styles.showAllButton}
                  onPress={() => setDonorFilter(DONOR_FILTER_ALL)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.showAllButtonText}>Show All Donors</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {displayedMatches.length > 0
            ? displayedMatches.map((match) => (
                <DonorMatchCard
                  key={String(match.donorId || match.userId)}
                  match={match}
                  requestState={getDonorRequestState(match.userId, sentRequestsByDonor)}
                  onRequestDonation={openRequestModal}
                />
              ))
            : null}
        </ScrollView>
      )}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeRequestModal}>
        <Pressable style={styles.modalOverlay} onPress={closeRequestModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Request Donation</Text>

              {selectedDonor ? (
                <>
                  <Text style={styles.modalDonorName}>{selectedDonor.fullName}</Text>
                  <Text style={styles.modalDonorBlood}>Blood Type: {selectedDonor.bloodType}</Text>
                </>
              ) : null}

              <Text style={styles.modalLabel}>Optional message</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Please help if you can."
                placeholderTextColor={COLORS.grayLight}
                value={message}
                onChangeText={(value) => setMessage(value.slice(0, MESSAGE_MAX_LENGTH))}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!submitting}
              />
              <Text style={styles.modalCounter}>{message.length}/{MESSAGE_MAX_LENGTH}</Text>

              <TouchableOpacity
                style={[styles.sendButton, submitting && styles.sendButtonDisabled]}
                onPress={handleSendRequest}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.sendButtonText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
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
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.navy },
  requestsLink: { minWidth: 40, alignItems: 'flex-end' },
  requestsLinkText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  headerDivider: { height: 1, backgroundColor: COLORS.border },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.gray, fontWeight: '500' },
  scrollContent: { padding: 16, paddingBottom: 24 },
  errorText: {
    color: COLORS.errorText,
    backgroundColor: COLORS.errorBg,
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
  },
  successText: {
    color: COLORS.successText,
    backgroundColor: COLORS.successBg,
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
  },
  infoText: {
    color: COLORS.gray,
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.navy, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: COLORS.gray },
  summaryValue: { fontSize: 14, fontWeight: '700', color: COLORS.navy },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    paddingRight: 4,
  },
  filterChip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  filterChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#FFF5F5',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray,
  },
  filterChipTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    fontWeight: '500',
  },
  showAllButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#FFF5F5',
  },
  showAllButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
  },
  donorCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  donorName: { fontSize: 17, fontWeight: '700', color: COLORS.navy, marginBottom: 12 },
  donorDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  donorDetailText: { fontSize: 14, color: COLORS.gray },
  availableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.greenBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
    marginBottom: 12,
  },
  availableText: { fontSize: 13, fontWeight: '600', color: COLORS.green },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF5F5',
    marginTop: 4,
  },
  requestButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  sentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: COLORS.welcomeBorder,
    marginTop: 4,
  },
  sentText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  acceptedBadge: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: COLORS.successBg,
    borderRadius: 12,
    marginTop: 4,
  },
  acceptedText: { fontSize: 15, fontWeight: '700', color: COLORS.successText },
  declinedBadge: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: COLORS.errorBg,
    borderRadius: 12,
    marginTop: 4,
  },
  declinedText: { fontSize: 15, fontWeight: '700', color: COLORS.errorText },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.navy, marginBottom: 12, textAlign: 'center' },
  modalDonorName: { fontSize: 16, fontWeight: '700', color: COLORS.navy, textAlign: 'center' },
  modalDonorBlood: { fontSize: 14, color: COLORS.gray, textAlign: 'center', marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: COLORS.navy, marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    minHeight: 90,
    fontSize: 15,
    color: COLORS.navy,
  },
  modalCounter: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: COLORS.grayLight,
    marginTop: 6,
    marginBottom: 16,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.7 },
  sendButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});
