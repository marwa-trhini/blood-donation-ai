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

import {
  createRecipientProfile,
  getCurrentUser,
  getMyRecipientProfile,
  updateRecipientProfile,
} from '../services/api';
import {
  BLOOD_TYPES,
  validateRecipientProfileFields,
  formatDateForInput,
} from '../utils/validation';
import {
  applyReverseGeocode,
  fetchCurrentLocationGeoPoint,
  parseStoredCoordinates,
  reverseGeocodePosition,
} from '../utils/locationHelpers';
import BottomTabBar, { bottomTabBarSafeAreaStyle } from '../components/BottomTabBar';
import { confirmLogout } from '../utils/authHelpers';
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
  green: '#166534',
  greenBg: '#DDF6E7',
  errorBg: '#FEE2E2',
  errorText: '#641522',
  successBg: '#DDF6E7',
  successText: '#166534',
};

const GENDER_UI = [
  { value: 'male', label: 'Male', icon: 'male', color: '#3B82F6' },
  { value: 'female', label: 'Female', icon: 'female', color: '#EC4899' },
  {
    value: 'prefer_not_to_say',
    label: 'Prefer not to say',
    icon: 'eye-off-outline',
    color: '#F97316',
  },
];

const URGENCY_UI = [
  { value: 'emergency', label: 'Emergency', icon: 'alert-circle', color: '#EF4444' },
  { value: 'urgent', label: 'Urgent', icon: 'time-outline', color: '#F97316' },
  { value: 'normal', label: 'Normal', icon: 'ellipse-outline', color: '#6366F1' },
];

const NOTES_MAX_LENGTH = 500;

function displayValue(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || '—';
}

function getGenderLabel(value) {
  const match = GENDER_UI.find((option) => option.value === value);
  return match?.label || '—';
}

function getUrgencyLabel(value) {
  const match = URGENCY_UI.find((option) => option.value === value);
  return match?.label || '—';
}

function formatLocationSummary(city, country, addressLine) {
  const parts = [addressLine, city, country]
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  return parts.length ? parts.join(', ') : '—';
}

function formatHospitalSummary(name, city, addressLine) {
  const parts = [name, addressLine, city]
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  return parts.length ? parts.join(', ') : '—';
}

function ProgressIndicator({ activeStep, onStepPress, disabled }) {
  const isDetails = activeStep === 'details';
  const isReview = activeStep === 'review';

  return (
    <View style={styles.progressRow}>
      <TouchableOpacity
        style={styles.progressStep}
        onPress={() => onStepPress('details')}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <View style={[styles.progressDot, isDetails && styles.progressDotActive]} />
        <Text style={isDetails ? styles.progressLabelActive : styles.progressLabel}>
          Profile Details
        </Text>
      </TouchableOpacity>

      <View style={[styles.progressLine, isReview && styles.progressLineActive]} />

      <TouchableOpacity
        style={styles.progressStep}
        onPress={() => onStepPress('review')}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <View style={[styles.progressDot, isReview && styles.progressDotActive]} />
        <Text style={isReview ? styles.progressLabelActive : styles.progressLabel}>
          Review
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function ReviewRow({ label, value }) {
  const filled = displayValue(value) !== '—';

  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewRowContent}>
        <Text style={styles.reviewLabel}>{label}</Text>
        <Text style={styles.reviewValue}>{displayValue(value)}</Text>
      </View>
      {filled ? (
        <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
      ) : (
        <Ionicons name="ellipse-outline" size={20} color={COLORS.grayLight} />
      )}
    </View>
  );
}

function ReviewSection({ title, children }) {
  return (
    <View style={styles.reviewSection}>
      <Text style={styles.reviewSectionTitle}>{title}</Text>
      <View style={styles.reviewSectionCard}>{children}</View>
    </View>
  );
}

