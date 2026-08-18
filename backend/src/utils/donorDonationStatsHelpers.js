const DonationRequest = require('../models/DonationRequest');
const DonorProfile = require('../models/DonorProfile');

function getCompletionTimestamp(donationRequest) {
  const obj = donationRequest.toObject
    ? donationRequest.toObject()
    : donationRequest;

  if (obj.completedAt) {
    return obj.completedAt;
  }

  return obj.updatedAt || null;
}

async function syncDonorDonationStats(donorUserId) {
  const completedRequests = await DonationRequest.find({
    donorId: donorUserId,
    status: 'completed',
  }).sort({ completedAt: -1, updatedAt: -1, createdAt: -1 });

  const donorProfile = await DonorProfile.findOne({ userId: donorUserId });

  if (!donorProfile) {
    const error = new Error('Donor profile not found for completed donation.');
    error.statusCode = 404;
    throw error;
  }

  donorProfile.totalDonations = completedRequests.length;

  if (completedRequests.length === 0) {
    donorProfile.lastDonationDate = null;
  } else {
    const mostRecent = [...completedRequests].sort((left, right) => {
      const leftTime = new Date(getCompletionTimestamp(left) || 0).getTime();
      const rightTime = new Date(getCompletionTimestamp(right) || 0).getTime();
      return rightTime - leftTime;
    })[0];

    donorProfile.lastDonationDate = getCompletionTimestamp(mostRecent);
  }

  await donorProfile.save();

  return donorProfile;
}

module.exports = {
  syncDonorDonationStats,
};
