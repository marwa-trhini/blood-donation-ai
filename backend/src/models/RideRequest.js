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
      required: true,
    },
  },
  { _id: false, strict: false }
);

const rideRequestSchema = new mongoose.Schema(
  {
    donationRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DonationRequest',
      required: true,
      unique: true,
      index: true,
    },
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bloodRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BloodRequest',
      required: true,
      index: true,
    },
    pickupLocation: {
      type: locationSchema,
      required: true,
    },
    destinationLocation: {
      type: locationSchema,
      required: true,
    },
    distanceKm: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['requested', 'accepted', 'completed', 'cancelled'],
      default: 'requested',
    },
  },
  {
    timestamps: true,
    collection: 'ride_requests',
  }
);

rideRequestSchema.index({ donorId: 1, createdAt: -1 });

const RideRequest = mongoose.model('RideRequest', rideRequestSchema);

module.exports = RideRequest;
