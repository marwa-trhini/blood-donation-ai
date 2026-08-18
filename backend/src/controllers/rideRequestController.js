const mongoose = require('mongoose');
const DonationRequest = require('../models/DonationRequest');
const BloodRequest = require('../models/BloodRequest');
const DonorProfile = require('../models/DonorProfile');
const User = require('../models/User');
const RideRequest = require('../models/RideRequest');
const asyncHandler = require('../utils/asyncHandler');
const {
  calculateDistanceKm,
  extractGeoPointCoordinates,
} = require('../utils/donorMatchingHelpers');
const {
  createRideRequestedNotification,
  createRideAcceptedNotification,
  createRideCancelledNotification,
  createRideCompletedNotifications,
} = require('../utils/notificationHelpers');
const {
  buildLocationSnapshot,
  toSafeRideRequest,
  toSafeRideRequestForDonor,
  toSafeRideRequestForRecipient,
} = require('../utils/rideRequestHelpers');

const VALID_RIDE_STATUSES = ['requested', 'accepted', 'completed', 'cancelled'];

const STATUS_TRANSITIONS = {
  donor: {
    requested: ['cancelled'],
    accepted: ['completed'],
  },
  recipient: {
    requested: ['accepted', 'cancelled'],
  },
};

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

function getRideParticipantRole(ride, userId) {
  if (String(ride.donorId) === String(userId)) {
    return 'donor';
  }

  if (String(ride.recipientId) === String(userId)) {
    return 'recipient';
  }

  return null;
}

function getDuplicateStatusMessage(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'accepted') {
    return 'Ride is already accepted.';
  }

  if (normalized === 'completed') {
    return 'Ride is already completed.';
  }

  if (normalized === 'cancelled') {
    return 'Ride is already cancelled.';
  }

  return 'Ride status is unchanged.';
}

function validateStatusTransition(currentStatus, nextStatus, role) {
  const normalizedCurrent = String(currentStatus || '').toLowerCase();
  const normalizedNext = String(nextStatus || '').toLowerCase();

  if (!VALID_RIDE_STATUSES.includes(normalizedNext)) {
    return 'Invalid ride status.';
  }

  if (normalizedCurrent === normalizedNext) {
    return getDuplicateStatusMessage(normalizedCurrent);
  }

  const allowedTransitions = STATUS_TRANSITIONS[role]?.[normalizedCurrent] || [];

  if (!allowedTransitions.includes(normalizedNext)) {
    return 'Invalid ride status transition.';
  }

  return null;
}

async function findRideRequestById(rideId) {
  if (!mongoose.Types.ObjectId.isValid(rideId)) {
    return null;
  }

  return RideRequest.findById(rideId);
}

async function serializeRideForUser(ride, userId) {
  const role = getRideParticipantRole(ride, userId);

  if (!role) {
    return null;
  }

  if (role === 'donor') {
    const [recipientUser, bloodRequest] = await Promise.all([
      User.findById(ride.recipientId),
      BloodRequest.findById(ride.bloodRequestId),
    ]);

    return toSafeRideRequestForDonor(ride, recipientUser, bloodRequest);
  }

  const [donorUser, donorProfile, bloodRequest] = await Promise.all([
    User.findById(ride.donorId),
    DonorProfile.findOne({ userId: ride.donorId }),
    BloodRequest.findById(ride.bloodRequestId),
  ]);

  return toSafeRideRequestForRecipient(ride, donorUser, donorProfile, bloodRequest);
}

async function buildDonorRideRequests(rides) {
  const recipientIds = [...new Set(rides.map((ride) => String(ride.recipientId)))];
  const bloodRequestIds = [...new Set(rides.map((ride) => String(ride.bloodRequestId)))];

  const [recipients, bloodRequests] = await Promise.all([
    User.find({ _id: { $in: recipientIds } }),
    BloodRequest.find({ _id: { $in: bloodRequestIds } }),
  ]);

  const recipientsById = new Map(recipients.map((user) => [String(user._id), user]));
  const bloodRequestsById = new Map(
    bloodRequests.map((request) => [String(request._id), request])
  );

  return rides
    .map((ride) =>
      toSafeRideRequestForDonor(
        ride,
        recipientsById.get(String(ride.recipientId)),
        bloodRequestsById.get(String(ride.bloodRequestId))
      )
    )
    .filter(Boolean);
}