function RecipientProfileReview({
  userFullName,
  bloodTypeNeeded,
  dateOfBirth,
  gender,
  city,
  country,
  addressLine,
  locationDetected,
  hospitalName,
  hospitalCity,
  hospitalAddressLine,
  urgency,
  requiredDate,
  unitsNeeded,
  medicalNotes,
  emergencyContactName,
  emergencyContactPhone,
  onEdit,
  onSave,
  loading,
}) {
  const emergencySummary = [emergencyContactName, emergencyContactPhone]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewHeaderIconWrap}>
          <Ionicons name="document-text-outline" size={22} color={COLORS.primary} />
        </View>
        <View style={styles.reviewHeaderText}>
          <Text style={styles.reviewTitle}>Review Your Profile</Text>
          <Text style={styles.reviewSubtitle}>
            Confirm your details before saving. You can go back to edit anytime.
          </Text>
        </View>
      </View>

      <ReviewSection title="Personal Information">
        {userFullName ? <ReviewRow label="Full Name" value={userFullName} /> : null}
        <ReviewRow label="Blood Type Needed" value={bloodTypeNeeded} />
        <ReviewRow label="Date of Birth" value={dateOfBirth} />
        <ReviewRow label="Gender" value={getGenderLabel(gender)} />
      </ReviewSection>

      <ReviewSection title="Location">
        <ReviewRow
          label="Address"
          value={formatLocationSummary(city, country, addressLine)}
        />
        {locationDetected ? (
          <View style={styles.reviewStatusRow}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
            <Text style={styles.reviewStatusText}>GPS location detected</Text>
          </View>
        ) : null}
      </ReviewSection>

      <ReviewSection title="Hospital">
        <ReviewRow
          label="Hospital"
          value={formatHospitalSummary(hospitalName, hospitalCity, hospitalAddressLine)}
        />
      </ReviewSection>

      <ReviewSection title="Request Details">
        <ReviewRow label="Urgency Level" value={getUrgencyLabel(urgency)} />
        <ReviewRow label="Required Date" value={requiredDate} />
        <ReviewRow label="Units Needed" value={String(unitsNeeded)} />
        {medicalNotes.trim() ? <ReviewRow label="Medical Notes" value={medicalNotes} /> : null}
      </ReviewSection>

      {emergencySummary ? (
        <ReviewSection title="Emergency Contact">
          <ReviewRow label="Contact" value={emergencySummary} />
        </ReviewSection>
      ) : null}

      <TouchableOpacity
        style={styles.editButton}
        onPress={onEdit}
        disabled={loading}
        activeOpacity={0.9}
      >
        <Ionicons name="create-outline" size={20} color={COLORS.primary} />
        <Text style={styles.editButtonText}>Edit Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveButton, loading && styles.saveButtonDisabled]}
        onPress={onSave}
        disabled={loading}
        activeOpacity={0.9}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <>
            <Ionicons name="save-outline" size={20} color={COLORS.white} />
            <Text style={styles.saveButtonText}>Save Profile</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );
}

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function WelcomeCard() {
  return (
    <View style={styles.welcomeCard}>
      <View style={styles.welcomeIconWrap}>
        <Ionicons name="heart" size={22} color={COLORS.primary} />
      </View>
      <View style={styles.welcomeTextWrap}>
        <Text style={styles.welcomeTitle}>Your BloodConnect Profile</Text>
        <Text style={styles.welcomeSubtitle}>
          Keep your information updated so we can help match your blood requests.
        </Text>
      </View>
    </View>
  );
}

