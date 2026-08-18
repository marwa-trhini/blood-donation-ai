const DonorProfile = require('../models/DonorProfile');
const asyncHandler = require('../utils/asyncHandler');
const {
  ALLOWED_BLOOD_TYPES,
  ALLOWED_GENDERS,
  toSafeDonorProfile,
  parseDateOfBirth,
  isFutureDate,
  buildLocationPayload,
} = require('../utils/donorProfileHelpers');
const { syncDonorDonationStats } = require('../utils/donorDonationStatsHelpers');

const createDonorProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { bloodType, dateOfBirth, gender, location, isAvailable, bio } = req.body;

  const existingProfile = await DonorProfile.findOne({ userId });

  if (existingProfile) {
    return res.status(409).json({
      success: false,
      message: 'Donor profile already exists.',
    });
  }

  if (!bloodType || !ALLOWED_BLOOD_TYPES.includes(String(bloodType).trim())) {
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

  if (typeof isAvailable !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'Availability status is required.',
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

  const profile = await DonorProfile.create({
    userId,
    bloodType: String(bloodType).trim(),
    dateOfBirth: parsedDateOfBirth,
    gender: normalizedGender,
    location: locationResult.location,
    isAvailable,
    bio: bio ? String(bio).trim() : null,
  });

  return res.status(201).json({
    success: true,
    message: 'Donor profile created successfully.',
    profile: toSafeDonorProfile(profile),
  });
});

const getMyDonorProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await DonorProfile.findOne({ userId });

  if (!profile) {
    return res.status(404).json({
      success: false,
      message: 'Donor profile not found.',
    });
  }

  await syncDonorDonationStats(userId);

  const syncedProfile = await DonorProfile.findOne({ userId });

  return res.status(200).json({
    success: true,
    profile: toSafeDonorProfile(syncedProfile),
  });
});

const updateDonorProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const body = req.body || {};

  const existingProfile = await DonorProfile.findOne({ userId });

  if (!existingProfile) {
    return res.status(404).json({
      success: false,
      message: 'Donor profile not found.',
    });
  }

  const bodyKeys = Object.keys(body);
  const isAvailabilityOnlyUpdate =
    bodyKeys.length === 1 && bodyKeys[0] === 'isAvailable';

  if (isAvailabilityOnlyUpdate) {
    if (typeof body.isAvailable !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isAvailable must be true or false.',
      });
    }

    existingProfile.isAvailable = body.isAvailable;
    await existingProfile.save();

    return res.status(200).json({
      success: true,
      message: 'Donor availability updated successfully.',
      profile: toSafeDonorProfile(existingProfile),
    });
  }

  const { bloodType, dateOfBirth, gender, location, isAvailable, bio } = body;

  if (!bloodType || !ALLOWED_BLOOD_TYPES.includes(String(bloodType).trim())) {
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

  if (typeof isAvailable !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'Availability status is required.',
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
    locationResult.location.coordinates = existingProfile.location.coordinates;
  }

  existingProfile.bloodType = String(bloodType).trim();
  existingProfile.dateOfBirth = parsedDateOfBirth;
  existingProfile.gender = normalizedGender;
  existingProfile.set('location', locationResult.location);
  existingProfile.markModified('location');
  existingProfile.isAvailable = isAvailable;
  existingProfile.bio = bio ? String(bio).trim() : null;

  await existingProfile.save();

  return res.status(200).json({
    success: true,
    message: 'Donor profile updated successfully.',
    profile: toSafeDonorProfile(existingProfile),
  });
});

module.exports = {
  createDonorProfile,
  getMyDonorProfile,
  updateDonorProfile,
};
