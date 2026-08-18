import { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';

import { createBloodRequest, getMyRecipientProfile } from '../services/api';
import {
  BLOOD_TYPES,
  validateBloodRequestFields,
  formatDateForInput,
} from '../utils/validation';
import {
  getKeyboardAvoidingBehavior,
  getVisibleTextInputProps,
  keyboardLayoutStyles,
  useScrollKeyboardPadding,
} from '../utils/keyboardHelpers';
import {
  applyReverseGeocode,
  fetchCurrentLocationGeoPoint,
  reverseGeocodePosition,
} from '../utils/locationHelpers';
import { applyMapPickedLocation, openLocationPicker, useLocationPickerResult } from '../hooks/useLocationPicker';

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
  green: '#166534',
};

const URGENCY_UI = [
  { value: 'emergency', label: 'Emergency', icon: 'alert-circle', color: '#EF4444' },
  { value: 'urgent', label: 'Urgent', icon: 'time-outline', color: '#F97316' },
  { value: 'normal', label: 'Normal', icon: 'ellipse-outline', color: '#6366F1' },
];

const NOTES_MAX_LENGTH = 500;

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function WelcomeCard() {
  return (
    <View style={styles.welcomeCard}>
      <View style={styles.welcomeIconWrap}>
        <MaterialCommunityIcons name="water" size={22} color={COLORS.primary} />
      </View>
      <View style={styles.welcomeTextWrap}>
        <Text style={styles.welcomeTitle}>Request Blood Support</Text>
        <Text style={styles.welcomeSubtitle}>
          Tell us what you need and we&apos;ll connect you with compatible donors.
        </Text>
      </View>
    </View>
  );
}