async function buildRecipientRideRequests(rides) {
  const donorIds = [...new Set(rides.map((ride) => String(ride.donorId)))];
  const bloodRequestIds = [...new Set(rides.map((ride) => String(ride.bloodRequestId)))];

  const [donors, donorProfiles, bloodRequests] = await Promise.all([
    User.find({ _id: { $in: donorIds } }),
    DonorProfile.find({ userId: { $in: donorIds } }),
    BloodRequest.find({ _id: { $in: bloodRequestIds } }),
  ]);

  const donorsById = new Map(donors.map((user) => [String(user._id), user]));
  const donorProfilesByUserId = new Map(
    donorProfiles.map((profile) => [String(profile.userId), profile])
  );
  const bloodRequestsById = new Map(
    bloodRequests.map((request) => [String(request._id), request])
  );

  return rides
    .map((ride) =>
      toSafeRideRequestForRecipient(
        ride,
        donorsById.get(String(ride.donorId)),
        donorProfilesByUserId.get(String(ride.donorId)),
        bloodRequestsById.get(String(ride.bloodRequestId))
      )
    )
    .filter(Boolean);
}

async function sendRideStatusNotifications(ride, previousStatus, nextStatus, actorRole) {
  const rideRequestId = ride._id;

  if (previousStatus === 'requested' && nextStatus === 'accepted') {
    await createRideAcceptedNotification({
      donorId: ride.donorId,
      rideRequestId,
    });
    return;
  }

  if (nextStatus === 'cancelled') {
    const notifyUserId =
      actorRole === 'donor' ? ride.recipientId : ride.donorId;

    await createRideCancelledNotification({
      notifyUserId,
      rideRequestId,
      cancelledByDonor: actorRole === 'donor',
    });
    return;
  }

  if (previousStatus === 'accepted' && nextStatus === 'completed') {
    await createRideCompletedNotifications({
      donorId: ride.donorId,
      recipientId: ride.recipientId,
      rideRequestId,
    });
  }
}

async function resolveRideRequestContext(donationRequestId, donorUserId) {
  if (!mongoose.Types.ObjectId.isValid(donationRequestId)) {
    return {
      error: {
        status: 400,
        message: 'A valid donation request ID is required.',
      },
    };
  }

  const donationRequest = await DonationRequest.findById(donationRequestId);

  if (!donationRequest) {
    return {
      error: {
        status: 404,
        message: 'Donation request not found.',
      },
    };
  }

  if (String(donationRequest.donorId) !== String(donorUserId)) {
    return {
      error: {
        status: 403,
        message: 'You can only request rides for your own donation requests.',
      },
    };
  }

  if (donationRequest.status !== 'accepted') {
    return {
      error: {
        status: 400,
        message: 'Rides can only be requested for accepted donation requests.',
      },
    };
  }

  const [donorProfile, bloodRequest] = await Promise.all([
    DonorProfile.findOne({ userId: donationRequest.donorId }),
    BloodRequest.findById(donationRequest.bloodRequestId),
  ]);

  const pickupCoords = extractGeoPointCoordinates(donorProfile?.location);

  if (!pickupCoords) {
    return {
      error: {
        status: 400,
        message: 'Your profile location is required to request a ride.',
      },
    };
  }

  const destinationCoords = extractGeoPointCoordinates(bloodRequest?.location);

  if (!destinationCoords) {
    return {
      error: {
        status: 400,
        message: 'The blood request location is required to request a ride.',
      },
    };
  }

  const distanceKm = calculateDistanceKm(pickupCoords, destinationCoords);

  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) {
    return {
      error: {
        status: 400,
        message: 'Unable to calculate ride distance.',
      },
    };
  }

  return {
    donationRequest,
    donorProfile,
    bloodRequest,
    pickupCoords,
    destinationCoords,
    distanceKm,
  };
}

