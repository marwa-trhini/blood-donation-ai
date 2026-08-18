const {
  ALLOWED_BLOOD_TYPES,
  parseDateOfBirth,
} = require('./donorProfileHelpers');
const {
  ALLOWED_URGENCY,
  buildLocationPayload,
  buildHospitalPayload,
  MEDICAL_NOTES_MAX_LENGTH,
} = require('./recipientProfileHelpers');

function toSafeBloodRequest(request) {
  if (!request) {
    return null;
  }

  const obj = request.toObject ? request.toObject() : request;

  return {
    id: obj._id != null ? String(obj._id) : null,
    requesterId: obj.requesterId,
    bloodTypeNeeded: obj.bloodTypeNeeded,
    unitsNeeded: obj.unitsNeeded,
    urgency: obj.urgency,
    requiredDate: obj.requiredDate,
    hospital: obj.hospital,
    location: obj.location,
    medicalNotes: obj.medicalNotes,
    title: obj.title,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function normalizeBloodRequestInput(body) {
  const {
    bloodTypeNeeded,
    unitsNeeded,
    urgency,
    requiredDate,
    hospital,
    location,
    medicalNotes,
    title,
  } = body;

  if (
    !bloodTypeNeeded ||
    !ALLOWED_BLOOD_TYPES.includes(String(bloodTypeNeeded).trim())
  ) {
    return {
      error: { status: 400, message: 'A valid blood type is required.' },
    };
  }

  const parsedUnits = Number(unitsNeeded);

  if (!Number.isInteger(parsedUnits) || parsedUnits < 1) {
    return {
      error: { status: 400, message: 'Units needed must be at least 1.' },
    };
  }

  const normalizedUrgency = String(urgency || '')
    .trim()
    .toLowerCase();

  if (!ALLOWED_URGENCY.includes(normalizedUrgency)) {
    return {
      error: {
        status: 400,
        message: 'Urgency must be emergency, urgent, or normal.',
      },
    };
  }

  let parsedRequiredDate = null;

  if (requiredDate != null && requiredDate !== '') {
    parsedRequiredDate = parseDateOfBirth(requiredDate);

    if (!parsedRequiredDate) {
      return {
        error: {
          status: 400,
          message: 'Required date must be a valid date.',
        },
      };
    }
  }

  if (!hospital || typeof hospital !== 'object') {
    return {
      error: { status: 400, message: 'Hospital information is required.' },
    };
  }

  const hospitalName = String(hospital.name || '').trim();
  const hospitalCity = String(hospital.city || '').trim();
  const hospitalAddressLine = String(hospital.addressLine || '').trim();

  if (!hospitalName) {
    return {
      error: { status: 400, message: 'Hospital name is required.' },
    };
  }

  if (!hospitalCity) {
    return {
      error: { status: 400, message: 'Hospital city is required.' },
    };
  }

  if (!location || typeof location !== 'object') {
    return {
      error: { status: 400, message: 'Location is required.' },
    };
  }

  const city = String(location.city || '').trim();
  const country = String(location.country || '').trim();
  const addressLine = String(location.addressLine || '').trim();

  if (!city) {
    return {
      error: { status: 400, message: 'City is required.' },
    };
  }

  if (!country) {
    return {
      error: { status: 400, message: 'Country is required.' },
    };
  }

  const trimmedMedicalNotes = medicalNotes ? String(medicalNotes).trim() : '';

  if (trimmedMedicalNotes.length > MEDICAL_NOTES_MAX_LENGTH) {
    return {
      error: {
        status: 400,
        message: 'Medical notes cannot exceed 500 characters.',
      },
    };
  }

  const trimmedTitle = title ? String(title).trim() : '';

  const locationResult = buildLocationPayload({
    city,
    country,
    addressLine: addressLine || undefined,
    coordinates: Object.prototype.hasOwnProperty.call(location, 'coordinates')
      ? location.coordinates
      : undefined,
  });

  if (locationResult.error) {
    return {
      error: { status: 400, message: locationResult.error },
    };
  }

  return {
    payload: {
      bloodTypeNeeded: String(bloodTypeNeeded).trim(),
      unitsNeeded: parsedUnits,
      urgency: normalizedUrgency,
      requiredDate: parsedRequiredDate,
      hospital: buildHospitalPayload({
        name: hospitalName,
        city: hospitalCity,
        addressLine: hospitalAddressLine || undefined,
      }),
      location: locationResult,
      medicalNotes: trimmedMedicalNotes || null,
      title: trimmedTitle || null,
    },
  };
}

function toSafeBloodRequestForDonor(request) {
  if (!request) {
    return null;
  }

  const obj = request.toObject ? request.toObject() : request;

  return {
    id: obj._id != null ? String(obj._id) : null,
    bloodTypeNeeded: obj.bloodTypeNeeded,
    unitsNeeded: obj.unitsNeeded,
    urgency: obj.urgency,
    requiredDate: obj.requiredDate,
    hospital: obj.hospital,
    location: obj.location,
    title: obj.title,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function toSafeBloodRequestDetailsForDonor(request) {
  if (!request) {
    return null;
  }

  const obj = request.toObject ? request.toObject() : request;

  return {
    id: obj._id != null ? String(obj._id) : null,
    bloodTypeNeeded: obj.bloodTypeNeeded,
    unitsNeeded: obj.unitsNeeded,
    urgency: obj.urgency,
    requiredDate: obj.requiredDate,
    hospital: obj.hospital,
    location: obj.location,
    medicalNotes: obj.medicalNotes,
    title: obj.title,
    status: obj.status,
    createdAt: obj.createdAt,
  };
}

module.exports = {
  toSafeBloodRequest,
  toSafeBloodRequestForDonor,
  toSafeBloodRequestDetailsForDonor,
  normalizeBloodRequestInput,
};
