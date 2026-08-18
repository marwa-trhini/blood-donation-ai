const mongoose = require('mongoose');
const DonationRequest = require('../models/DonationRequest');
const BloodRequest = require('../models/BloodRequest');
const DonorProfile = require('../models/DonorProfile');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { isDonorCompatibleWithRecipientBloodType } = require('../utils/bloodCompatibility');
const { isEligibleDonorProfile } = require('../utils/donorMatchingHelpers');
const { syncDonorDonationStats } = require('../utils/donorDonationStatsHelpers');
const {
  createDonationRequestNotification,
  createDonationAcceptedNotification,
  createDonationDeclinedNotification,
  createDonationCancelledNotification,
  createDonationCompletedNotifications,
} = require('../utils/notificationHelpers');
const {
  MESSAGE_MAX_LENGTH,
  toSafeDonationRequestForDonor,
  toSafeDonationRequestForRecipient,
  toSafeCompletedDonationActivity,
} = require('../utils/donationRequestHelpers');

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

function isRecipientOwner(donationRequest, userId) {
  return String(donationRequest.recipientId) === String(userId);
}

function isDonorOwner(donationRequest, userId) {
  return String(donationRequest.donorId) === String(userId);
}

function isParticipant(donationRequest, userId) {
  return isRecipientOwner(donationRequest, userId) || isDonorOwner(donationRequest, userId);
}

async function findDonationRequestById(requestId) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return null;
  }

  return DonationRequest.findById(requestId);
}

async function serializeDonationRequestForUser(donationRequest, userId) {
  if (isDonorOwner(donationRequest, userId)) {
    const [recipientUser, bloodRequest] = await Promise.all([
      User.findById(donationRequest.recipientId),
      BloodRequest.findById(donationRequest.bloodRequestId),
    ]);

    return toSafeDonationRequestForDonor(
      donationRequest,
      recipientUser,
      bloodRequest
    );
  }

  if (isRecipientOwner(donationRequest, userId)) {
    const [donorUser, donorProfile, bloodRequest] = await Promise.all([
      User.findById(donationRequest.donorId),
      DonorProfile.findOne({ userId: donationRequest.donorId }),
      BloodRequest.findById(donationRequest.bloodRequestId),
    ]);

    return toSafeDonationRequestForRecipient(
      donationRequest,
      donorUser,
      donorProfile,
      bloodRequest
    );
  }

  return null;
}

async function buildDonorDonationRequests(requests) {
  const recipientIds = [...new Set(requests.map((item) => String(item.recipientId)))];
  const bloodRequestIds = [
    ...new Set(requests.map((item) => String(item.bloodRequestId))),
  ];

  const [recipients, bloodRequests] = await Promise.all([
    User.find({ _id: { $in: recipientIds } }),
    BloodRequest.find({ _id: { $in: bloodRequestIds } }),
  ]);

  const recipientsById = new Map(
    recipients.map((user) => [String(user._id), user])
  );
  const bloodRequestsById = new Map(
    bloodRequests.map((request) => [String(request._id), request])
  );

  return requests
    .map((request) =>
      toSafeDonationRequestForDonor(
        request,
        recipientsById.get(String(request.recipientId)),
        bloodRequestsById.get(String(request.bloodRequestId))
      )
    )
    .filter(Boolean);
}

async function buildRecipientDonationRequests(requests) {
  const donorIds = [...new Set(requests.map((item) => String(item.donorId)))];
  const bloodRequestIds = [
    ...new Set(requests.map((item) => String(item.bloodRequestId))),
  ];

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

  return requests
    .map((request) =>
      toSafeDonationRequestForRecipient(
        request,
        donorsById.get(String(request.donorId)),
        donorProfilesByUserId.get(String(request.donorId)),
        bloodRequestsById.get(String(request.bloodRequestId))
      )
    )
    .filter(Boolean);
}

