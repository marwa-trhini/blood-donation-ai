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
    region: { type: String, trim: true },
    country: { type: String, required: true, trim: true },
    postalCode: { type: String, trim: true },
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

const availabilitySchema = new mongoose.Schema(
  {
    timezone: { type: String, trim: true },
    weeklySlots: [
      {
        dayOfWeek: { type: String, trim: true },
        startTime: { type: String, trim: true },
        endTime: { type: String, trim: true },
      },
    ],
  },
  { _id: false }
);

const donorProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    bloodType: {
      type: String,
      required: [true, 'Blood type is required'],
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
    },
    gender: {
      type: String,
      trim: true,
      default: null,
    },
    location: {
      type: locationSchema,
      required: true,
    },
    availability: {
      type: availabilitySchema,
      default: null,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    preferredHospitalIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
      },
    ],
    lastDonationDate: {
      type: Date,
      default: null,
    },
    totalDonations: {
      type: Number,
      default: 0,
      min: 0,
    },
    bio: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'donor_profiles',
    minimize: true,
  }
);

donorProfileSchema.index({ bloodType: 1, isAvailable: 1 });
donorProfileSchema.index(
  { 'location.coordinates': '2dsphere' },
  { sparse: true }
);

function isValidGeoCoordinatePair(longitude, latitude) {
  const parsedLongitude = Number(longitude);
  const parsedLatitude = Number(latitude);

  return (
    Number.isFinite(parsedLongitude) &&
    Number.isFinite(parsedLatitude) &&
    parsedLongitude >= -180 &&
    parsedLongitude <= 180 &&
    parsedLatitude >= -90 &&
    parsedLatitude <= 90
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

donorProfileSchema.pre('validate', function preValidateDonorProfile(next) {
  if (this.location) {
    removeInvalidCoordinates(this.location);
  }

  next();
});

donorProfileSchema.pre('save', function preSaveDonorProfile(next) {
  if (this.location) {
    removeInvalidCoordinates(this.location);
    this.markModified('location');
  }

  next();
});

const DonorProfile = mongoose.model('DonorProfile', donorProfileSchema);

module.exports = DonorProfile;
