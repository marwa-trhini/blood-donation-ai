import { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
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
  createDonorProfile,
  getCurrentUser,
  getMyDonorProfile,
  updateDonorProfile,
} from '../services/api';
import {
  BLOOD_TYPES,
  validateDonorProfileFields,
  formatDateForInput,
} from '../utils/validation';
import BottomTabBar, { bottomTabBarSafeAreaStyle } from '../components/BottomTabBar';
import { applyMapPickedLocation, openLocationPicker, useLocationPickerResult } from '../hooks/useLocationPicker';
import { confirmLogout } from '../utils/authHelpers';
import {
  getKeyboardAvoidingBehavior,
  keyboardLayoutStyles,
  useScrollKeyboardPadding,
} from '../utils/keyboardHelpers';

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
  greenBg: '#DCFCE7',
  greenBorder: '#86EFAC',
  errorBg: '#FEE2E2',
  errorText: '#641522',
  successBg: '#DCFCE7',
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

const BIO_MAX_LENGTH = 200;

function buildGeoPointFromGps(latitude, longitude) {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    type: 'Point',
    coordinates: [longitude, latitude],
  };
}

function parseStoredCoordinates(coordinates) {
  if (
    coordinates?.type === 'Point' &&
    Array.isArray(coordinates.coordinates) &&
    coordinates.coordinates.length === 2
  ) {
    const [longitude, latitude] = coordinates.coordinates;

    return buildGeoPointFromGps(latitude, longitude);
  }

  return null;
}

