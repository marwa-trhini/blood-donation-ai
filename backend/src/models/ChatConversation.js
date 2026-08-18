const mongoose = require('mongoose');

const chatConversationSchema = new mongoose.Schema(
  {
    participantA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    participantB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    participantKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'chat_conversations',
  }
);

chatConversationSchema.index({ participantA: 1, participantB: 1 });
chatConversationSchema.index({ lastMessageAt: -1 });

const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);

module.exports = ChatConversation;
