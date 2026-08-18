require('dotenv').config();

const mongoose = require('mongoose');
const ChatMessage = require('../src/models/ChatMessage');
const ChatConversation = require('../src/models/ChatConversation');
const ChatConversationDeletion = require('../src/models/ChatConversationDeletion');
const DonationRequest = require('../src/models/DonationRequest');
const {
  getOrCreateConversation,
  backfillMessagesForConversation,
  migrateLegacyConversationDeletions,
  syncConversationLastMessageAt,
  buildParticipantKey,
} = require('../src/utils/conversationHelpers');

async function migrateMessagesWithoutConversationId() {
  const messages = await ChatMessage.find({
    $or: [{ conversationId: { $exists: false } }, { conversationId: null }],
    donationRequestId: { $exists: true, $ne: null },
  })
    .select('_id donationRequestId')
    .lean();

  console.log(`Found ${messages.length} message(s) without conversationId.`);

  const donationRequestIds = [
    ...new Set(messages.map((message) => String(message.donationRequestId))),
  ];

  const donationRequests = await DonationRequest.find({
    _id: { $in: donationRequestIds },
  })
    .select('_id donorId recipientId')
    .lean();

  const donationRequestsById = new Map(
    donationRequests.map((request) => [String(request._id), request])
  );

  const pairKeys = new Set();

  for (const request of donationRequests) {
    pairKeys.add(buildParticipantKey(request.donorId, request.recipientId));
  }

  let backfilledCount = 0;

  for (const participantKey of pairKeys) {
    const [participantAStr, participantBStr] = participantKey.split('_');
    const conversation = await getOrCreateConversation(participantAStr, participantBStr);
    const modified = await backfillMessagesForConversation(
      conversation._id,
      conversation.participantA,
      conversation.participantB
    );
    backfilledCount += modified;
    await syncConversationLastMessageAt(conversation._id);
  }

  console.log(`Backfilled conversationId on ${backfilledCount} message(s).`);
  return backfilledCount;
}

async function syncAllConversationTimestamps() {
  const conversations = await ChatConversation.find({}).select('_id').lean();

  for (const conversation of conversations) {
    await syncConversationLastMessageAt(conversation._id);
  }

  console.log(`Synced lastMessageAt for ${conversations.length} conversation(s).`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required.');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const backfilledCount = await migrateMessagesWithoutConversationId();
  const migratedDeletions = await migrateLegacyConversationDeletions();
  await syncAllConversationTimestamps();

  console.log('Migration complete.');
  console.log(`- Messages backfilled: ${backfilledCount}`);
  console.log(`- Legacy deletions migrated: ${migratedDeletions}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Migration failed:', error);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    console.error('Failed to disconnect MongoDB:', disconnectError);
  }
  process.exit(1);
});
