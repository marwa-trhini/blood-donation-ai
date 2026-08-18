import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  buildGeoPointFromGps,
  buildMapConfirmedLocationSelection,
  formatPlacePreviewLabel,
  getInitialMapCoordinate,
  getMapRegionForCoordinate,
  reverseGeocodeCoordinates,
} from '../utils/locationHelpers';

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
};

export default function LocationPickerScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const initialCoordinates = route.params?.initialCoordinates ?? null;
  const currentFields = route.params?.currentFields ?? {
    city: '',
    country: '',
    addressLine: '',
  };
  const returnRouteName = route.params?.returnRouteName;

  const initialCoordinate = useMemo(
    () => getInitialMapCoordinate(initialCoordinates),
    [initialCoordinates]
  );

  const [selectedCoordinate, setSelectedCoordinate] = useState(initialCoordinate);
  const [previewLabel, setPreviewLabel] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshPreviewLabel = useCallback(async (latitude, longitude) => {
    setPreviewLoading(true);

    try {
      const place = await reverseGeocodeCoordinates(latitude, longitude);
      const label = formatPlacePreviewLabel(place);

      setPreviewLabel(label || 'Selected location');
    } catch (previewError) {
      console.warn('[LocationPickerScreen] Preview geocoding failed:', previewError?.message);
      setPreviewLabel('Selected location');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const initialRegion = useMemo(
    () => getMapRegionForCoordinate(initialCoordinate),
    [initialCoordinate]
  );

  useEffect(() => {
    refreshPreviewLabel(initialCoordinate.latitude, initialCoordinate.longitude);
  }, [initialCoordinate, refreshPreviewLabel]);

  const handleMapPress = async (event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setError('');
    setSelectedCoordinate({ latitude, longitude });
    await refreshPreviewLabel(latitude, longitude);
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  const handleConfirm = async () => {
    if (confirmLoading || !returnRouteName) {
      return;
    }

    setConfirmLoading(true);
    setError('');

    try {
      const geoPoint = buildGeoPointFromGps(
        selectedCoordinate.latitude,
        selectedCoordinate.longitude
      );

      if (!geoPoint) {
        setError('Unable to use the selected location. Please try again.');
        return;
      }

      const place = await reverseGeocodeCoordinates(
        selectedCoordinate.latitude,
        selectedCoordinate.longitude
      );

      const pickedLocation = buildMapConfirmedLocationSelection(
        geoPoint,
        place,
        currentFields
      );

      navigation.navigate({
        name: returnRouteName,
        params: { pickedLocation },
        merge: true,
      });
    } catch (confirmError) {
      const message =
        (typeof confirmError?.message === 'string' && confirmError.message.trim()) ||
        'Unable to confirm the selected location. Please try again.';
      setError(message);
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose Location</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.headerDivider} />

      <View style={styles.mapWrap}>
        <MapView
          style={styles.map}
          initialRegion={initialRegion}
          onPress={handleMapPress}
        >
          <Marker coordinate={selectedCoordinate} pinColor={COLORS.primary} />
        </MapView>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Selected location</Text>
        {previewLoading ? (
          <View style={styles.previewLoadingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.previewText}>Loading location details...</Text>
          </View>
        ) : (
          <Text style={styles.previewText}>
            {previewLabel || 'Tap the map to choose a location'}
          </Text>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.confirmButton, confirmLoading && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={confirmLoading}
          activeOpacity={0.9}
        >
          {confirmLoading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm Location</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={confirmLoading}
          activeOpacity={0.85}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
  },
  headerSpacer: { width: 40 },
  headerDivider: { height: 1, backgroundColor: COLORS.border },
  mapWrap: { flex: 1, backgroundColor: COLORS.border },
  map: { flex: 1 },
  footer: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  footerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  previewText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.navy,
    marginBottom: 14,
  },
  errorText: {
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  cancelButtonText: {
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: { opacity: 0.75 },
});