export default function RecipientProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const [bloodTypeNeeded, setBloodTypeNeeded] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalCity, setHospitalCity] = useState('');
  const [hospitalAddressLine, setHospitalAddressLine] = useState('');
  const [urgency, setUrgency] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [unitsNeeded, setUnitsNeeded] = useState(1);
  const [medicalNotes, setMedicalNotes] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [hasExistingProfile, setHasExistingProfile] = useState(false);
  const [bloodTypeModalVisible, setBloodTypeModalVisible] = useState(false);
  const [locationCoordinates, setLocationCoordinates] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [locationDetected, setLocationDetected] = useState(false);
  const [profileStep, setProfileStep] = useState('details');
  const [userFullName, setUserFullName] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadUserName() {
      try {
        const data = await getCurrentUser();
        if (isMounted) {
          setUserFullName(data?.user?.fullName || '');
        }
      } catch {
        // Optional display field — ignore fetch failures.
      }
    }

    loadUserName();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const pendingMapPick = route.params?.pickedLocation ?? null;

    async function loadProfile() {
      try {
        const profile = await getMyRecipientProfile();

        if (!isMounted || !profile) {
          return;
        }

        setHasExistingProfile(true);
        setBloodTypeNeeded(profile.bloodTypeNeeded || '');
        setDateOfBirth(formatDateForInput(profile.dateOfBirth));
        setGender(profile.gender || '');
        setHospitalName(profile.hospital?.name || '');
        setHospitalCity(profile.hospital?.city || '');
        setHospitalAddressLine(profile.hospital?.addressLine || '');
        setUrgency(profile.urgency || '');
        setRequiredDate(formatDateForInput(profile.requiredDate));
        setUnitsNeeded(profile.unitsNeeded ?? 1);
        setMedicalNotes(profile.medicalNotes || '');
        setEmergencyContactName(profile.emergencyContact?.name || '');
        setEmergencyContactPhone(profile.emergencyContact?.phoneNumber || '');

        if (pendingMapPick) {
          applyMapPickedLocation(pendingMapPick, {
            setLocationError,
            setCoordinates: setLocationCoordinates,
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

          const storedCoordinates = parseStoredCoordinates(profile.location?.coordinates);
          if (storedCoordinates) {
            setLocationCoordinates(storedCoordinates);
            setLocationDetected(true);
          }
        }
      } catch (err) {
        if (isMounted) {
          const message =
            (typeof err?.message === 'string' && err.message.trim()) ||
            'Unable to load recipient profile.';

          setError(message);
        }
      } finally {
        if (isMounted) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();

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

      setLocationCoordinates(result.geoPoint);
      setLocationDetected(true);

      const place = await reverseGeocodePosition(result.position);

      if (place) {
        const updates = applyReverseGeocode(place, {
          city,
          country,
          addressLine,
        });

        if (updates.city) {
          setCity(updates.city);
        }

        if (updates.country) {
          setCountry(updates.country);
        }

        if (updates.addressLine) {
          setAddressLine(updates.addressLine);
        }
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
      setCoordinates: setLocationCoordinates,
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

    openLocationPicker(navigation, 'RecipientProfile', {
      initialCoordinates: locationCoordinates,
      currentFields: { city, country, addressLine },
    });
  };

  const handleSubmit = async () => {
    if (loading) return;

    const validation = validateRecipientProfileFields({
      bloodTypeNeeded,
      dateOfBirth,
      gender: gender || null,
      city,
      country,
      addressLine,
      hospitalName,
      hospitalCity,
      hospitalAddressLine,
      urgency,
      requiredDate,
      unitsNeeded,
      medicalNotes,
      emergencyContactName,
      emergencyContactPhone,
    });

    if (validation.error) {
      setSuccess('');
      setError(validation.error);
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    const profilePayload = {
      ...validation.values,
      location: {
        ...validation.values.location,
        ...(locationCoordinates ? { coordinates: locationCoordinates } : {}),
      },
    };

    try {
      if (hasExistingProfile) {
        await updateRecipientProfile(profilePayload);
      } else {
        await createRecipientProfile(profilePayload);
        setHasExistingProfile(true);
      }

      setSuccess('Recipient profile saved successfully.');
      setTimeout(() => navigation.navigate('RecipientHome'), 800);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        (typeof err?.data?.message === 'string' && err.data.message.trim()) ||
        'Failed to save recipient profile. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleStepPress = (step) => {
    if (loading) {
      return;
    }

    setProfileStep(step);
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
        <Text style={styles.headerTitle}>Recipient Profile</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.headerDivider} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentCard}>
            {profileLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading profile...</Text>
              </View>
            ) : (
              <>
            <ProgressIndicator
              activeStep={profileStep}
              onStepPress={handleStepPress}
              disabled={loading}
            />

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

            {profileStep === 'details' ? (
              <>
            <WelcomeCard />

            <SectionTitle title="Personal Information" />

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
                {bloodTypeNeeded ? bloodTypeNeeded : 'Select blood type needed'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.grayLight} />
            </TouchableOpacity>

            <Text style={styles.label}>
              Date of Birth <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.inputField}>
              <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Select your date of birth"
                placeholderTextColor={COLORS.grayLight}
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                editable={!loading}
              />
            </View>
            <Text style={styles.helperText}>Format: YYYY-MM-DD</Text>

            <Text style={styles.label}>Gender (Optional)</Text>
            <View style={styles.genderRow}>
              {GENDER_UI.map((option) => {
                const selected = gender === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.genderCard, selected && styles.genderCardSelected]}
                    onPress={() => setGender(option.value)}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {selected ? (
                      <View style={styles.genderCheck}>
                        <Ionicons name="checkmark" size={12} color={COLORS.white} />
                      </View>
                    ) : null}
                    <Ionicons name={option.icon} size={22} color={selected ? COLORS.primary : option.color} />
                    <Text style={[styles.genderCardText, selected && styles.genderCardTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <SectionTitle title="Location" />

            <View style={styles.locationCard}>
              <View style={styles.inputField}>
                <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                <TextInput style={styles.textInput} placeholder="City" placeholderTextColor={COLORS.grayLight} value={city} onChangeText={setCity} editable={!loading} />
              </View>
              <View style={styles.inputField}>
                <Ionicons name="globe-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                <TextInput style={styles.textInput} placeholder="Country" placeholderTextColor={COLORS.grayLight} value={country} onChangeText={setCountry} editable={!loading} />
              </View>
              <View style={[styles.inputField, styles.inputFieldLast]}>
                <Ionicons name="home-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                <TextInput style={styles.textInput} placeholder="Address (Optional)" placeholderTextColor={COLORS.grayLight} value={addressLine} onChangeText={setAddressLine} editable={!loading} />
              </View>

              <TouchableOpacity
                style={[styles.locationButton, (locationLoading || loading) && styles.locationButtonDisabled]}
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
                style={[styles.mapButton, (locationLoading || loading) && styles.locationButtonDisabled]}
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

            <SectionTitle title="Hospital" />

            <View style={styles.sectionCard}>
              <View style={styles.sectionCardHeader}>
                <Ionicons name="business-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionCardHeaderText}>Hospital Information</Text>
              </View>
              <View style={styles.inputField}>
                <Ionicons name="business-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                <TextInput style={styles.textInput} placeholder="Hospital Name" placeholderTextColor={COLORS.grayLight} value={hospitalName} onChangeText={setHospitalName} editable={!loading} />
              </View>
              <View style={styles.inputField}>
                <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                <TextInput style={styles.textInput} placeholder="Hospital City" placeholderTextColor={COLORS.grayLight} value={hospitalCity} onChangeText={setHospitalCity} editable={!loading} />
              </View>
              <View style={[styles.inputField, styles.inputFieldLast]}>
                <Ionicons name="map-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                <TextInput style={styles.textInput} placeholder="Hospital Address (Optional)" placeholderTextColor={COLORS.grayLight} value={hospitalAddressLine} onChangeText={setHospitalAddressLine} editable={!loading} />
              </View>
            </View>

            <SectionTitle title="Urgency" />

            <Text style={styles.label}>
              Urgency Level <Text style={styles.required}>*</Text>
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
                    <Ionicons name={option.icon} size={22} color={selected ? COLORS.primary : option.color} />
                    <Text style={[styles.urgencyCardText, selected && styles.urgencyCardTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <SectionTitle title="Request Details" />

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
              Units Needed <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.unitsRow}>
              <TouchableOpacity style={styles.unitsButton} onPress={decreaseUnits} disabled={loading || unitsNeeded <= 1}>
                <Ionicons name="remove" size={20} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.unitsValue}>{unitsNeeded}</Text>
              <TouchableOpacity style={styles.unitsButton} onPress={increaseUnits} disabled={loading}>
                <Ionicons name="add" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Reason / Medical Notes (Optional)</Text>
            <View style={styles.notesField}>
              <TextInput
                style={styles.notesInput}
                placeholder="Share any relevant medical information..."
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

            <SectionTitle title="Emergency Contact" />

            <View style={styles.sectionCard}>
              <View style={styles.inputField}>
                <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                <TextInput style={styles.textInput} placeholder="Name" placeholderTextColor={COLORS.grayLight} value={emergencyContactName} onChangeText={setEmergencyContactName} editable={!loading} />
              </View>
              <View style={[styles.inputField, styles.inputFieldLast]}>
                <Ionicons name="call-outline" size={18} color={COLORS.textSecondary} style={styles.fieldIcon} />
                <TextInput style={styles.textInput} placeholder="Phone Number" placeholderTextColor={COLORS.grayLight} value={emergencyContactPhone} onChangeText={setEmergencyContactPhone} keyboardType="phone-pad" editable={!loading} />
              </View>
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
                  <Ionicons name="save-outline" size={20} color={COLORS.white} />
                  <Text style={styles.saveButtonText}>Save Profile</Text>
                </>
              )}
            </TouchableOpacity>
              </>
            ) : (
              <RecipientProfileReview
                userFullName={userFullName}
                bloodTypeNeeded={bloodTypeNeeded}
                dateOfBirth={dateOfBirth}
                gender={gender}
                city={city}
                country={country}
                addressLine={addressLine}
                locationDetected={locationDetected}
                hospitalName={hospitalName}
                hospitalCity={hospitalCity}
                hospitalAddressLine={hospitalAddressLine}
                urgency={urgency}
                requiredDate={requiredDate}
                unitsNeeded={unitsNeeded}
                medicalNotes={medicalNotes}
                emergencyContactName={emergencyContactName}
                emergencyContactPhone={emergencyContactPhone}
                onEdit={() => handleStepPress('details')}
                onSave={handleSubmit}
                loading={loading}
              />
            )}

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => confirmLogout(navigation)}
              disabled={loading}
              activeOpacity={0.9}
            >
              <Ionicons name="log-out-outline" size={20} color={COLORS.primary} />
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SafeAreaView edges={['bottom']} style={bottomTabBarSafeAreaStyle}>
        <BottomTabBar
          activeKey="profile"
          navigation={navigation}
          onHomePress={() => navigation.navigate('RecipientHome')}
          onRequestsPress={() => navigation.navigate('RecipientDonationRequests')}
          onAiPress={() => navigation.navigate('AIAssistant')}
          onMessagesPress={() => navigation.navigate('Messages')}
          onProfilePress={() => navigation.navigate('RecipientProfile')}
        />
      </SafeAreaView>

      <Modal visible={bloodTypeModalVisible} transparent animationType="fade" onRequestClose={() => setBloodTypeModalVisible(false)}>
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
                <MaterialCommunityIcons name="water" size={18} color={bloodTypeNeeded === type ? COLORS.primary : COLORS.grayLight} />
                <Text style={[styles.modalOptionText, bloodTypeNeeded === type && styles.modalOptionTextSelected]}>{type}</Text>
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
  scrollContent: { padding: 16, paddingBottom: 24 },
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
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  progressStep: { alignItems: 'center', minWidth: 96 },
  progressDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#D1D5DB', marginBottom: 8 },
  progressDotActive: { backgroundColor: COLORS.primary, width: 14, height: 14, borderRadius: 7 },
  progressLabel: { fontSize: 12, color: COLORS.grayLight, fontWeight: '600' },
  progressLabelActive: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  progressLine: { width: 72, height: 2, backgroundColor: COLORS.softPink, marginHorizontal: 10, marginBottom: 22 },
  progressLineActive: { backgroundColor: COLORS.primary },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.softPinkLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  reviewHeaderIconWrap: {
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
  reviewHeaderText: { flex: 1 },
  reviewTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  reviewSubtitle: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  reviewSection: { marginBottom: 16 },
  reviewSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  reviewSectionCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softPink,
  },
  reviewRowContent: { flex: 1, paddingRight: 10 },
  reviewLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 3 },
  reviewValue: { fontSize: 15, fontWeight: '600', color: COLORS.text, lineHeight: 20 },
  reviewStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  reviewStatusText: { fontSize: 13, fontWeight: '600', color: COLORS.green },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  editButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: '700' },
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
  locationButtonDisabled: { opacity: 0.75 },
  locationButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
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
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  genderCard: {
    width: '48%',
    minWidth: 145,
    flexGrow: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  genderCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.softPinkLight },
  genderCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderCardText: { marginTop: 8, fontSize: 12, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  genderCardTextSelected: { color: COLORS.primary, fontWeight: '700' },
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
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  saveButtonDisabled: { opacity: 0.75 },
  saveButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  logoutButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: '700' },
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
