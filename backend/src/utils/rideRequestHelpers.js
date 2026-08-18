function toSafeLocationSnapshot(location) {
  if (!location) {
    return null;
  }

  const obj = location.toObject ? location.toObject() : location;

  return {
    addressLine: obj.addressLine || null,
    city: obj.city || null,
    country: obj.country || null,
    coordinates: obj.coordinates
      ? {
          type: obj.coordinates.type || 'Point',
          coordinates: Array.isArray(obj.coordinates.coordinates)
            ? obj.coordinates.coordinates
            : null,
        }
      : null,
  };
}

function toSafeBloodRequestRideSummary(bloodRequest) {
  if (!bloodRequest) {
    return null;
  }

  const obj = bloodRequest.toObject ? bloodRequest.toObject() : bloodRequest;

  return {
    id: obj._id,
    bloodTypeNeeded: obj.bloodTypeNeeded || null,
    unitsNeeded: obj.unitsNeeded || null,
    urgency: obj.urgency || null,
  };
}

function toSafeRideRequest(rideRequest) {
  if (!rideRequest) {
    return null;
  }

  const obj = rideRequest.toObject ? rideRequest.toObject() : rideRequest;

  return {
    id: obj._id,
    donationRequestId: obj.donationRequestId,
    donorId: obj.donorId,
    recipientId: obj.recipientId,
    bloodRequestId: obj.bloodRequestId,
    pickupLocation: toSafeLocationSnapshot(obj.pickupLocation),
    destinationLocation: toSafeLocationSnapshot(obj.destinationLocation),
    distanceKm: obj.distanceKm,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function toSafeRideRequestForDonor(rideRequest, recipientUser, bloodRequest) {
  const base = toSafeRideRequest(rideRequest);

  if (!base) {
    return null;
  }

  return {
    ...base,
    recipient: recipientUser
      ? {
          fullName: recipientUser.fullName || null,
        }
      : null,
    bloodRequest: toSafeBloodRequestRideSummary(bloodRequest),
  };
}

function toSafeRideRequestForRecipient(rideRequest, donorUser, donorProfile, bloodRequest) {
  const base = toSafeRideRequest(rideRequest);

  if (!base) {
    return null;
  }

  return {
    ...base,
    donor: {
      fullName: donorUser?.fullName || null,
      bloodType: donorProfile?.bloodType || null,
    },
    bloodRequest: toSafeBloodRequestRideSummary(bloodRequest),
  };
}

function buildLocationSnapshot(sourceLocation, coordinates) {
  return {
    addressLine: sourceLocation?.addressLine || undefined,
    city: sourceLocation?.city || '',
    country: sourceLocation?.country || '',
    coordinates: {
      type: 'Point',
      coordinates,
    },
  };
}

module.exports = {
  toSafeRideRequest,
  toSafeRideRequestForDonor,
  toSafeRideRequestForRecipient,
  buildLocationSnapshot,
};
