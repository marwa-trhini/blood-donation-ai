const mongoose = require('mongoose');

const chatConversationDeletionSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatConversation',
      required: false,
      index: true,
    },
    donationRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DonationRequest',
      required: false,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deletedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'chat_conversation_deletions',
  }
);

chatConversationDeletionSchema.index({ conversationId: 1, userId: 1 }, { unique: true, sparse: true });
chatConversationDeletionSchema.index({ donationRequestId: 1, userId: 1 }, { unique: true, sparse: true });
chatConversationDeletionSchema.index({ userId: 1, deletedAt: -1 });

const ChatConversationDeletion = mongoose.model(
  'ChatConversationDeletion',
  chatConversationDeletionSchema
);

module.exports = ChatConversationDeletion;
