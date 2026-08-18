const RecipientProfile = require('../models/RecipientProfile');
const asyncHandler = require('../utils/asyncHandler');
const {
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
} = require('../utils/recipientProfileHelpers');

const createRecipientProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    bloodTypeNeeded,
    dateOfBirth,
    gender,
    location,
    hospital,
    urgency,
    requiredDate,
    unitsNeeded,
    medicalNotes,
    emergencyContact,
  } = req.body;

  const existingProfile = await RecipientProfile.findOne({ userId });

  if (existingProfile) {
    return res.status(409).json({
      success: false,
      message: 'Recipient profile already exists.',
    });
  }

  if (
    !bloodTypeNeeded ||
    !ALLOWED_BLOOD_TYPES.includes(String(bloodTypeNeeded).trim())
  ) {
    return res.status(400).json({
      success: false,
      message: 'A valid blood type is required.',
    });
  }

  const parsedDateOfBirth = parseDateOfBirth(dateOfBirth);

  if (!parsedDateOfBirth) {
    return res.status(400).json({
      success: false,
      message: 'A valid date of birth is required.',
    });
  }

  if (isFutureDate(parsedDateOfBirth)) {
    return res.status(400).json({
      success: false,
      message: 'Date of birth cannot be in the future.',
    });
  }

  if (gender != null && gender !== '') {
    const normalizedGender = String(gender).trim().toLowerCase();

    if (!ALLOWED_GENDERS.includes(normalizedGender)) {
      return res.status(400).json({
        success: false,
        message: 'Gender must be male, female, other, or prefer_not_to_say.',
      });
    }
  }

  if (!location || typeof location !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Location is required.',
    });
  }

  const city = String(location.city || '').trim();
  const country = String(location.country || '').trim();
  const addressLine = String(location.addressLine || '').trim();

  if (!city) {
    return res.status(400).json({
      success: false,
      message: 'City is required.',
    });
  }

  if (!country) {
    return res.status(400).json({
      success: false,
      message: 'Country is required.',
    });
  }

  if (!hospital || typeof hospital !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Hospital information is required.',
    });
  }

  const hospitalName = String(hospital.name || '').trim();
  const hospitalCity = String(hospital.city || '').trim();
  const hospitalAddressLine = String(hospital.addressLine || '').trim();

  if (!hospitalName) {
    return res.status(400).json({
      success: false,
      message: 'Hospital name is required.',
    });
  }

  if (!hospitalCity) {
    return res.status(400).json({
      success: false,
      message: 'Hospital city is required.',
    });
  }

  const normalizedUrgency = String(urgency || '')
    .trim()
    .toLowerCase();

  if (!ALLOWED_URGENCY.includes(normalizedUrgency)) {
    return res.status(400).json({
      success: false,
      message: 'Urgency must be emergency, urgent, or normal.',
    });
  }

  const parsedUnits = Number(unitsNeeded);

  if (!Number.isInteger(parsedUnits) || parsedUnits < 1) {
    return res.status(400).json({
      success: false,
      message: 'Units needed must be at least 1.',
    });
  }

  let parsedRequiredDate = null;

  if (requiredDate != null && requiredDate !== '') {
    parsedRequiredDate = parseDateOfBirth(requiredDate);

    if (!parsedRequiredDate) {
      return res.status(400).json({
        success: false,
        message: 'Required date must be a valid date.',
      });
    }
  }

  const trimmedMedicalNotes = medicalNotes ? String(medicalNotes).trim() : '';

  if (trimmedMedicalNotes.length > MEDICAL_NOTES_MAX_LENGTH) {
    return res.status(400).json({
      success: false,
      message: 'Medical notes cannot exceed 500 characters.',
    });
  }

  const emergencyContactResult = buildEmergencyContactPayload(
    emergencyContact || {}
  );

  if (emergencyContactResult && emergencyContactResult.error) {
    return res.status(400).json({
      success: false,
      message: emergencyContactResult.error,
    });
  }

  const normalizedGender =
    gender == null || gender === ''
      ? null
      : String(gender).trim().toLowerCase();

  const locationResult = buildLocationPayload({
    city,
    country,
    addressLine: addressLine || undefined,
    coordinates: location.coordinates,
  });

  if (locationResult.error) {
    return res.status(400).json({
      success: false,
      message: locationResult.error,
    });
  }

  const profile = await RecipientProfile.create({
    userId,
    bloodTypeNeeded: String(bloodTypeNeeded).trim(),
    dateOfBirth: parsedDateOfBirth,
    gender: normalizedGender,
    location: locationResult,
    hospital: buildHospitalPayload({
      name: hospitalName,
      city: hospitalCity,
      addressLine: hospitalAddressLine || undefined,
    }),
    urgency: normalizedUrgency,
    requiredDate: parsedRequiredDate,
    unitsNeeded: parsedUnits,
    medicalNotes: trimmedMedicalNotes || null,
    emergencyContact: emergencyContactResult,
  });

  return res.status(201).json({
    success: true,
    message: 'Recipient profile created successfully.',
    profile: toSafeRecipientProfile(profile),
  });
});

const getMyRecipientProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await RecipientProfile.findOne({ userId });

  if (!profile) {
    return res.status(404).json({
      success: false,
      message: 'Recipient profile not found.',
    });
  }

  return res.status(200).json({
    success: true,
    profile: toSafeRecipientProfile(profile),
  });
});

const updateRecipientProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    bloodTypeNeeded,
    dateOfBirth,
    gender,
    location,
    hospital,
    urgency,
    requiredDate,
    unitsNeeded,
    medicalNotes,
    emergencyContact,
  } = req.body;

  const existingProfile = await RecipientProfile.findOne({ userId });

  if (!existingProfile) {
    return res.status(404).json({
      success: false,
      message: 'Recipient profile not found.',
    });
  }

  if (
    !bloodTypeNeeded ||
    !ALLOWED_BLOOD_TYPES.includes(String(bloodTypeNeeded).trim())
  ) {
    return res.status(400).json({
      success: false,
      message: 'A valid blood type is required.',
    });
  }

  const parsedDateOfBirth = parseDateOfBirth(dateOfBirth);

  if (!parsedDateOfBirth) {
    return res.status(400).json({
      success: false,
      message: 'A valid date of birth is required.',
    });
  }

  if (isFutureDate(parsedDateOfBirth)) {
    return res.status(400).json({
      success: false,
      message: 'Date of birth cannot be in the future.',
    });
  }

  if (gender != null && gender !== '') {
    const normalizedGender = String(gender).trim().toLowerCase();

    if (!ALLOWED_GENDERS.includes(normalizedGender)) {
      return res.status(400).json({
        success: false,
        message: 'Gender must be male, female, other, or prefer_not_to_say.',
      });
    }
  }

  if (!location || typeof location !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Location is required.',
    });
  }

  const city = String(location.city || '').trim();
  const country = String(location.country || '').trim();
  const addressLine = String(location.addressLine || '').trim();

  if (!city) {
    return res.status(400).json({
      success: false,
      message: 'City is required.',
    });
  }

  if (!country) {
    return res.status(400).json({
      success: false,
      message: 'Country is required.',
    });
  }

  if (!hospital || typeof hospital !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Hospital information is required.',
    });
  }

  const hospitalName = String(hospital.name || '').trim();
  const hospitalCity = String(hospital.city || '').trim();
  const hospitalAddressLine = String(hospital.addressLine || '').trim();

  if (!hospitalName) {
    return res.status(400).json({
      success: false,
      message: 'Hospital name is required.',
    });
  }

  if (!hospitalCity) {
    return res.status(400).json({
      success: false,
      message: 'Hospital city is required.',
    });
  }

  const normalizedUrgency = String(urgency || '')
    .trim()
    .toLowerCase();

  if (!ALLOWED_URGENCY.includes(normalizedUrgency)) {
    return res.status(400).json({
      success: false,
      message: 'Urgency must be emergency, urgent, or normal.',
    });
  }

  const parsedUnits = Number(unitsNeeded);

  if (!Number.isInteger(parsedUnits) || parsedUnits < 1) {
    return res.status(400).json({
      success: false,
      message: 'Units needed must be at least 1.',
    });
  }

  let parsedRequiredDate = null;

  if (requiredDate != null && requiredDate !== '') {
    parsedRequiredDate = parseDateOfBirth(requiredDate);

    if (!parsedRequiredDate) {
      return res.status(400).json({
        success: false,
        message: 'Required date must be a valid date.',
      });
    }
  }

  const trimmedMedicalNotes = medicalNotes ? String(medicalNotes).trim() : '';

  if (trimmedMedicalNotes.length > MEDICAL_NOTES_MAX_LENGTH) {
    return res.status(400).json({
      success: false,
      message: 'Medical notes cannot exceed 500 characters.',
    });
  }

  const emergencyContactResult = buildEmergencyContactPayload(
    emergencyContact || {}
  );

  if (emergencyContactResult && emergencyContactResult.error) {
    return res.status(400).json({
      success: false,
      message: emergencyContactResult.error,
    });
  }

  const normalizedGender =
    gender == null || gender === ''
      ? null
      : String(gender).trim().toLowerCase();

  const locationResult = buildLocationPayload({
    city,
    country,
    addressLine: addressLine || undefined,
    coordinates: Object.prototype.hasOwnProperty.call(location, 'coordinates')
      ? location.coordinates
      : undefined,
  });

  if (locationResult.error) {
    return res.status(400).json({
      success: false,
      message: locationResult.error,
    });
  }

  if (
    !Object.prototype.hasOwnProperty.call(location, 'coordinates') &&
    existingProfile.location?.coordinates
  ) {
    locationResult.coordinates = existingProfile.location.coordinates;
  }

  existingProfile.bloodTypeNeeded = String(bloodTypeNeeded).trim();
  existingProfile.dateOfBirth = parsedDateOfBirth;
  existingProfile.gender = normalizedGender;
  existingProfile.location = locationResult;
  existingProfile.hospital = buildHospitalPayload({
    name: hospitalName,
    city: hospitalCity,
    addressLine: hospitalAddressLine || undefined,
  });
  existingProfile.urgency = normalizedUrgency;
  existingProfile.requiredDate = parsedRequiredDate;
  existingProfile.unitsNeeded = parsedUnits;
  existingProfile.medicalNotes = trimmedMedicalNotes || null;
  existingProfile.emergencyContact = emergencyContactResult;

  await existingProfile.save();

  return res.status(200).json({
    success: true,
    message: 'Recipient profile updated successfully.',
    profile: toSafeRecipientProfile(existingProfile),
  });
});

module.exports = {
  createRecipientProfile,
  getMyRecipientProfile,
  updateRecipientProfile,
};
