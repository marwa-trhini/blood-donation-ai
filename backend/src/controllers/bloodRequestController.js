const BloodRequest = require('../models/BloodRequest');
const DonorProfile = require('../models/DonorProfile');
const User = require('../models/User');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const {
  toSafeBloodRequest,
  toSafeBloodRequestForDonor,
  toSafeBloodRequestDetailsForDonor,
  normalizeBloodRequestInput,
} = require('../utils/bloodRequestHelpers');
const {
  getCompatibleDonorBloodTypes,
  isDonorCompatibleWithRecipientBloodType,
} = require('../utils/bloodCompatibility');
const {
  toBloodRequestMatchSummary,
  toSafeDonorMatch,
  isEligibleDonorProfile,
  calculateDonorAge,
  extractGeoPointCoordinates,
  calculateDistanceKm,
  sortMatchesByDistance,
} = require('../utils/donorMatchingHelpers');
const { isValidBloodType } = require('../utils/bloodCompatibility');

function isDonorUser(user) {
  return (
    user?.primaryRole === 'donor' ||
    (Array.isArray(user?.roles) && user.roles.includes('donor'))
  );
}

function isRecipientUser(user) {
  return (
    user?.primaryRole === 'recipient' ||
    (Array.isArray(user?.roles) && user.roles.includes('recipient'))
  );
}

const createBloodRequest = asyncHandler(async (req, res) => {
  if (!isRecipientUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only recipients can create blood requests.',
    });
  }

  const normalized = normalizeBloodRequestInput(req.body);

  if (normalized.error) {
    return res.status(normalized.error.status).json({
      success: false,
      message: normalized.error.message,
    });
  }

  const request = await BloodRequest.create({
    requesterId: req.user.id,
    ...normalized.payload,
    status: 'open',
  });

  return res.status(201).json({
    success: true,
    message: 'Blood request created successfully.',
    request: toSafeBloodRequest(request),
  });
});

const getMyBloodRequests = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({ requesterId: req.user.id }).sort({
    createdAt: -1,
  });

  return res.status(200).json({
    success: true,
    requests: requests.map(toSafeBloodRequest),
  });
});

const getBloodRequestMatches = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  console.log('[MatchingDebug] requestId:', requestId);
  console.log('[MatchingDebug] requesterId (auth):', req.user.id);

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    console.log('[MatchingDebug] invalid requestId format');
    return res.status(404).json({
      success: false,
      message: 'Blood request not found.',
    });
  }

  const bloodRequest = await BloodRequest.findById(requestId);

  if (!bloodRequest) {
    console.log('[MatchingDebug] blood request document not found');
    return res.status(404).json({
      success: false,
      message: 'Blood request not found.',
    });
  }

  console.log('[MatchingDebug] blood request loaded:', {
    bloodTypeNeeded: bloodRequest.bloodTypeNeeded,
    status: bloodRequest.status,
    requesterId: String(bloodRequest.requesterId),
  });

  if (String(bloodRequest.requesterId) !== String(req.user.id)) {
    console.log('[MatchingDebug] requester mismatch — authorized user does not own request');
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view matches for this blood request.',
    });
  }

  const requestSummary = toBloodRequestMatchSummary(bloodRequest);

  if (bloodRequest.status !== 'open') {
    console.log('[MatchingDebug] request status is not open — returning zero matches');
    return res.status(200).json({
      success: true,
      message: 'This blood request is no longer open.',
      request: requestSummary,
      matches: [],
    });
  }

  const compatibleBloodTypes = getCompatibleDonorBloodTypes(
    bloodRequest.bloodTypeNeeded
  );

  console.log('[MatchingDebug] requested blood type:', bloodRequest.bloodTypeNeeded);
  console.log('[MatchingDebug] compatible donor blood types:', compatibleBloodTypes);

  if (compatibleBloodTypes.length === 0) {
    console.log('[MatchingDebug] no compatible types mapped — returning zero matches');
    return res.status(200).json({
      success: true,
      request: requestSummary,
      matches: [],
    });
  }

  const profilesByBloodType = await DonorProfile.find({
    bloodType: { $in: compatibleBloodTypes },
  });

  console.log(
    '[MatchingDebug] total donor profiles found by blood type:',
    profilesByBloodType.length
  );

  profilesByBloodType.forEach((profile) => {
    console.log('[MatchingDebug] donor profile candidate:', {
      profileId: String(profile._id),
      userId: String(profile.userId),
      bloodType: profile.bloodType,
      isAvailable: profile.isAvailable,
      dateOfBirth: profile.dateOfBirth,
      calculatedAge: calculateDonorAge(profile.dateOfBirth),
    });
  });

  const availableProfiles = profilesByBloodType.filter(
    (profile) => profile.isAvailable === true
  );

  console.log('[MatchingDebug] available donors:', availableProfiles.length);

  profilesByBloodType.forEach((profile) => {
    if (profile.isAvailable !== true) {
      console.log('[MatchingDebug] excluded donor:', {
        profileId: String(profile._id),
        userId: String(profile.userId),
        reason: 'unavailable',
      });
    }
  });

  availableProfiles.forEach((profile) => {
    if (!isValidBloodType(profile.bloodType)) {
      console.log('[MatchingDebug] excluded donor:', {
        profileId: String(profile._id),
        userId: String(profile.userId),
        reason: 'incompatible blood type',
        bloodType: profile.bloodType,
      });
      return;
    }

    if (!profile.dateOfBirth) {
      console.log('[MatchingDebug] excluded donor:', {
        profileId: String(profile._id),
        userId: String(profile.userId),
        reason: 'missing/invalid dateOfBirth',
      });
      return;
    }

    const dob = new Date(profile.dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      console.log('[MatchingDebug] excluded donor:', {
        profileId: String(profile._id),
        userId: String(profile.userId),
        reason: 'missing/invalid dateOfBirth',
      });
      return;
    }

    const age = calculateDonorAge(profile.dateOfBirth);
    if (age === null) {
      console.log('[MatchingDebug] excluded donor:', {
        profileId: String(profile._id),
        userId: String(profile.userId),
        reason: 'missing/invalid dateOfBirth',
      });
      return;
    }

    if (age >= 64) {
      console.log('[MatchingDebug] excluded donor:', {
        profileId: String(profile._id),
        userId: String(profile.userId),
        reason: 'age >= 64',
        age,
      });
    }
  });

  const donorProfiles = await DonorProfile.find({
    bloodType: { $in: compatibleBloodTypes },
    isAvailable: true,
  });

  const eligibleProfiles = donorProfiles.filter(isEligibleDonorProfile);

  console.log('[MatchingDebug] eligible donors after age filter:', eligibleProfiles.length);

  if (eligibleProfiles.length === 0) {
    console.log('[MatchingDebug] final matches count: 0');
    return res.status(200).json({
      success: true,
      request: requestSummary,
      matches: [],
    });
  }

  const userIds = eligibleProfiles.map((profile) => profile.userId);
  const users = await User.find({ _id: { $in: userIds } });
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const requestCoords = extractGeoPointCoordinates(bloodRequest.location);

  const matches = eligibleProfiles
    .map((profile) => {
      const user = usersById.get(String(profile.userId));

      if (!user) {
        console.log('[MatchingDebug] excluded donor:', {
          profileId: String(profile._id),
          userId: String(profile.userId),
          reason: 'user record not found for donor profile',
        });
        return null;
      }

      let distanceKm = null;

      if (requestCoords) {
        const donorCoords = extractGeoPointCoordinates(profile.location);
        distanceKm = donorCoords
          ? calculateDistanceKm(requestCoords, donorCoords)
          : null;
      }

      return toSafeDonorMatch(profile, user, distanceKm);
    })
    .filter(Boolean);

  const sortedMatches = requestCoords ? sortMatchesByDistance(matches) : matches;

  console.log('[MatchingDebug] final matches count:', sortedMatches.length);

  return res.status(200).json({
    success: true,
    request: requestSummary,
    matches: sortedMatches,
  });
});