const createDonationRequest = asyncHandler(async (req, res) => {
  if (!isRecipientUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only recipients can send donation requests.',
    });
  }

  const recipientId = req.user.id;
  const { donorId, bloodRequestId, message } = req.body;

  if (
    !mongoose.Types.ObjectId.isValid(donorId) ||
    !mongoose.Types.ObjectId.isValid(bloodRequestId)
  ) {
    return res.status(400).json({
      success: false,
      message: 'A valid donor ID and blood request ID are required.',
    });
  }

  const bloodRequest = await BloodRequest.findById(bloodRequestId);

  if (!bloodRequest) {
    return res.status(404).json({
      success: false,
      message: 'Blood request not found.',
    });
  }

  if (String(bloodRequest.requesterId) !== String(recipientId)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to send requests for this blood request.',
    });
  }

  if (bloodRequest.status !== 'open') {
    return res.status(400).json({
      success: false,
      message: 'Donation requests can only be sent for open blood requests.',
    });
  }

  const donorUser = await User.findById(donorId);

  if (!donorUser) {
    return res.status(400).json({
      success: false,
      message: 'Donor not found.',
    });
  }

  const donorProfile = await DonorProfile.findOne({ userId: donorId });

  if (!donorProfile) {
    return res.status(400).json({
      success: false,
      message: 'Donor profile not found.',
    });
  }

  if (donorProfile.isAvailable !== true) {
    return res.status(400).json({
      success: false,
      message: 'This donor is currently unavailable.',
    });
  }

  if (!isEligibleDonorProfile(donorProfile)) {
    return res.status(400).json({
      success: false,
      message: 'This donor is not eligible to donate.',
    });
  }

  if (
    !isDonorCompatibleWithRecipientBloodType(
      donorProfile.bloodType,
      bloodRequest.bloodTypeNeeded
    )
  ) {
    return res.status(400).json({
      success: false,
      message: 'This donor is not compatible with the blood request.',
    });
  }

  const existingPending = await DonationRequest.findOne({
    recipientId,
    donorId,
    bloodRequestId,
    status: 'pending',
  });

  if (existingPending) {
    return res.status(409).json({
      success: false,
      message: 'Donation request already exists.',
    });
  }

  const trimmedMessage = message ? String(message).trim() : '';

  if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
    return res.status(400).json({
      success: false,
      message: 'Message cannot exceed 500 characters.',
    });
  }

  const donationRequest = await DonationRequest.create({
    recipientId,
    donorId,
    bloodRequestId,
    message: trimmedMessage || null,
    status: 'pending',
  });

  try {
    await createDonationRequestNotification({
      donorId,
      donationRequestId: donationRequest._id,
      bloodTypeNeeded: bloodRequest.bloodTypeNeeded,
    });
  } catch (notificationError) {
    console.error('[Notification] Failed to create donation request notification:', notificationError);
  }

  console.log('[DonationDebug] Created:');
  console.log('[DonationDebug] recipientId:', String(recipientId));
  console.log('[DonationDebug] donorId:', String(donorId));
  console.log('[DonationDebug] bloodRequestId:', String(bloodRequestId));
  console.log('[DonationDebug] status:', donationRequest.status);
  console.log(
    '[DonationDebug] auth recipient matches:',
    String(recipientId) === String(req.user.id)
  );

  const populatedBloodRequest = await BloodRequest.findById(bloodRequestId);

  return res.status(201).json({
    success: true,
    message: 'Donation request sent successfully.',
    request: toSafeDonationRequestForRecipient(
      donationRequest,
      donorUser,
      donorProfile,
      populatedBloodRequest
    ),
  });
});

function resolveDonationRequestListMode(user, requestedAs) {
  const normalizedAs = String(requestedAs || '').trim().toLowerCase();

  if (normalizedAs === 'donor' || normalizedAs === 'recipient') {
    return normalizedAs;
  }

  if (user?.primaryRole === 'donor' || user?.primaryRole === 'recipient') {
    return user.primaryRole;
  }

  if (isDonorUser(user) && !isRecipientUser(user)) {
    return 'donor';
  }

  if (isRecipientUser(user)) {
    return 'recipient';
  }

  return null;
}

