import { useCallback, useState } from 'react';
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
} from 'react-native';

import { getBloodRequest } from '../services/api';

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
  infoBg: '#FEF3C7',
  infoText: '#92400E',
  openBg: '#DCFCE7',
  openText: '#166534',
};

function formatUrgency(value) {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDisplayDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatStatus(value) {
  if (!value) return '—';
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function DetailRow({ icon, label, value }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={COLORS.gray} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function BloodRequestDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const requestId =
    route.params?.requestId != null ? String(route.params.requestId).trim() : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(null);

  const loadRequest = useCallback(async () => {
    setError('');

    if (!requestId) {
      setError('Blood request not found.');
      setRequest(null);
      setLoading(false);
      return;
    }

    try {
      const data = await getBloodRequest(requestId);
      setRequest(data.request || null);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Failed to load blood request details.';
      setError(message);
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadRequest();
    }, [loadRequest])
  );

  const isOpen = request?.status === 'open';
  const locationLine = [
    request?.location?.city,
    request?.location?.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blood Request Details</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.headerDivider} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading blood request...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {request ? (
            <>
              {!isOpen ? (
                <View style={styles.infoBanner}>
                  <Text style={styles.infoBannerText}>
                    This blood request is no longer open.
                  </Text>
                </View>
              ) : null}

              <View style={styles.card}>
                <View style={styles.titleRow}>
                  <MaterialCommunityIcons name="water" size={24} color={COLORS.primary} />
                  <Text style={styles.titleText}>
                    {request.title || 'Blood Request'}
                  </Text>
                </View>

                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {formatStatus(request.status).toUpperCase()}
                  </Text>
                </View>

                <Text style={styles.bloodTypeLine}>{request.bloodTypeNeeded} blood needed</Text>

                <DetailRow
                  icon="flask-outline"
                  label="Units needed:"
                  value={String(request.unitsNeeded ?? '—')}
                />
                <DetailRow
                  icon="alert-circle-outline"
                  label="Urgency:"
                  value={formatUrgency(request.urgency)}
                />
                <DetailRow
                  icon="calendar-outline"
                  label="Required date:"
                  value={formatDisplayDate(request.requiredDate)}
                />
                <DetailRow
                  icon="business-outline"
                  label="Hospital:"
                  value={request.hospital?.name || '—'}
                />
                <DetailRow
                  icon="location-outline"
                  label="Location:"
                  value={locationLine || '—'}
                />
                <DetailRow
                  icon="time-outline"
                  label="Posted:"
                  value={formatDisplayDate(request.createdAt)}
                />

                {request.medicalNotes ? (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesTitle}>Medical Notes</Text>
                    <Text style={styles.notesText}>{request.medicalNotes}</Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
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
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.navy },
  headerSpacer: { width: 40 },
  headerDivider: { height: 1, backgroundColor: COLORS.border },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.gray },
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
  infoBanner: {
    backgroundColor: COLORS.infoBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoBannerText: {
    color: COLORS.infoText,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  titleText: { flex: 1, fontSize: 20, fontWeight: '700', color: COLORS.navy },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.openBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.openText },
  bloodTypeLine: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  detailLabel: { width: 118, fontSize: 14, color: COLORS.gray, fontWeight: '600' },
  detailValue: { flex: 1, fontSize: 14, color: COLORS.navy },
  notesBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notesTitle: { fontSize: 13, fontWeight: '700', color: COLORS.navy, marginBottom: 6 },
  notesText: { fontSize: 14, color: COLORS.gray, lineHeight: 20 },
});
