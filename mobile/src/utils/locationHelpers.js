import * as Location from 'expo-location';

export const LEBANON_DEFAULT_REGION = {
  latitude: 33.8938,
  longitude: 35.5018,
  latitudeDelta: 0.8,
  longitudeDelta: 0.8,
};

export const LEBANON_DEFAULT_COORDINATE = {
  latitude: LEBANON_DEFAULT_REGION.latitude,
  longitude: LEBANON_DEFAULT_REGION.longitude,
};

export function buildGeoPointFromGps(latitude, longitude) {
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

export function parseStoredCoordinates(coordinates) {
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

export function applyReverseGeocode(place, { city, country, addressLine }) {
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

export async function fetchCurrentLocationGeoPoint() {
  const servicesEnabled = await Location.hasServicesEnabledAsync();

  if (!servicesEnabled) {
    return {
      error: 'Please enable location services on your device and try again.',
    };
  }

  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    return {
      error: 'Location permission is required to use your current location.',
    };
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const geoPoint = buildGeoPointFromGps(
    position.coords.latitude,
    position.coords.longitude
  );

  if (!geoPoint) {
    return {
      error: 'Unable to read your current location. Please try again.',
    };
  }

  return { geoPoint, position };
}

export async function reverseGeocodePosition(position) {
  return reverseGeocodeCoordinates(
    position.coords.latitude,
    position.coords.longitude
  );
}

export async function reverseGeocodeCoordinates(latitude, longitude) {
  try {
    const places = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });

    return places[0] || null;
  } catch (error) {
    console.warn('[locationHelpers] Reverse geocoding failed:', error?.message);
    return null;
  }
}

export function pickLocalityFromPlace(place) {
  if (!place) {
    return '';
  }

  const city = String(place.city || '').trim();
  if (city) {
    return city;
  }

  const district = String(place.district || '').trim();
  if (district) {
    return district;
  }

  const name = String(place.name || '').trim();
  if (name) {
    return name;
  }

  const subregion = String(place.subregion || '').trim();
  if (subregion) {
    return subregion;
  }

  return '';
}

export function extractLocationFieldsFromPlace(place) {
  if (!place) {
    return { city: '', country: '', addressLine: '' };
  }

  const city = pickLocalityFromPlace(place);
  const country = String(place.country || '').trim();
  const district = String(place.district || '').trim();
  const addressParts = [
    place.street,
    place.streetNumber,
    place.name,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  if (district && district !== city) {
    addressParts.unshift(district);
  }

  return {
    city,
    country,
    addressLine: addressParts.join(', '),
  };
}

export function formatPlacePreviewLabel(place) {
  const { city, country } = extractLocationFieldsFromPlace(place);
  return [city, country].filter(Boolean).join(', ');
}

export function getInitialMapCoordinate(initialCoordinates) {
  const parsed = parseStoredCoordinates(initialCoordinates);

  if (parsed) {
    const [longitude, latitude] = parsed.coordinates;
    return { latitude, longitude };
  }

  return { ...LEBANON_DEFAULT_COORDINATE };
}

export function getMapRegionForCoordinate({ latitude, longitude }) {
  return {
    latitude,
    longitude,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };
}

export function buildMapConfirmedLocationSelection(geoPoint, place, currentFields) {
  const fallback = {
    city: String(currentFields?.city || '').trim(),
    country: String(currentFields?.country || '').trim(),
    addressLine: String(currentFields?.addressLine || '').trim(),
  };

  const geocoded = extractLocationFieldsFromPlace(place);

  return {
    coordinates: geoPoint,
    city: geocoded.city || fallback.city,
    country: geocoded.country || fallback.country,
    addressLine: geocoded.addressLine || fallback.addressLine,
  };
}
