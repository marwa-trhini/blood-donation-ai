const mongoose = require('mongoose');

const geoPointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    addressLine: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    coordinates: {
      type: geoPointSchema,
      required: false,
    },
  },
  {
    _id: false,
    strict: false,
  }
);

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    addressLine: { type: String, trim: true },
  },
  { _id: false }
);

const bloodRequestSchema = new mongoose.Schema(
  {
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bloodTypeNeeded: {
      type: String,
      required: [true, 'Blood type needed is required'],
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      trim: true,
    },
    unitsNeeded: {
      type: Number,
      required: [true, 'Units needed is required'],
      min: [1, 'At least 1 unit is required'],
    },
    urgency: {
      type: String,
      required: [true, 'Urgency is required'],
      enum: ['emergency', 'urgent', 'normal'],
      trim: true,
    },
    requiredDate: {
      type: Date,
      default: null,
    },
    hospital: {
      type: hospitalSchema,
      required: true,
    },
    location: {
      type: locationSchema,
      required: true,
    },
    medicalNotes: {
      type: String,
      trim: true,
      default: null,
      maxlength: [500, 'Medical notes cannot exceed 500 characters'],
    },
    title: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['open', 'fulfilled', 'cancelled'],
      default: 'open',
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'blood_requests',
    minimize: true,
  }
);

bloodRequestSchema.index({ status: 1, urgency: 1, bloodTypeNeeded: 1 });
bloodRequestSchema.index({ requesterId: 1, createdAt: -1 });
bloodRequestSchema.index(
  { 'location.coordinates': '2dsphere' },
  { sparse: true }
);

function isValidGeoCoordinatePair(longitude, latitude) {
  return (
    typeof longitude === 'number' &&
    typeof latitude === 'number' &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

function removeInvalidCoordinates(location) {
  if (!location || location.coordinates == null) {
    return;
  }

  const geo = location.coordinates;
  const coords = geo && geo.coordinates;

  const isValid =
    geo &&
    geo.type === 'Point' &&
    Array.isArray(coords) &&
    coords.length === 2 &&
    isValidGeoCoordinatePair(coords[0], coords[1]);

  if (!isValid) {
    delete location.coordinates;

    if (typeof location.set === 'function') {
      location.set('coordinates', undefined, { strict: false });
    }

    if (location._doc) {
      delete location._doc.coordinates;
    }
  }
}

bloodRequestSchema.pre('validate', function preValidateBloodRequest(next) {
  if (this.location) {
    removeInvalidCoordinates(this.location);
  }

  next();
});

bloodRequestSchema.pre('save', function preSaveBloodRequest(next) {
  if (this.location) {
    removeInvalidCoordinates(this.location);
    this.markModified('location');
  }

  next();
});

const BloodRequest = mongoose.model('BloodRequest', bloodRequestSchema);

module.exports = BloodRequest;