const getMyDonationRequests = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const listMode = resolveDonationRequestListMode(req.user, req.query.as);

  console.log('[RecipientRequestsDebug] req.user.id:', String(userId));
  console.log('[RecipientRequestsDebug] req.user.roles:', req.user.roles);
  console.log('[RecipientRequestsDebug] req.user.primaryRole:', req.user.primaryRole);
  console.log('[RecipientRequestsDebug] as query param:', req.query.as || '(none)');
  console.log('[RecipientRequestsDebug] resolved list mode:', listMode);

  if (listMode === 'donor') {
    if (!isDonorUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Only donors can view donor donation requests.',
      });
    }

    const donorQuery = { donorId: userId };
    console.log(
      '[RecipientRequestsDebug] donor query:',
      JSON.stringify({ donorId: String(userId) })
    );

    const requests = await DonationRequest.find(donorQuery).sort({
      createdAt: -1,
    });

    console.log('[RecipientRequestsDebug] found count:', requests.length);

    const serialized = await buildDonorDonationRequests(requests);

    return res.status(200).json({
      success: true,
      requests: serialized,
    });
  }

  if (listMode === 'recipient') {
    if (!isRecipientUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Only recipients can view sent donation requests.',
      });
    }

    const recipientQuery = { recipientId: userId };
    console.log(
      '[RecipientRequestsDebug] recipient query:',
      JSON.stringify({ recipientId: String(userId) })
    );

    const requests = await DonationRequest.find(recipientQuery).sort({
      createdAt: -1,
    });

    console.log('[RecipientRequestsDebug] found count:', requests.length);

    const serialized = await buildRecipientDonationRequests(requests);

    console.log('[RecipientRequestsDebug] serialized count:', serialized.length);

    return res.status(200).json({
      success: true,
      requests: serialized,
    });
  }

  return res.status(403).json({
    success: false,
    message: 'Only donors or recipients can view donation requests.',
  });
});

const debugRecipientDonationRequests = asyncHandler(async (req, res) => {
  if (!isRecipientUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only recipients can view sent donation requests.',
    });
  }

  const recipientQuery = { recipientId: req.user.id };

  console.log('[RecipientRequestsDebug] debug recipient query:', {
    recipientId: String(req.user.id),
  });

  const requests = await DonationRequest.find(recipientQuery)
    .sort({ createdAt: -1 })
    .lean();

  console.log('[RecipientRequestsDebug] debug found count:', requests.length);

  return res.status(200).json({
    success: true,
    query: {
      recipientId: String(req.user.id),
    },
    count: requests.length,
    requests: requests.map((request) => ({
      id: String(request._id),
      recipientId: String(request.recipientId),
      donorId: String(request.donorId),
      bloodRequestId: String(request.bloodRequestId),
      status: request.status,
    })),
  });
});

const respondToDonationRequest = asyncHandler(async (req, res) => {
  if (!isDonorUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only donors can respond to donation requests.',
    });
  }

  const { requestId } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return res.status(404).json({
      success: false,
      message: 'Donation request not found.',
    });
  }

  if (status !== 'accepted' && status !== 'declined') {
    return res.status(400).json({
      success: false,
      message: 'Status must be accepted or declined.',
    });
  }

  const donationRequest = await DonationRequest.findById(requestId);

  if (!donationRequest) {
    return res.status(404).json({
      success: false,
      message: 'Donation request not found.',
    });
  }

  if (String(donationRequest.donorId) !== String(req.user.id)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to respond to this donation request.',
    });
  }

  if (donationRequest.status !== 'pending') {
    return res.status(409).json({
      success: false,
      message: 'Only pending donation requests can be accepted or declined.',
    });
  }

  donationRequest.status = status;
  await donationRequest.save();

  try {
    if (status === 'accepted') {
      await createDonationAcceptedNotification({
        recipientId: donationRequest.recipientId,
        donationRequestId: donationRequest._id,
      });
    } else {
      await createDonationDeclinedNotification({
        recipientId: donationRequest.recipientId,
        donationRequestId: donationRequest._id,
      });
    }
  } catch (notificationError) {
    console.error('[Notification] Failed to create donation response notification:', notificationError);
  }

  const request = await serializeDonationRequestForUser(donationRequest, req.user.id);

  return res.status(200).json({
    success: true,
    message:
      status === 'accepted'
        ? 'Donation request accepted.'
        : 'Donation request declined.',
    request,
  });
});