const createRideRequest = asyncHandler(async (req, res) => {
  if (!isDonorUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only donors can request rides.',
    });
  }

  const { donationRequestId } = req.body;

  const existingRide = await RideRequest.findOne({ donationRequestId });

  if (existingRide) {
    return res.status(409).json({
      success: false,
      message: 'Ride request already exists.',
    });
  }

  const context = await resolveRideRequestContext(donationRequestId, req.user.id);

  if (context.error) {
    return res.status(context.error.status).json({
      success: false,
      message: context.error.message,
    });
  }

  const {
    donationRequest,
    donorProfile,
    bloodRequest,
    pickupCoords,
    destinationCoords,
    distanceKm,
  } = context;

  const ride = await RideRequest.create({
    donationRequestId: donationRequest._id,
    donorId: donationRequest.donorId,
    recipientId: donationRequest.recipientId,
    bloodRequestId: donationRequest.bloodRequestId,
    pickupLocation: buildLocationSnapshot(donorProfile.location, pickupCoords),
    destinationLocation: buildLocationSnapshot(bloodRequest.location, destinationCoords),
    distanceKm,
    status: 'requested',
  });

  try {
    await createRideRequestedNotification({
      recipientId: donationRequest.recipientId,
      rideRequestId: ride._id,
    });
  } catch (notificationError) {
    console.error('[Notification] Failed to create ride requested notification:', notificationError);
  }

  const serializedRide = await serializeRideForUser(ride, req.user.id);

  return res.status(201).json({
    success: true,
    message: 'Ride request sent',
    ride: serializedRide || toSafeRideRequest(ride),
  });
});

const getMyRideRequests = asyncHandler(async (req, res) => {
  if (!isDonorUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only donors can view their ride requests.',
    });
  }

  const rides = await RideRequest.find({ donorId: req.user.id }).sort({ createdAt: -1 });
  const serializedRides = await buildDonorRideRequests(rides);

  return res.status(200).json({
    success: true,
    rides: serializedRides,
  });
});

const getRecipientRideRequests = asyncHandler(async (req, res) => {
  if (!isRecipientUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only recipients can view ride requests for their blood requests.',
    });
  }

  const rides = await RideRequest.find({ recipientId: req.user.id }).sort({ createdAt: -1 });
  const serializedRides = await buildRecipientRideRequests(rides);

  return res.status(200).json({
    success: true,
    rides: serializedRides,
  });
});

const getRideRequestById = asyncHandler(async (req, res) => {
  const ride = await findRideRequestById(req.params.rideId);

  if (!ride) {
    return res.status(404).json({
      success: false,
      message: 'Ride request not found.',
    });
  }

  const role = getRideParticipantRole(ride, req.user.id);

  if (!role) {
    return res.status(403).json({
      success: false,
      message: 'You do not have access to this ride request.',
    });
  }

  const serializedRide = await serializeRideForUser(ride, req.user.id);

  return res.status(200).json({
    success: true,
    ride: serializedRide,
  });
});

const updateRideStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const ride = await findRideRequestById(req.params.rideId);

  if (!ride) {
    return res.status(404).json({
      success: false,
      message: 'Ride request not found.',
    });
  }

  const role = getRideParticipantRole(ride, req.user.id);

  if (!role) {
    return res.status(403).json({
      success: false,
      message: 'You do not have access to this ride request.',
    });
  }

  const transitionError = validateStatusTransition(ride.status, status, role);

  if (transitionError) {
    return res.status(400).json({
      success: false,
      message: transitionError,
    });
  }

  const previousStatus = ride.status;
  const nextStatus = String(status).toLowerCase();

  ride.status = nextStatus;
  await ride.save();

  try {
    await sendRideStatusNotifications(ride, previousStatus, nextStatus, role);
  } catch (notificationError) {
    console.error('[Notification] Failed to create ride status notification:', notificationError);
  }

  const serializedRide = await serializeRideForUser(ride, req.user.id);

  return res.status(200).json({
    success: true,
    message: 'Ride status updated.',
    ride: serializedRide,
  });
});

const previewRideRequest = asyncHandler(async (req, res) => {
  if (!isDonorUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only donors can preview ride requests.',
    });
  }

  const { donationRequestId } = req.query;
  const context = await resolveRideRequestContext(donationRequestId, req.user.id);

  if (context.error) {
    return res.status(context.error.status).json({
      success: false,
      message: context.error.message,
    });
  }

  const { donorProfile, bloodRequest, pickupCoords, destinationCoords, distanceKm } =
    context;

  return res.status(200).json({
    success: true,
    preview: {
      pickupLocation: buildLocationSnapshot(donorProfile.location, pickupCoords),
      destinationLocation: buildLocationSnapshot(bloodRequest.location, destinationCoords),
      distanceKm,
    },
  });
});

module.exports = {
  createRideRequest,
  getMyRideRequests,
  getRecipientRideRequests,
  getRideRequestById,
  updateRideStatus,
  previewRideRequest,
};
