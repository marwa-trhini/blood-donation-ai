const MESSAGE_MAX_LENGTH = 500;

function toSafeBloodRequestSummary(bloodRequest) {
  if (!bloodRequest) {
    return null;
  }

  const obj = bloodRequest.toObject ? bloodRequest.toObject() : bloodRequest;

  return {
    id: obj._id,
    bloodTypeNeeded: obj.bloodTypeNeeded,
    unitsNeeded: obj.unitsNeeded,
    urgency: obj.urgency,
    requiredDate: obj.requiredDate,
    hospital: obj.hospital,
    location: obj.location,
    status: obj.status,
  };
}

function toSafeDonationRequestBase(donationRequest) {
  if (!donationRequest) {
    return null;
  }

  const obj = donationRequest.toObject ? donationRequest.toObject() : donationRequest;

  return {
    id: obj._id,
    recipientId: obj.recipientId,
    donorId: obj.donorId,
    bloodRequestId: obj.bloodRequestId,
    status: obj.status,
    message: obj.message,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function toSafeDonationRequestForDonor(donationRequest, recipientUser, bloodRequest) {
  const base = toSafeDonationRequestBase(donationRequest);

  if (!base) {
    return null;
  }

  return {
    id: base.id,
    status: base.status,
    message: base.message,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    recipient: recipientUser
      ? {
          fullName: recipientUser.fullName,
        }
      : null,
    bloodRequest: toSafeBloodRequestSummary(bloodRequest),
  };
}

function toSafeDonationRequestForRecipient(
  donationRequest,
  donorUser,
  donorProfile,
  bloodRequest
) {
  const base = toSafeDonationRequestBase(donationRequest);

  if (!base) {
    return null;
  }

  return {
    id: base.id,
    status: base.status,
    message: base.message,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    donor: {
      userId: base.donorId,
      fullName: donorUser?.fullName || null,
      bloodType: donorProfile?.bloodType || null,
      location: {
        city: donorProfile?.location?.city || null,
        country: donorProfile?.location?.country || null,
      },
      ...(base.status === 'accepted'
        ? { phoneNumber: donorUser?.phoneNumber || null }
        : {}),
    },
    bloodRequest: toSafeBloodRequestSummary(bloodRequest),
  };
}

function toSafeCompletedDonationActivity(donationRequest, bloodRequest) {
  if (!donationRequest) {
    return null;
  }

  const requestObj = donationRequest.toObject
    ? donationRequest.toObject()
    : donationRequest;
  const bloodRequestSummary = toSafeBloodRequestSummary(bloodRequest);

  return {
    id: requestObj._id,
    bloodTypeNeeded: bloodRequestSummary?.bloodTypeNeeded || null,
    unitsNeeded: bloodRequestSummary?.unitsNeeded || null,
    hospital: bloodRequestSummary?.hospital
      ? {
          name: bloodRequestSummary.hospital.name || null,
          city: bloodRequestSummary.hospital.city || null,
        }
      : null,
    completedAt: requestObj.completedAt || null,
    createdAt: requestObj.createdAt,
  };
}

module.exports = {
  MESSAGE_MAX_LENGTH,
  toSafeBloodRequestSummary,
  toSafeDonationRequestBase,
  toSafeDonationRequestForDonor,
  toSafeDonationRequestForRecipient,
  toSafeCompletedDonationActivity,
};
