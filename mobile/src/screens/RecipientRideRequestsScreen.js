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

import { getRecipientRideRequests, updateRideStatus } from '../services/api';

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
  requestedBg: '#FFF1D6',
  requestedText: '#92400E',
  acceptedBg: '#DDF6E7',
  acceptedText: '#166534',
  completedBg: '#DBEAFE',
  completedText: '#1D4ED8',
  cancelledBg: '#FDE4E4',
  cancelledText: '#991B1B',
};

function getStatusStyle(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'accepted') {
    return { badge: styles.statusAccepted, text: styles.statusAcceptedText, label: 'Accepted' };
  }

  if (normalized === 'completed') {
    return { badge: styles.statusCompleted, text: styles.statusCompletedText, label: 'Completed' };
  }

  if (normalized === 'cancelled') {
    return { badge: styles.statusCancelled, text: styles.statusCancelledText, label: 'Cancelled' };
  }

  return { badge: styles.statusRequested, text: styles.statusRequestedText, label: 'Requested' };
}

function formatLocationLabel(location) {
  if (!location) {
    return '—';
  }

  return location.city || '—';
}

function formatDistanceLabel(distanceKm) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) {
    return '—';
  }

  return `${distanceKm.toFixed(1)} km`;
}

function RouteSection({ pickup, destination }) {
  return (
    <View style={styles.routeSection}>
      <View style={styles.routeRow}>
        <View style={styles.routeMarkerCol}>
          <View style={[styles.routeDot, styles.routeDotPickup]} />
          <View style={styles.routeLine} />
          <View style={[styles.routeDot, styles.routeDotDestination]} />
        </View>
        <View style={styles.routeContentCol}>
          <View style={styles.routeStop}>
            <View style={styles.routeLabelRow}>
              <Ionicons name="location-outline" size={14} color={COLORS.primary} />
              <Text style={styles.routeLabel}>Pickup</Text>
            </View>
            <Text style={styles.routeText}>{pickup}</Text>
          </View>
          <View style={styles.routeStop}>
            <View style={styles.routeLabelRow}>
              <Ionicons name="business-outline" size={14} color={COLORS.primary} />
              <Text style={styles.routeLabel}>Destination</Text>
            </View>
            <Text style={styles.routeText}>{destination}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function RecipientRideRequestCard({ ride, actionId, onAccept, onCancel, onOpenChat }) {
  const statusStyle = getStatusStyle(ride.status);
  const normalizedStatus = String(ride.status || '').toLowerCase();
  const isRequested = normalizedStatus === 'requested';
  const isAccepted = normalizedStatus === 'accepted';
  const isCompleted = normalizedStatus === 'completed';
  const isCancelled = normalizedStatus === 'cancelled';
  const isActing = actionId === ride.id;
  const showChat = isRequested || isAccepted;
  const donor = ride.donor || {};
  const isQuiet = isCompleted || isCancelled;

  return (
    <View style={[styles.card, isQuiet && styles.cardQuiet]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Ride Request</Text>
        <View style={statusStyle.badge}>
          <Text style={statusStyle.text}>{statusStyle.label.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.donorBlock}>
        <Text style={styles.donorLabel}>Donor</Text>
        <Text style={styles.donorName}>{donor.fullName || 'Donor'}</Text>
        {donor.bloodType || ride.bloodRequest?.bloodTypeNeeded ? (
          <View style={styles.bloodRow}>
            <MaterialCommunityIcons name="water" size={15} color={COLORS.primary} />
            <Text style={styles.bloodText}>
              {donor.bloodType || ride.bloodRequest?.bloodTypeNeeded} blood donation
            </Text>
          </View>
        ) : null}
      </View>

      <RouteSection
        pickup={formatLocationLabel(ride.pickupLocation)}
        destination={formatLocationLabel(ride.destinationLocation)}
      />

      <View style={styles.distanceRow}>
        <View style={styles.distanceLabelRow}>
          <Ionicons name="navigate-outline" size={15} color={COLORS.textSecondary} />
          <Text style={styles.distanceLabel}>Distance</Text>
        </View>
        <Text style={styles.distanceValue}>{formatDistanceLabel(ride.distanceKm)}</Text>
      </View>

      {showChat ? (
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => onOpenChat(ride)}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-outline" size={18} color={COLORS.primary} />
          <Text style={styles.chatButtonText}>Chat in BloodConnect</Text>
        </TouchableOpacity>
      ) : null}

      {isRequested ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.acceptButton, isActing && styles.buttonDisabled]}
            onPress={() => onAccept(ride.id)}
            disabled={isActing}
            activeOpacity={0.85}
          >
            {isActing ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Text style={styles.acceptButtonText}>Accept Ride</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cancelButton, isActing && styles.buttonDisabled]}
            onPress={() => onCancel(ride.id)}
            disabled={isActing}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelButtonText}>Cancel Ride</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isAccepted ? (
        <View style={styles.statusMessageRow}>
          <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.acceptedText} />
          <Text style={styles.finalStatusAccepted}>Ride Accepted</Text>
        </View>
      ) : null}

      {isCompleted ? (
        <View style={styles.statusMessageRow}>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.completedText} />
          <Text style={styles.finalStatusCompleted}>Ride Completed</Text>
        </View>
      ) : null}

      {isCancelled ? (
        <View style={styles.statusMessageRow}>
          <Ionicons name="close-circle-outline" size={18} color={COLORS.cancelledText} />
          <Text style={styles.finalStatusCancelled}>Ride Cancelled</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function RecipientRideRequestsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rides, setRides] = useState([]);
  const [actionId, setActionId] = useState(null);

  const loadRides = useCallback(async () => {
    setError('');

    try {
      const data = await getRecipientRideRequests();
      setRides(Array.isArray(data.rides) ? data.rides : []);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to load ride requests.';

      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadRides();
    }, [loadRides])
  );

  const handleStatusUpdate = async (rideId, status, successMessage) => {
    setActionId(rideId);
    setError('');
    setSuccess('');

    try {
      const data = await updateRideStatus(rideId, status);
      setSuccess(data.message || successMessage);
      await loadRides();
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to update ride status.';
      setError(message);
    } finally {
      setActionId(null);
    }
  };

  const handleOpenChat = (ride) => {
    const donor = ride.donor || {};

    navigation.navigate('Chat', {
      donationRequestId: String(ride.donationRequestId),
      contactName: donor.fullName || 'Donor',
      bloodType: ride.bloodRequest?.bloodTypeNeeded || donor.bloodType || null,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Rides</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.headerDivider} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading ride requests...</Text>
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

          {rides.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="car-outline" size={32} color={COLORS.primary} />
              <Text style={styles.emptyTitle}>No ride requests yet</Text>
              <Text style={styles.emptyText}>
                Ride requests from donors will appear here after a donation is accepted.
              </Text>
            </View>
          ) : (
            rides.map((ride) => (
              <RecipientRideRequestCard
                key={String(ride.id)}
                ride={ride}
                actionId={actionId}
                onAccept={(rideId) => handleStatusUpdate(rideId, 'accepted', 'Ride accepted.')}
                onCancel={(rideId) => handleStatusUpdate(rideId, 'cancelled', 'Ride cancelled.')}
                onOpenChat={handleOpenChat}
              />
            ))
          )}
        </ScrollView>
      )}
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
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  cardQuiet: { opacity: 0.92 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  donorBlock: { marginBottom: 12 },
  donorLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  donorName: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  bloodRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bloodText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  routeSection: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  routeRow: { flexDirection: 'row', gap: 12 },
  routeMarkerCol: { width: 14, alignItems: 'center', paddingTop: 4 },
  routeDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, backgroundColor: COLORS.white },
  routeDotPickup: { borderColor: COLORS.primary },
  routeDotDestination: { borderColor: COLORS.primaryDark },
  routeLine: { flex: 1, width: 2, minHeight: 28, backgroundColor: COLORS.softPink, marginVertical: 4 },
  routeContentCol: { flex: 1, gap: 14 },
  routeStop: { gap: 2 },
  routeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeLabel: { fontSize: 11, fontWeight: '800', color: COLORS.text, letterSpacing: 0.4, textTransform: 'uppercase' },
  routeText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  distanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distanceLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  distanceValue: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
  chatButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  chatButtonText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  acceptButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  acceptButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  cancelButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.cancelledText,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  cancelButtonText: { color: COLORS.cancelledText, fontSize: 15, fontWeight: '700' },
  statusMessageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  finalStatusAccepted: { fontSize: 14, fontWeight: '700', color: COLORS.acceptedText },
  finalStatusCompleted: { fontSize: 14, fontWeight: '700', color: COLORS.completedText },
  finalStatusCancelled: { fontSize: 14, fontWeight: '700', color: COLORS.cancelledText },
  buttonDisabled: { opacity: 0.7 },
  statusRequested: { backgroundColor: COLORS.requestedBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusRequestedText: { fontSize: 10, fontWeight: '800', color: COLORS.requestedText, letterSpacing: 0.3 },
  statusAccepted: { backgroundColor: COLORS.acceptedBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusAcceptedText: { fontSize: 10, fontWeight: '800', color: COLORS.acceptedText, letterSpacing: 0.3 },
  statusCompleted: { backgroundColor: COLORS.completedBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusCompletedText: { fontSize: 10, fontWeight: '800', color: COLORS.completedText, letterSpacing: 0.3 },
  statusCancelled: { backgroundColor: COLORS.cancelledBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusCancelledText: { fontSize: 10, fontWeight: '800', color: COLORS.cancelledText, letterSpacing: 0.3 },
});
