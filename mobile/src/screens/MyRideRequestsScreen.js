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
  FlatList,
  ActivityIndicator,
} from 'react-native';

import { getMyRideRequests, updateRideStatus } from '../services/api';

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
  successBg: '#DDF6E7',
  successText: '#166534',
  requestedBg: '#FFEDD5',
  requestedText: '#C2410C',
  acceptedBg: '#DDF6E7',
  acceptedText: '#166534',
  completedBg: '#DBEAFE',
  completedText: '#1D4ED8',
  cancelledBg: '#FEE2E2',
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

  const parts = [location.addressLine, location.city, location.country].filter(Boolean);

  return parts.length ? parts.join(', ') : '—';
}

function formatDistanceLabel(distanceKm) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) {
    return '—';
  }

  return `${distanceKm.toFixed(1)} km`;
}

function formatDisplayDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (isToday) {
    return 'Requested today';
  }

  return `Requested ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
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

function RideRequestCard({ ride, actionId, onCancel, onComplete, onOpenChat }) {
  const statusStyle = getStatusStyle(ride.status);
  const normalizedStatus = String(ride.status || '').toLowerCase();
  const isRequested = normalizedStatus === 'requested';
  const isAccepted = normalizedStatus === 'accepted';
  const isCompleted = normalizedStatus === 'completed';
  const isCancelled = normalizedStatus === 'cancelled';
  const isActing = actionId === ride.id;
  const showChat = isRequested || isAccepted;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Ride Request</Text>
        <View style={statusStyle.badge}>
          <Text style={statusStyle.text}>{statusStyle.label}</Text>
        </View>
      </View>

      <RouteSection
        pickup={formatLocationLabel(ride.pickupLocation)}
        destination={formatLocationLabel(ride.destinationLocation)}
      />

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="navigate-outline" size={15} color={COLORS.textSecondary} />
          <View style={styles.metaTextWrap}>
            <Text style={styles.metaLabel}>Distance</Text>
            <Text style={styles.metaValue}>{formatDistanceLabel(ride.distanceKm)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.donationBox}>
        <View style={styles.donationHeader}>
          <MaterialCommunityIcons name="water" size={16} color={COLORS.primary} />
          <Text style={styles.donationLabel}>Donation</Text>
        </View>
        {ride.bloodRequest?.bloodTypeNeeded ? (
          <Text style={styles.donationBloodType}>
            {ride.bloodRequest.bloodTypeNeeded} blood needed
          </Text>
        ) : null}
        <Text style={styles.donationSubtext}>Blood donation request</Text>
      </View>

      <Text style={styles.createdText}>{formatDisplayDate(ride.createdAt)}</Text>

      {showChat ? (
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => onOpenChat(ride)}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-outline" size={18} color={COLORS.primary} />
          <Text style={styles.chatButtonText}>In-App Chat</Text>
        </TouchableOpacity>
      ) : null}

      {isRequested ? (
        <TouchableOpacity
          style={[styles.cancelButton, isActing && styles.buttonDisabled]}
          onPress={() => onCancel(ride.id)}
          disabled={isActing}
          activeOpacity={0.85}
        >
          {isActing ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Text style={styles.cancelButtonText}>Cancel Ride</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {isAccepted ? (
        <TouchableOpacity
          style={[styles.completeButton, isActing && styles.buttonDisabled]}
          onPress={() => onComplete(ride.id)}
          disabled={isActing}
          activeOpacity={0.85}
        >
          {isActing ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <Text style={styles.completeButtonText}>Complete Ride</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {isCompleted ? <Text style={styles.finalStatusText}>Completed</Text> : null}
      {isCancelled ? <Text style={styles.finalStatusMuted}>Cancelled</Text> : null}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="car-outline" size={32} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>No ride requests yet</Text>
      <Text style={styles.emptySubtitle}>
        Your ride requests will appear here after you request a ride for an accepted donation.
      </Text>
    </View>
  );
}

export default function MyRideRequestsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rides, setRides] = useState([]);
  const [actionId, setActionId] = useState(null);

  const loadRides = useCallback(async () => {
    setError('');

    try {
      const data = await getMyRideRequests();
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
    navigation.navigate('Chat', {
      donationRequestId: String(ride.donationRequestId),
      contactName: ride.recipient?.fullName || 'Recipient',
      bloodType: ride.bloodRequest?.bloodTypeNeeded || null,
    });
  };

  const listHeader = (
    <>
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
    </>
  );

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
        <FlatList
          data={rides}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <RideRequestCard
              ride={item}
              actionId={actionId}
              onCancel={(rideId) => handleStatusUpdate(rideId, 'cancelled', 'Ride cancelled.')}
              onComplete={(rideId) => handleStatusUpdate(rideId, 'completed', 'Ride completed.')}
              onOpenChat={handleOpenChat}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            rides.length === 0 && styles.listContentEmpty,
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

  successBanner: {
    backgroundColor: COLORS.successBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },

  successText: {
    color: COLORS.successText,
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

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },

  routeSection: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  routeRow: {
    flexDirection: 'row',
    gap: 12,
  },

  routeMarkerCol: {
    width: 14,
    alignItems: 'center',
    paddingTop: 4,
  },

  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: COLORS.white,
  },

  routeDotPickup: {
    borderColor: COLORS.primary,
  },

  routeDotDestination: {
    borderColor: COLORS.primaryDark,
  },

  routeLine: {
    flex: 1,
    width: 2,
    minHeight: 28,
    backgroundColor: COLORS.softPink,
    marginVertical: 4,
  },

  routeContentCol: {
    flex: 1,
    gap: 14,
  },

  routeStop: {
    gap: 2,
  },

  routeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  routeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  routeText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  metaRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },

  metaItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },

  metaTextWrap: {
    flex: 1,
  },

  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },

  metaValue: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  donationBox: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.softPinkLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  donationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },

  donationLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  donationBloodType: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },

  donationSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  createdText: {
    fontSize: 12,
    color: COLORS.grayLight,
    marginBottom: 4,
  },

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

  chatButtonText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
  },

  cancelButton: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },

  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },

  completeButton: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },

  completeButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },

  finalStatusText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.completedText,
    textAlign: 'center',
  },

  finalStatusMuted: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.cancelledText,
    textAlign: 'center',
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  statusRequested: {
    backgroundColor: COLORS.requestedBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  statusRequestedText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.requestedText,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  statusAccepted: {
    backgroundColor: COLORS.acceptedBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  statusAcceptedText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.acceptedText,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  statusCompleted: {
    backgroundColor: COLORS.completedBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  statusCompletedText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.completedText,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  statusCancelled: {
    backgroundColor: COLORS.cancelledBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  statusCancelledText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.cancelledText,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
