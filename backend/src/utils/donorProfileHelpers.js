const ALLOWED_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const ALLOWED_GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];

function toSafeDonorProfile(profile) {
  if (!profile) {
    return null;
  }

  const obj = profile.toObject ? profile.toObject() : profile;

  return {
    id: obj._id,
    userId: obj.userId,
    bloodType: obj.bloodType,
    dateOfBirth: obj.dateOfBirth,
    gender: obj.gender,
    location: obj.location,
    isAvailable: obj.isAvailable,
    bio: obj.bio,
    totalDonations: obj.totalDonations,
    lastDonationDate: obj.lastDonationDate,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function parseDateOfBirth(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isFutureDate(date) {
  return date.getTime() > Date.now();
}

function validateCoordinates(longitude, latitude) {
  const parsedLongitude = Number(longitude);
  const parsedLatitude = Number(latitude);

  if (typeof parsedLongitude !== 'number' || typeof parsedLatitude !== 'number') {
    return { error: 'Coordinates must contain numeric longitude and latitude.' };
  }

  if (Number.isNaN(parsedLongitude) || Number.isNaN(parsedLatitude)) {
    return { error: 'Coordinates must not be NaN.' };
  }

  if (!Number.isFinite(parsedLongitude) || !Number.isFinite(parsedLatitude)) {
    return { error: 'Coordinates must be finite numbers.' };
  }

  if (parsedLongitude < -180 || parsedLongitude > 180) {
    return { error: 'Longitude must be between -180 and 180.' };
  }

  if (parsedLatitude < -90 || parsedLatitude > 90) {
    return { error: 'Latitude must be between -90 and 90.' };
  }

  return {
    type: 'Point',
    coordinates: [parsedLongitude, parsedLatitude],
  };
}

function parseGeoCoordinates(value) {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { error: 'Coordinates must contain exactly [longitude, latitude].' };
    }

    if (value.length !== 2) {
      return { error: 'Coordinates must contain exactly [longitude, latitude].' };
    }

    const [longitude, latitude] = value;
    return validateCoordinates(longitude, latitude);
  }

  if (typeof value !== 'object') {
    return { error: 'Coordinates must be a valid GeoJSON Point.' };
  }

  const { type, coordinates } = value;

  if (coordinates == null) {
    return { error: 'Coordinates must contain exactly [longitude, latitude].' };
  }

  if (Array.isArray(coordinates) && coordinates.length === 0) {
    return { error: 'Coordinates must contain exactly [longitude, latitude].' };
  }

  if (type && type !== 'Point') {
    return { error: 'Coordinates type must be "Point".' };
  }

  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return { error: 'Coordinates must contain exactly [longitude, latitude].' };
  }

  const [longitude, latitude] = coordinates;
  return validateCoordinates(longitude, latitude);
}

function buildLocationPayload({ city, country, addressLine, coordinates }) {
  const locationPayload = {
    city,
    country,
  };

  if (addressLine) {
    locationPayload.addressLine = addressLine;
  }

  const parsedCoordinates = parseGeoCoordinates(coordinates);

  if (parsedCoordinates && parsedCoordinates.error) {
    return { error: parsedCoordinates.error };
  }

  // Only attach GeoJSON when valid [longitude, latitude] is provided.
  if (parsedCoordinates) {
    locationPayload.coordinates = parsedCoordinates;
  }

  return { location: locationPayload };
}

module.exports = {
  ALLOWED_BLOOD_TYPES,
  ALLOWED_GENDERS,
  toSafeDonorProfile,
  parseDateOfBirth,
  isFutureDate,
  validateCoordinates,
  parseGeoCoordinates,
  buildLocationPayload,
};
