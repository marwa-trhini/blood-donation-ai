const mongoose = require('mongoose');
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const ChatConversationDeletion = require('../models/ChatConversationDeletion');
const DonationRequest = require('../models/DonationRequest');

function buildParticipantKey(userIdA, userIdB) {
  const a = String(userIdA);
  const b = String(userIdB);
  const [smaller, larger] = a < b ? [a, b] : [b, a];

  return `${smaller}_${larger}`;
}

function getSortedParticipantIds(userIdA, userIdB) {
  const a = String(userIdA);
  const b = String(userIdB);
  const [smaller, larger] = a < b ? [a, b] : [b, a];

  return {
    participantA: new mongoose.Types.ObjectId(smaller),
    participantB: new mongoose.Types.ObjectId(larger),
    participantKey: `${smaller}_${larger}`,
  };
}

async function getOrCreateConversation(userIdA, userIdB) {
  const { participantA, participantB, participantKey } = getSortedParticipantIds(userIdA, userIdB);

  let conversation = await ChatConversation.findOne({ participantKey });

  if (conversation) {
    return conversation;
  }

  try {
    conversation = await ChatConversation.create({
      participantA,
      participantB,
      participantKey,
    });
    return conversation;
  } catch (error) {
    if (error?.code === 11000) {
      return ChatConversation.findOne({ participantKey });
    }

    throw error;
  }
}

async function findReadableDonationRequestsForPair(participantA, participantB) {
  return DonationRequest.find({
    $or: [
      { donorId: participantA, recipientId: participantB },
      { donorId: participantB, recipientId: participantA },
    ],
    status: { $in: ['accepted', 'completed'] },
  })
    .select('_id donorId recipientId status updatedAt')
    .sort({ updatedAt: -1 })
    .lean();
}

function getPairChatStatus(donationRequests) {
  const hasAccepted = donationRequests.some(
    (request) => String(request.status || '').toLowerCase() === 'accepted'
  );
  const hasReadable = donationRequests.some((request) => {
    const status = String(request.status || '').toLowerCase();
    return status === 'accepted' || status === 'completed';
  });

  return {
    hasAccepted,
    hasReadable,
    chatClosed: hasReadable && !hasAccepted,
  };
}

async function backfillMessagesForConversation(conversationId, participantA, participantB) {
  const donationRequests = await DonationRequest.find({
    $or: [
      { donorId: participantA, recipientId: participantB },
      { donorId: participantB, recipientId: participantA },
    ],
  })
    .select('_id')
    .lean();

  if (!donationRequests.length) {
    return 0;
  }

  const donationRequestIds = donationRequests.map((request) => request._id);

  const result = await ChatMessage.updateMany(
    {
      donationRequestId: { $in: donationRequestIds },
      $or: [{ conversationId: { $exists: false } }, { conversationId: null }],
    },
    {
      $set: { conversationId },
    }
  );

  return result.modifiedCount || 0;
}

async function resolveConversationFromDonationRequest(donationRequest) {
  const conversation = await getOrCreateConversation(
    donationRequest.donorId,
    donationRequest.recipientId
  );

  await backfillMessagesForConversation(
    conversation._id,
    conversation.participantA,
    conversation.participantB
  );

  return conversation;
}

async function migrateLegacyConversationDeletions() {
  const legacyDeletions = await ChatConversationDeletion.find({
    conversationId: { $exists: false },
    donationRequestId: { $exists: true, $ne: null },
  })
    .select('_id donationRequestId userId deletedAt')
    .lean();

  let migratedCount = 0;

  for (const deletion of legacyDeletions) {
    const donationRequest = await DonationRequest.findById(deletion.donationRequestId)
      .select('donorId recipientId')
      .lean();

    if (!donationRequest) {
      continue;
    }

    const conversation = await getOrCreateConversation(
      donationRequest.donorId,
      donationRequest.recipientId
    );

    await ChatConversationDeletion.findOneAndUpdate(
      {
        conversationId: conversation._id,
        userId: deletion.userId,
      },
      {
        $set: { deletedAt: deletion.deletedAt },
        $unset: { donationRequestId: '' },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    await ChatConversationDeletion.deleteOne({ _id: deletion._id });
    migratedCount += 1;
  }

  return migratedCount;
}

async function syncConversationLastMessageAt(conversationId) {
  const latestMessage = await ChatMessage.findOne({ conversationId })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();

  await ChatConversation.findByIdAndUpdate(conversationId, {
    lastMessageAt: latestMessage?.createdAt || null,
  });
}

function getOtherParticipantId(conversation, userId) {
  if (String(conversation.participantA) === String(userId)) {
    return conversation.participantB;
  }

  return conversation.participantA;
}

module.exports = {
  buildParticipantKey,
  getSortedParticipantIds,
  getOrCreateConversation,
  findReadableDonationRequestsForPair,
  getPairChatStatus,
  backfillMessagesForConversation,
  resolveConversationFromDonationRequest,
  migrateLegacyConversationDeletions,
  syncConversationLastMessageAt,
  getOtherParticipantId,
};