const getCompatibleBloodRequests = asyncHandler(async (req, res) => {
  if (!isDonorUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only donors can view compatible blood requests.',
    });
  }

  const donorProfile = await DonorProfile.findOne({ userId: req.user.id });

  if (!donorProfile) {
    return res.status(404).json({
      success: false,
      message: 'Donor profile not found.',
    });
  }

  const openRequests = await BloodRequest.find({ status: 'open' }).sort({
    createdAt: -1,
  });

  const compatibleRequests = openRequests.filter((request) =>
    isDonorCompatibleWithRecipientBloodType(
      donorProfile.bloodType,
      request.bloodTypeNeeded
    )
  );

  return res.status(200).json({
    success: true,
    requests: compatibleRequests.map(toSafeBloodRequestForDonor),
  });
});

const getBloodRequestById = asyncHandler(async (req, res) => {
  if (!isDonorUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only donors can view blood request details.',
    });
  }

  const { requestId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return res.status(404).json({
      success: false,
      message: 'Blood request not found.',
    });
  }

  const donorProfile = await DonorProfile.findOne({ userId: req.user.id });

  if (!donorProfile) {
    return res.status(404).json({
      success: false,
      message: 'Donor profile not found.',
    });
  }

  if (donorProfile.isAvailable !== true) {
    return res.status(403).json({
      success: false,
      message: 'You must be available to view this blood request.',
    });
  }

  const bloodRequest = await BloodRequest.findById(requestId);

  if (!bloodRequest) {
    return res.status(404).json({
      success: false,
      message: 'Blood request not found.',
    });
  }

  if (
    !isDonorCompatibleWithRecipientBloodType(
      donorProfile.bloodType,
      bloodRequest.bloodTypeNeeded
    )
  ) {
    return res.status(403).json({
      success: false,
      message: 'You are not compatible with this blood request.',
    });
  }

  return res.status(200).json({
    success: true,
    request: toSafeBloodRequestDetailsForDonor(bloodRequest),
  });
});

module.exports = {
  createBloodRequest,
  getMyBloodRequests,
  getCompatibleBloodRequests,
  getBloodRequestById,
  getBloodRequestMatches,
};
