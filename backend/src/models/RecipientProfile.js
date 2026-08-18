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

const emergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: null },
    phoneNumber: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const recipientProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    bloodTypeNeeded: {
      type: String,
      required: [true, 'Blood type needed is required'],
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
    hospital: {
      type: hospitalSchema,
      required: true,
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
    unitsNeeded: {
      type: Number,
      required: [true, 'Units needed is required'],
      min: [1, 'At least 1 unit is required'],
    },
    medicalNotes: {
      type: String,
      trim: true,
      default: null,
      maxlength: [500, 'Medical notes cannot exceed 500 characters'],
    },
    emergencyContact: {
      type: emergencyContactSchema,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'recipient_profiles',
    minimize: true,
  }
);

recipientProfileSchema.index({ bloodTypeNeeded: 1, urgency: 1 });
recipientProfileSchema.index({ 'location.city': 1 });
recipientProfileSchema.index(
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

recipientProfileSchema.pre('validate', function preValidateRecipientProfile(next) {
  if (this.location) {
    removeInvalidCoordinates(this.location);
  }

  next();
});

recipientProfileSchema.pre('save', function preSaveRecipientProfile(next) {
  if (this.location) {
    removeInvalidCoordinates(this.location);
    this.markModified('location');
  }

  next();
});

const RecipientProfile = mongoose.model('RecipientProfile', recipientProfileSchema);

module.exports = RecipientProfile;
