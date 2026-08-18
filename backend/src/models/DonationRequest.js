const mongoose = require('mongoose');

const donationRequestSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    donorId: {
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
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'cancelled', 'completed'],
      default: 'pending',
      trim: true,
      index: true,
    },
    message: {
      type: String,
      trim: true,
      default: null,
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'donation_requests',
    minimize: true,
  }
);

donationRequestSchema.index({ donorId: 1, createdAt: -1 });
donationRequestSchema.index({ recipientId: 1, createdAt: -1 });
donationRequestSchema.index({ donorId: 1, status: 1, completedAt: -1 });
donationRequestSchema.index({ bloodRequestId: 1, status: 1 });
donationRequestSchema.index(
  { recipientId: 1, donorId: 1, bloodRequestId: 1, status: 1 },
  { name: 'recipient_donor_blood_request_status' }
);

const DonationRequest = mongoose.model('DonationRequest', donationRequestSchema);

module.exports = DonationRequest;