export default function CreateBloodRequestScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const [bloodTypeNeeded, setBloodTypeNeeded] = useState('');
  const [unitsNeeded, setUnitsNeeded] = useState(1);
  const [urgency, setUrgency] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalCity, setHospitalCity] = useState('');
  const [hospitalAddressLine, setHospitalAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [bloodTypeModalVisible, setBloodTypeModalVisible] = useState(false);
  const [requestLocationCoordinates, setRequestLocationCoordinates] = useState(null);
  const scrollKeyboardPadding = useScrollKeyboardPadding(24);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [locationDetected, setLocationDetected] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const pendingMapPick = route.params?.pickedLocation ?? null;

    async function prefillFromProfile() {
      try {
        const profile = await getMyRecipientProfile();

        if (!isMounted || !profile) {
          return;
        }

        setBloodTypeNeeded(profile.bloodTypeNeeded || '');
        setUnitsNeeded(profile.unitsNeeded ?? 1);
        setUrgency(profile.urgency || '');
        setRequiredDate(formatDateForInput(profile.requiredDate));
        setHospitalName(profile.hospital?.name || '');
        setHospitalCity(profile.hospital?.city || '');
        setHospitalAddressLine(profile.hospital?.addressLine || '');
        setMedicalNotes(profile.medicalNotes || '');

        if (pendingMapPick) {
          applyMapPickedLocation(pendingMapPick, {
            setLocationError,
            setCoordinates: setRequestLocationCoordinates,
            setLocationDetected,
            setCity,
            setCountry,
            setAddressLine,
          });
          navigation.setParams({ pickedLocation: undefined });
        } else {
          setCity(profile.location?.city || '');
          setCountry(profile.location?.country || '');
          setAddressLine(profile.location?.addressLine || '');
        }
      } catch (err) {
        if (isMounted) {
          console.warn('[CreateBloodRequestScreen] Prefill failed:', err?.message);
        }
      } finally {
        if (isMounted) {
          setPrefillLoading(false);
        }
      }
    }

    prefillFromProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleNotesChange = (value) => {
    setMedicalNotes(value.slice(0, NOTES_MAX_LENGTH));
  };

  const decreaseUnits = () => {
    setUnitsNeeded((current) => Math.max(1, current - 1));
  };

  const increaseUnits = () => {
    setUnitsNeeded((current) => current + 1);
  };

  const applyLocationFieldUpdates = (updates) => {
    if (updates.city) {
      setCity(updates.city);
    }

    if (updates.country) {
      setCountry(updates.country);
    }

    if (updates.addressLine) {
      setAddressLine(updates.addressLine);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (locationLoading || loading) {
      return;
    }

    setLocationError('');
    setLocationLoading(true);

    try {
      const result = await fetchCurrentLocationGeoPoint();

      if (result.error) {
        setLocationError(result.error);
        return;
      }

      setRequestLocationCoordinates(result.geoPoint);
      setLocationDetected(true);

      const place = await reverseGeocodePosition(result.position);

      if (place) {
        applyLocationFieldUpdates(
          applyReverseGeocode(place, {
            city,
            country,
            addressLine,
          })
        );
      }
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Unable to get your current location. Please try again.';
      setLocationError(message);
    } finally {
      setLocationLoading(false);
    }
  };

  const applyPickedLocation = useCallback((picked) => {
    applyMapPickedLocation(picked, {
      setLocationError,
      setCoordinates: setRequestLocationCoordinates,
      setLocationDetected,
      setCity,
      setCountry,
      setAddressLine,
    });
  }, []);

  useLocationPickerResult(route, navigation, applyPickedLocation);

  const handleChooseLocationOnMap = () => {
    if (loading || locationLoading) {
      return;
    }

    openLocationPicker(navigation, 'CreateBloodRequest', {
      initialCoordinates: requestLocationCoordinates,
      currentFields: { city, country, addressLine },
    });
  };

  const handleSubmit = async () => {
    if (loading) return;

    const validation = validateBloodRequestFields({
      bloodTypeNeeded,
      unitsNeeded,
      urgency,
      requiredDate,
      hospitalName,
      hospitalCity,
      hospitalAddressLine,
      city,
      country,
      addressLine,
      medicalNotes,
      title,
    });

    if (validation.error) {
      setSuccess('');
      setError(validation.error);
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    const requestPayload = {
      ...validation.values,
      location: {
        ...validation.values.location,
        ...(requestLocationCoordinates
          ? { coordinates: requestLocationCoordinates }
          : {}),
      },
    };

    try {
      const data = await createBloodRequest(requestPayload);
      setSuccess('Blood request submitted successfully.');
      const requestId =
        data?.request?.id != null ? String(data.request.id).trim() : '';

      setTimeout(() => {
        if (requestId) {
          navigation.navigate('MatchingDonors', { requestId });
        } else {
          navigation.navigate('RecipientHome');
        }
      }, 800);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        (typeof err?.data?.message === 'string' && err.data.message.trim()) ||
        'Failed to submit blood request. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Blood Request</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.headerDivider} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={getKeyboardAvoidingBehavior()}
      >
        <ScrollView
          style={keyboardLayoutStyles.flex}
          contentContainerStyle={[styles.scrollContent, scrollKeyboardPadding]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentCard}>
            {prefillLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : (
              <>
                <WelcomeCard />

                {error ? (
                  <View style={styles.bannerError}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
                {success ? (
                  <View style={styles.bannerSuccess}>
                    <Text style={styles.successText}>{success}</Text>
                  </View>
                ) : null}

                <SectionTitle title="Blood Requirements" />

                <Text style={styles.label}>
                  Blood Type Needed <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity
                  style={styles.selectField}
                  onPress={() => setBloodTypeModalVisible(true)}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="water" size={18} color={COLORS.primary} style={styles.fieldIcon} />
                  <Text style={[styles.selectFieldText, !bloodTypeNeeded && styles.placeholderText]}>
                    {bloodTypeNeeded || 'Select blood type needed'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={COLORS.grayLight} />
                </TouchableOpacity>

                <Text style={styles.label}>
                  Units Needed <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.unitsRow}>
                  <TouchableOpacity
                    style={styles.unitsButton}
                    onPress={decreaseUnits}
                    disabled={loading || unitsNeeded <= 1}
                  >
                    <Ionicons name="remove" size={20} color={COLORS.primary} />
                  </TouchableOpacity>
                  <Text style={styles.unitsValue}>{unitsNeeded}</Text>
                  <TouchableOpacity style={styles.unitsButton} onPress={increaseUnits} disabled={loading}>
                    <Ionicons name="add" size={20} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>
                  Urgency <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.urgencyRow}>
                  {URGENCY_UI.map((option) => {
                    const selected = urgency === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.urgencyCard, selected && styles.urgencyCardSelected]}
                        onPress={() => setUrgency(option.value)}
                        disabled={loading}
                        activeOpacity={0.85}
                      >
                        {selected ? (
                          <View style={styles.urgencyCheck}>
                            <Ionicons name="checkmark" size={10} color={COLORS.white} />
                          </View>
                        ) : null}
                        <Ionicons
                          name={option.icon}
                          size={22}
                          color={selected ? COLORS.primary : option.color}
                        />
                        <Text style={[styles.urgencyCardText, selected && styles.urgencyCardTextSelected]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <SectionTitle title="When & Where" />

                <Text style={styles.label}>Required Date (Optional)</Text>
                <View style={styles.inputField}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="When is blood needed?"
                    placeholderTextColor={COLORS.grayLight}
                    value={requiredDate}
                    onChangeText={setRequiredDate}
                    editable={!loading}
                  />
                </View>
                <Text style={styles.helperText}>Format: YYYY-MM-DD</Text>

                <Text style={styles.label}>
                  Hospital <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.sectionCard}>
                  <View style={styles.sectionCardHeader}>
                    <Ionicons name="business-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.sectionCardHeaderText}>Hospital</Text>
                  </View>
                  <View style={styles.inputField}>
                    <Ionicons name="business-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Hospital Name"
                      placeholderTextColor={COLORS.grayLight}
                      value={hospitalName}
                      onChangeText={setHospitalName}
                      editable={!loading}
                    />
                  </View>
                  <View style={styles.inputField}>
                    <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Hospital City"
                      placeholderTextColor={COLORS.grayLight}
                      value={hospitalCity}
                      onChangeText={setHospitalCity}
                      editable={!loading}
                    />
                  </View>
                  <View style={[styles.inputField, styles.inputFieldLast]}>
                    <Ionicons name="map-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Hospital Address (Optional)"
                      placeholderTextColor={COLORS.grayLight}
                      value={hospitalAddressLine}
                      onChangeText={setHospitalAddressLine}
                      editable={!loading}
                    />
                  </View>
                </View>

                <SectionTitle title="Location" />

                <View style={styles.locationCard}>
                  <View style={styles.inputField}>
                    <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="City"
                      placeholderTextColor={COLORS.grayLight}
                      value={city}
                      onChangeText={setCity}
                      editable={!loading}
                    />
                  </View>
                  <View style={styles.inputField}>
                    <Ionicons name="globe-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Country"
                      placeholderTextColor={COLORS.grayLight}
                      value={country}
                      onChangeText={setCountry}
                      editable={!loading}
                    />
                  </View>
                  <View style={[styles.inputField, styles.inputFieldLast]}>
                    <Ionicons name="home-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Address (Optional)"
                      placeholderTextColor={COLORS.grayLight}
                      value={addressLine}
                      onChangeText={setAddressLine}
                      editable={!loading}
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.locationButton,
                      (locationLoading || loading) && styles.locationButtonDisabled,
                    ]}
                    onPress={handleUseCurrentLocation}
                    disabled={locationLoading || loading}
                    activeOpacity={0.85}
                  >
                    {locationLoading ? (
                      <>
                        <ActivityIndicator size="small" color={COLORS.primary} />
                        <Text style={styles.locationButtonText}>Getting location...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="locate-outline" size={18} color={COLORS.primary} />
                        <Text style={styles.locationButtonText}>Use My Current Location</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.mapButton,
                      (locationLoading || loading) && styles.locationButtonDisabled,
                    ]}
                    onPress={handleChooseLocationOnMap}
                    disabled={locationLoading || loading}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="map-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.mapButtonText}>Choose Location on Map</Text>
                  </TouchableOpacity>

                  {locationDetected ? (
                    <View style={styles.locationSuccessRow}>
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
                      <Text style={styles.locationSuccessText}>Current location detected</Text>
                    </View>
                  ) : null}

                  {locationError ? (
                    <Text style={styles.locationErrorText}>{locationError}</Text>
                  ) : null}
                </View>

                <SectionTitle title="Additional Information" />

                <Text style={styles.label}>Medical Notes (Optional)</Text>
                <View style={styles.notesField}>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Share any relevant medical details..."
                    placeholderTextColor={COLORS.grayLight}
                    value={medicalNotes}
                    onChangeText={handleNotesChange}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    editable={!loading}
                  />
                  <Text style={styles.notesCounter}>{medicalNotes.length}/{NOTES_MAX_LENGTH}</Text>
                </View>

                <Text style={styles.label}>Request Title (Optional)</Text>
                <View style={styles.inputField}>
                  <Ionicons name="document-text-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Blood needed for surgery"
                    placeholderTextColor={COLORS.grayLight}
                    value={title}
                    onChangeText={setTitle}
                    editable={!loading}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.9}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="water" size={20} color={COLORS.white} />
                      <Text style={styles.saveButtonText}>Submit Blood Request</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={bloodTypeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBloodTypeModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBloodTypeModalVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Select blood type needed</Text>
            {BLOOD_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.modalOption, bloodTypeNeeded === type && styles.modalOptionSelected]}
                onPress={() => {
                  setBloodTypeNeeded(type);
                  setBloodTypeModalVisible(false);
                }}
              >
                <MaterialCommunityIcons
                  name="water"
                  size={18}
                  color={bloodTypeNeeded === type ? COLORS.primary : COLORS.grayLight}
                />
                <Text style={[styles.modalOptionText, bloodTypeNeeded === type && styles.modalOptionTextSelected]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
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
  scrollContent: { padding: 16, paddingBottom: 32 },
  contentCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  welcomeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.softPinkLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
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
  welcomeTextWrap: { flex: 1 },
  welcomeTitle: { fontSize: 16, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  welcomeSubtitle: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  required: { color: COLORS.primary },
  helperText: { fontSize: 12, color: COLORS.grayLight, marginTop: -8, marginBottom: 16 },
  bannerError: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorText: { color: COLORS.errorText, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  bannerSuccess: {
    backgroundColor: COLORS.successBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successText: { color: COLORS.successText, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 10,
  },
  inputFieldLast: { marginBottom: 12 },
  locationCard: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  mapButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  locationButtonDisabled: { opacity: 0.75 },
  locationButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  locationSuccessRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingHorizontal: 4 },
  locationSuccessText: { fontSize: 13, fontWeight: '600', color: COLORS.successText },
  locationErrorText: {
    color: COLORS.errorText,
    backgroundColor: COLORS.errorBg,
    padding: 10,
    borderRadius: 12,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldIcon: { marginRight: 10 },
  textInput: { flex: 1, fontSize: 15, color: COLORS.text, paddingVertical: 10 },
  selectFieldText: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '600' },
  placeholderText: { color: COLORS.grayLight, fontWeight: '400' },
  sectionCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    padding: 12,
    marginBottom: 18,
  },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionCardHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  urgencyRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  urgencyCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  urgencyCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.softPinkLight },
  urgencyCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgencyCardText: { marginTop: 8, fontSize: 12, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  urgencyCardTextSelected: { color: COLORS.primary, fontWeight: '700' },
  unitsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 18 },
  unitsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitsValue: { fontSize: 24, fontWeight: '800', color: COLORS.text, minWidth: 40, textAlign: 'center' },
  notesField: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 18,
    minHeight: 120,
  },
  notesInput: { fontSize: 15, color: COLORS.text, minHeight: 80, padding: 0 },
  notesCounter: { alignSelf: 'flex-end', fontSize: 12, color: COLORS.grayLight, marginTop: 6 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 4,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  saveButtonDisabled: { opacity: 0.75 },
  saveButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 12, textAlign: 'center' },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
  },
  modalOptionSelected: { backgroundColor: COLORS.softPinkLight },
  modalOptionText: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
  modalOptionTextSelected: { color: COLORS.primary, fontWeight: '700' },
});