const cancelDonationRequest = asyncHandler(async (req, res) => {
  if (!isRecipientUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only recipients can cancel donation requests.',
    });
  }

  const { requestId } = req.params;
  const donationRequest = await findDonationRequestById(requestId);

  if (!donationRequest) {
    return res.status(404).json({
      success: false,
      message: 'Donation request not found.',
    });
  }

  if (!isRecipientOwner(donationRequest, req.user.id)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to cancel this donation request.',
    });
  }

  if (donationRequest.status !== 'pending') {
    return res.status(409).json({
      success: false,
      message: 'Only pending donation requests can be cancelled.',
    });
  }

  donationRequest.status = 'cancelled';
  await donationRequest.save();

  try {
    await createDonationCancelledNotification({
      donorId: donationRequest.donorId,
      donationRequestId: donationRequest._id,
    });
  } catch (notificationError) {
    console.error('[Notification] Failed to create donation cancelled notification:', notificationError);
  }

  const request = await serializeDonationRequestForUser(
    donationRequest,
    req.user.id
  );

  return res.status(200).json({
    success: true,
    message: 'Donation request cancelled.',
    request,
  });
});

const completeDonationRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const donationRequest = await findDonationRequestById(requestId);

  if (!donationRequest) {
    return res.status(404).json({
      success: false,
      message: 'Donation request not found.',
    });
  }

  if (!isParticipant(donationRequest, req.user.id)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to complete this donation request.',
    });
  }

  if (donationRequest.status !== 'accepted') {
    return res.status(409).json({
      success: false,
      message: 'Only accepted donation requests can be marked as completed.',
    });
  }

  const completedAt = new Date();
  donationRequest.status = 'completed';
  donationRequest.completedAt = completedAt;
  await donationRequest.save();

  try {
    await syncDonorDonationStats(donationRequest.donorId);
  } catch (error) {
    donationRequest.status = 'accepted';
    donationRequest.completedAt = null;
    await donationRequest.save();

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update donor donation statistics.',
    });
  }

  try {
    const donorUserId = donationRequest.donorId;
    const bloodRequest = await BloodRequest.findById(donationRequest.bloodRequestId).select(
      'requesterId'
    );
    const recipientUserId = bloodRequest?.requesterId || donationRequest.recipientId;

    await createDonationCompletedNotifications({
      donorUserId,
      recipientUserId,
      donationRequestId: donationRequest._id,
    });
  } catch (notificationError) {
    console.error('[Notification] Failed to create donation completed notifications:', notificationError);
  }

  const request = await serializeDonationRequestForUser(
    donationRequest,
    req.user.id
  );

  return res.status(200).json({
    success: true,
    message: 'Donation request marked as completed.',
    request,
  });
});

const getCompletedDonationRequests = asyncHandler(async (req, res) => {
  if (!isDonorUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only donors can view completed donation activity.',
    });
  }

  const completedRequests = await DonationRequest.find({
    donorId: req.user.id,
    status: 'completed',
  }).sort({ completedAt: -1, createdAt: -1 });

  const bloodRequestIds = [
    ...new Set(completedRequests.map((item) => String(item.bloodRequestId))),
  ];

  const bloodRequests = await BloodRequest.find({
    _id: { $in: bloodRequestIds },
  });

  const bloodRequestsById = new Map(
    bloodRequests.map((request) => [String(request._id), request])
  );

  const requests = completedRequests
    .map((request) =>
      toSafeCompletedDonationActivity(
        request,
        bloodRequestsById.get(String(request.bloodRequestId))
      )
    )
    .filter(Boolean);

  return res.status(200).json({
    success: true,
    requests,
  });
});

module.exports = {
  createDonationRequest,
  getMyDonationRequests,
  getCompletedDonationRequests,
  debugRecipientDonationRequests,
  respondToDonationRequest,
  cancelDonationRequest,
  completeDonationRequest,
};
