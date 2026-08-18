const {
  ALLOWED_BLOOD_TYPES,
  ALLOWED_GENDERS,
  parseDateOfBirth,
  isFutureDate,
  buildLocationPayload: buildDonorLocationPayload,
} = require('./donorProfileHelpers');
const { normalizeLebanesePhone } = require('./validatePhone');

const ALLOWED_URGENCY = ['emergency', 'urgent', 'normal'];
const MEDICAL_NOTES_MAX_LENGTH = 500;

function toSafeRecipientProfile(profile) {
  if (!profile) {
    return null;
  }

  const obj = profile.toObject ? profile.toObject() : profile;

  return {
    id: obj._id,
    userId: obj.userId,
    bloodTypeNeeded: obj.bloodTypeNeeded,
    dateOfBirth: obj.dateOfBirth,
    gender: obj.gender,
    location: obj.location,
    hospital: obj.hospital,
    urgency: obj.urgency,
    requiredDate: obj.requiredDate,
    unitsNeeded: obj.unitsNeeded,
    medicalNotes: obj.medicalNotes,
    emergencyContact: obj.emergencyContact,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function buildLocationPayload({ city, country, addressLine, coordinates }) {
  const result = buildDonorLocationPayload({
    city,
    country,
    addressLine,
    coordinates,
  });

  if (result.error) {
    return { error: result.error };
  }

  return result.location;
}

function buildHospitalPayload({ name, city, addressLine }) {
  const hospitalPayload = {
    name,
    city,
  };

  if (addressLine) {
    hospitalPayload.addressLine = addressLine;
  }

  return hospitalPayload;
}

function buildEmergencyContactPayload({ name, phoneNumber }) {
  const trimmedName = String(name || '').trim();
  const trimmedPhone = String(phoneNumber || '').trim();

  if (!trimmedName && !trimmedPhone) {
    return null;
  }

  const payload = {};

  if (trimmedName) {
    payload.name = trimmedName;
  }

  if (trimmedPhone) {
    const normalizedPhone = normalizeLebanesePhone(trimmedPhone);

    if (!normalizedPhone) {
      return {
        error:
          'Please provide a valid Lebanese emergency contact number (e.g. 03xxxxxx or +961...).',
      };
    }

    payload.phoneNumber = normalizedPhone;
  }

  return payload;
}

module.exports = {
  ALLOWED_BLOOD_TYPES,
  ALLOWED_GENDERS,
  ALLOWED_URGENCY,
  MEDICAL_NOTES_MAX_LENGTH,
  toSafeRecipientProfile,
  parseDateOfBirth,
  isFutureDate,
  buildLocationPayload,
  buildHospitalPayload,
  buildEmergencyContactPayload,
};
