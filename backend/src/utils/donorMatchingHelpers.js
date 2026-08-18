const { isValidBloodType } = require('./bloodCompatibility');
const { parseGeoCoordinates } = require('./donorProfileHelpers');

const MAX_DONOR_AGE_EXCLUSIVE = 64;
const EARTH_RADIUS_KM = 6371;
function calculateDonorAge(dateOfBirth) {
  if (!dateOfBirth) {
    return null;
  }

  const dob = new Date(dateOfBirth);

  if (Number.isNaN(dob.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }

  if (age < 0) {
    return null;
  }

  return age;
}

function isEligibleDonorAge(dateOfBirth) {
  const age = calculateDonorAge(dateOfBirth);
  return age !== null && age < MAX_DONOR_AGE_EXCLUSIVE;
}

function toBloodRequestMatchSummary(request) {
  if (!request) {
    return null;
  }

  const obj = request.toObject ? request.toObject() : request;

  return {
    id: obj._id != null ? String(obj._id) : null,
    bloodTypeNeeded: obj.bloodTypeNeeded,
    unitsNeeded: obj.unitsNeeded,
    urgency: obj.urgency,
    status: obj.status,
  };
}

function toSafeDonorMatch(donorProfile, user, distanceKm = null) {
  if (!donorProfile || !user) {
    return null;
  }

  const profile = donorProfile.toObject ? donorProfile.toObject() : donorProfile;

  return {
    donorId: profile._id,
    userId: profile.userId,
    fullName: user.fullName,
    bloodType: profile.bloodType,
    age: calculateDonorAge(profile.dateOfBirth),
    phoneNumber: user.phoneNumber,
    location: {
      city: profile.location?.city || null,
      country: profile.location?.country || null,
    },
    isAvailable: profile.isAvailable === true,
    distanceKm: typeof distanceKm === 'number' && Number.isFinite(distanceKm)
      ? distanceKm
      : null,
  };
}

function toPlainObject(value) {
  if (value == null) {
    return null;
  }

  if (typeof value.toObject === 'function') {
    return value.toObject({ getters: true, virtuals: false });
  }

  return value;
}

function extractGeoPointCoordinates(location) {
  const plainLocation = toPlainObject(location);

  if (!plainLocation?.coordinates) {
    return null;
  }

  const coordinateInput = toPlainObject(plainLocation.coordinates);
  const parsed = parseGeoCoordinates(coordinateInput);

  if (!parsed || parsed.error || !Array.isArray(parsed.coordinates)) {
    return null;
  }

  return parsed.coordinates;
}

function calculateDistanceKm(fromCoords, toCoords) {
  if (!fromCoords || !toCoords) {
    return null;
  }

  const [fromLongitude, fromLatitude] = fromCoords;
  const [toLongitude, toLatitude] = toCoords;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(toLatitude - fromLatitude);
  const deltaLongitude = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRad = toRadians(fromLatitude);
  const toLatitudeRad = toRadians(toLatitude);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(fromLatitudeRad) *
      Math.cos(toLatitudeRad) *
      Math.sin(deltaLongitude / 2) ** 2;

  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return EARTH_RADIUS_KM * centralAngle;
}

function sortMatchesByDistance(matches) {
  const withDistance = [];
  const withoutDistance = [];

  matches.forEach((match) => {
    if (typeof match.distanceKm === 'number' && Number.isFinite(match.distanceKm)) {
      withDistance.push(match);
      return;
    }

    withoutDistance.push(match);
  });

  withDistance.sort((left, right) => left.distanceKm - right.distanceKm);

  return [...withDistance, ...withoutDistance];
}
function isEligibleDonorProfile(donorProfile) {
  if (!donorProfile) {
    return false;
  }

  if (donorProfile.isAvailable !== true) {
    return false;
  }

  if (!isValidBloodType(donorProfile.bloodType)) {
    return false;
  }

  return isEligibleDonorAge(donorProfile.dateOfBirth);
}

module.exports = {
  calculateDonorAge,
  isEligibleDonorAge,
  toBloodRequestMatchSummary,
  toSafeDonorMatch,
  isEligibleDonorProfile,
  extractGeoPointCoordinates,
  calculateDistanceKm,
  sortMatchesByDistance,
};