function applyReverseGeocode(place, { city, country, addressLine }) {
  const updates = {};

  const geocodedCity = String(place?.city || place?.subregion || '').trim();
  const geocodedCountry = String(place?.country || '').trim();
  const geocodedAddress = [
    place?.street,
    place?.streetNumber,
    place?.district,
    place?.name,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');

  if (geocodedCity) {
    updates.city = geocodedCity;
  } else if (city) {
    updates.city = city;
  }

  if (geocodedCountry) {
    updates.country = geocodedCountry;
  } else if (country) {
    updates.country = country;
  }

  if (geocodedAddress) {
    updates.addressLine = geocodedAddress;
  } else if (addressLine) {
    updates.addressLine = addressLine;
  }

  return updates;
}

function displayValue(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || '—';
}

function getGenderLabel(value) {
  const match = GENDER_UI.find((option) => option.value === value);
  return match?.label || '—';
}

function formatLocationSummary(city, country, addressLine) {
  const parts = [addressLine, city, country]
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

function DonorProfileReview({
  userFullName,
  bloodType,
  dateOfBirth,
  gender,
  city,
  country,
  addressLine,
  locationDetected,
  isAvailable,
  bio,
  onEdit,
  onSave,
  loading,
}) {
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
        <ReviewRow label="Blood Type" value={bloodType} />
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

      <ReviewSection title="Availability">
        <ReviewRow
          label="Status"
          value={isAvailable ? 'Available to donate' : 'Not available'}
        />
      </ReviewSection>

      {bio.trim() ? (
        <ReviewSection title="About You">
          <ReviewRow label="Bio" value={bio} />
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
        <Text style={styles.welcomeTitle}>Welcome, life saver!</Text>
        <Text style={styles.welcomeSubtitle}>
          Please complete your donor profile to help connect you with people in need.
        </Text>
      </View>
    </View>
  );
}

export default function DonorProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const [bloodType, setBloodType] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [bio, setBio] = useState('');
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
  const scrollKeyboardPadding = useScrollKeyboardPadding(24);

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
        const profile = await getMyDonorProfile();

        if (!isMounted || !profile) {
          return;
        }

        setHasExistingProfile(true);
        setBloodType(profile.bloodType || '');
        setDateOfBirth(formatDateForInput(profile.dateOfBirth));
        setGender(profile.gender || '');
        setIsAvailable(profile.isAvailable ?? true);
        setBio(profile.bio || '');

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
            'Unable to load donor profile.';

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

  const handleBioChange = (value) => {
    setBio(value.slice(0, BIO_MAX_LENGTH));
  };

  const handleUseCurrentLocation = async () => {
    if (locationLoading || loading) {
      return;
    }

    setLocationError('');
    setLocationLoading(true);

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();

      if (!servicesEnabled) {
        setLocationError('Please enable location services on your device and try again.');
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setLocationError('Location permission is required to use your current location.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const geoPoint = buildGeoPointFromGps(
        position.coords.latitude,
        position.coords.longitude
      );

      if (!geoPoint) {
        setLocationError('Unable to read your current location. Please try again.');
        return;
      }

      setLocationCoordinates(geoPoint);
      setLocationDetected(true);

      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        if (places.length > 0) {
          const updates = applyReverseGeocode(places[0], {
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
      } catch (reverseGeocodeError) {
        console.warn(
          '[DonorProfileScreen] Reverse geocoding failed:',
          reverseGeocodeError?.message
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

    openLocationPicker(navigation, 'DonorProfile', {
      initialCoordinates: locationCoordinates,
      currentFields: { city, country, addressLine },
    });
  };

  const handleSubmit = async () => {
    if (loading) {
      return;
    }

    const validation = validateDonorProfileFields({
      bloodType,
      dateOfBirth,
      gender: gender || null,
      city,
      country,
      addressLine,
      isAvailable,
      bio,
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
        await updateDonorProfile(profilePayload);
      } else {
        await createDonorProfile(profilePayload);
        setHasExistingProfile(true);
      }

      setSuccess('Donor profile saved successfully.');

      setTimeout(() => {
        navigation.navigate('DonorHome');
      }, 800);
    } catch (err) {
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        (typeof err?.data?.message === 'string' && err.data.message.trim()) ||
        'Failed to save donor profile. Please try again.';

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
        <Text style={styles.headerTitle}>Donor Profile</Text>
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

            {error ? <View style={styles.bannerError}><Text style={styles.errorText}>{error}</Text></View> : null}
            {success ? <View style={styles.bannerSuccess}><Text style={styles.successText}>{success}</Text></View> : null}

            {profileStep === 'details' ? (
              <>
            <WelcomeCard />

            <SectionTitle title="Personal Information" />

            <Text style={styles.label}>
              Blood Type <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={styles.selectField}
              onPress={() => setBloodTypeModalVisible(true)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="water"
                size={18}
                color={COLORS.primary}
                style={styles.fieldIcon}
              />
              <Text
                style={[
                  styles.selectFieldText,
                  !bloodType && styles.placeholderText,
                ]}
              >
                {bloodType ? `🩸 ${bloodType}` : 'Select your blood type'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.grayLight} />
            </TouchableOpacity>

            <Text style={styles.label}>
              Date of Birth <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.inputField}>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={COLORS.textSecondary}
                style={styles.fieldIcon}
              />
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
                    style={[
                      styles.genderCard,
                      selected && styles.genderCardSelected,
                    ]}
                    onPress={() => setGender(option.value)}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {selected ? (
                      <View style={styles.genderCheck}>
                        <Ionicons name="checkmark" size={12} color={COLORS.white} />
                      </View>
                    ) : null}
                    <Ionicons
                      name={option.icon}
                      size={22}
                      color={selected ? COLORS.primary : option.color}
                    />
                    <Text
                      style={[
                        styles.genderCardText,
                        selected && styles.genderCardTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <SectionTitle title="Location" />

            <View style={styles.locationCard}>
              <View style={styles.inputField}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={COLORS.textSecondary}
                  style={styles.fieldIcon}
                />
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
                <Ionicons
                  name="globe-outline"
                  size={18}
                  color={COLORS.textSecondary}
                  style={styles.fieldIcon}
                />
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
                <Ionicons
                  name="home-outline"
                  size={18}
                  color={COLORS.textSecondary}
                  style={styles.fieldIcon}
                />
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

            <SectionTitle title="Availability" />

            <Text style={styles.label}>
              Availability <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.availabilityRow}>
              <TouchableOpacity
                style={[
                  styles.availabilityCard,
                  isAvailable && styles.availabilityCardAvailable,
                ]}
                onPress={() => setIsAvailable(true)}
                disabled={loading}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.availabilityIconCircle,
                    isAvailable && styles.availabilityIconCircleActive,
                  ]}
                >
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={isAvailable ? COLORS.white : COLORS.grayLight}
                  />
                </View>
                <Text style={styles.availabilityTitle}>Available</Text>
                <Text style={styles.availabilitySubtitle}>
                  I&apos;m available to donate
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.availabilityCard,
                  !isAvailable && styles.availabilityCardUnavailableSelected,
                ]}
                onPress={() => setIsAvailable(false)}
                disabled={loading}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.availabilityIconCircle,
                    !isAvailable && styles.availabilityIconCircleInactiveSelected,
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={16}
                    color={!isAvailable ? COLORS.white : COLORS.grayLight}
                  />
                </View>
                <Text style={styles.availabilityTitle}>Not available</Text>
                <Text style={styles.availabilitySubtitle}>
                  I&apos;m currently not available
                </Text>
              </TouchableOpacity>
            </View>

            <SectionTitle title="About You" />

            <Text style={styles.label}>Bio (Optional)</Text>
            <View style={styles.bioField}>
              <TextInput
                style={styles.bioInput}
                placeholder="Tell people a little about yourself..."
                placeholderTextColor={COLORS.grayLight}
                value={bio}
                onChangeText={handleBioChange}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!loading}
              />
              <Text style={styles.bioCounter}>
                {bio.length}/{BIO_MAX_LENGTH}
              </Text>
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
              <DonorProfileReview
                userFullName={userFullName}
                bloodType={bloodType}
                dateOfBirth={dateOfBirth}
                gender={gender}
                city={city}
                country={country}
                addressLine={addressLine}
                locationDetected={locationDetected}
                isAvailable={isAvailable}
                bio={bio}
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
          onHomePress={() => navigation.navigate('DonorHome')}
          onRequestsPress={() => navigation.navigate('DonationRequests')}
          onAiPress={() => navigation.navigate('AIAssistant')}
          onMessagesPress={() => navigation.navigate('Messages')}
          onProfilePress={() => navigation.navigate('DonorProfile')}
        />
      </SafeAreaView>

      <Modal
        visible={bloodTypeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBloodTypeModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setBloodTypeModalVisible(false)}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Select your blood type</Text>
            {BLOOD_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.modalOption,
                  bloodType === type && styles.modalOptionSelected,
                ]}
                onPress={() => {
                  setBloodType(type);
                  setBloodTypeModalVisible(false);
                }}
              >
                <MaterialCommunityIcons
                  name="water"
                  size={18}
                  color={bloodType === type ? COLORS.primary : COLORS.grayLight}
                />
                <Text
                  style={[
                    styles.modalOptionText,
                    bloodType === type && styles.modalOptionTextSelected,
                  ]}
                >
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
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  flex: {
    flex: 1,
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

  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },

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

  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  progressStep: {
    alignItems: 'center',
    minWidth: 96,
  },

  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D1D5DB',
    marginBottom: 8,
  },

  progressDotActive: {
    backgroundColor: COLORS.primary,
    width: 14,
    height: 14,
    borderRadius: 7,
  },

  progressLabel: {
    fontSize: 12,
    color: COLORS.grayLight,
    fontWeight: '600',
  },

  progressLabelActive: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
  },

  progressLine: {
    width: 72,
    height: 2,
    backgroundColor: COLORS.softPink,
    marginHorizontal: 10,
    marginBottom: 22,
  },

  progressLineActive: {
    backgroundColor: COLORS.primary,
  },

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

  reviewHeaderText: {
    flex: 1,
  },

  reviewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },

  reviewSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  reviewSection: {
    marginBottom: 16,
  },

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

  reviewRowContent: {
    flex: 1,
    paddingRight: 10,
  },

  reviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 3,
  },

  reviewValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 20,
  },

  reviewStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },

  reviewStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.green,
  },

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

  editButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },

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

  welcomeTextWrap: {
    flex: 1,
  },

  welcomeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 4,
  },

  welcomeSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },

  label: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },

  required: {
    color: COLORS.primary,
  },

  helperText: {
    fontSize: 12,
    color: COLORS.grayLight,
    marginTop: -8,
    marginBottom: 16,
  },

  bannerError: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  errorText: {
    color: COLORS.errorText,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },

  bannerSuccess: {
    backgroundColor: COLORS.successBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },

  successText: {
    color: COLORS.successText,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },

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

  inputFieldLast: {
    marginBottom: 12,
  },

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

  locationButtonDisabled: {
    opacity: 0.75,
  },

  locationButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
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

  mapButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },

  locationSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  locationSuccessText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.successText,
  },

  locationErrorText: {
    color: COLORS.errorText,
    backgroundColor: COLORS.errorBg,
    padding: 10,
    borderRadius: 12,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },

  fieldIcon: {
    marginRight: 10,
  },

  textInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 10,
  },

  selectFieldText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '600',
  },

  placeholderText: {
    color: COLORS.grayLight,
    fontWeight: '400',
  },

  genderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },

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

  genderCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.softPinkLight,
  },

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

  genderCardText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },

  genderCardTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },

  availabilityRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },

  availabilityCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    padding: 14,
    minHeight: 118,
  },

  availabilityCardAvailable: {
    borderColor: COLORS.greenBorder,
    backgroundColor: COLORS.greenBg,
  },

  availabilityCardUnavailableSelected: {
    borderColor: COLORS.border,
    backgroundColor: '#F3F4F6',
  },

  availabilityIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  availabilityIconCircleActive: {
    backgroundColor: COLORS.green,
  },

  availabilityIconCircleInactiveSelected: {
    backgroundColor: COLORS.textSecondary,
  },

  availabilityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },

  availabilitySubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },

  bioField: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 20,
    minHeight: 120,
  },

  bioInput: {
    fontSize: 15,
    color: COLORS.text,
    minHeight: 80,
    padding: 0,
  },

  bioCounter: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: COLORS.grayLight,
    marginTop: 6,
  },

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

  saveButtonDisabled: {
    opacity: 0.75,
  },

  saveButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },

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

  logoutButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },

  modalSheet: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },

  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
  },

  modalOptionSelected: {
    backgroundColor: COLORS.softPinkLight,
  },

  modalOptionText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },

  modalOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});
