const mongoose = require('mongoose');
const DonationRequest = require('../models/DonationRequest');
const ChatMessage = require('../models/ChatMessage');
const ChatConversation = require('../models/ChatConversation');
const ChatConversationDeletion = require('../models/ChatConversationDeletion');
const User = require('../models/User');
const DonorProfile = require('../models/DonorProfile');
const RecipientProfile = require('../models/RecipientProfile');
const asyncHandler = require('../utils/asyncHandler');
const { toSafeChatMessage, toSafeConversation } = require('../utils/chatHelpers');
const { createChatMessageNotification } = require('../utils/notificationHelpers');
const {
  buildParticipantKey,
  findReadableDonationRequestsForPair,
  getPairChatStatus,
  resolveConversationFromDonationRequest,
  migrateLegacyConversationDeletions,
  syncConversationLastMessageAt,
  getOtherParticipantId,
} = require('../utils/conversationHelpers');

const MESSAGE_MAX_LENGTH = ChatMessage.MESSAGE_MAX_LENGTH;

async function findDonationRequestById(donationRequestId) {
  if (!mongoose.Types.ObjectId.isValid(donationRequestId)) {
    return null;
  }

  return DonationRequest.findById(donationRequestId);
}

function getDonationParticipantRole(donationRequest, userId) {
  if (String(donationRequest.donorId) === String(userId)) {
    return 'donor';
  }

  if (String(donationRequest.recipientId) === String(userId)) {
    return 'recipient';
  }

  return null;
}

function getChatUnavailableMessage(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'completed') {
    return 'Donation completed — chat is closed.';
  }

  if (normalized === 'cancelled') {
    return 'Chat is not available for cancelled donation requests.';
  }

  if (normalized === 'declined') {
    return 'Chat is not available for declined donation requests.';
  }

  if (normalized === 'pending') {
    return 'Chat is available only for accepted donation requests.';
  }

  return 'Chat is not available for this donation request.';
}

async function authorizeChatRead(donationRequestId, userId) {
  const donationRequest = await findDonationRequestById(donationRequestId);

  if (!donationRequest) {
    return {
      error: {
        status: 404,
        message: 'Donation request not found.',
      },
    };
  }

  const role = getDonationParticipantRole(donationRequest, userId);

  if (!role) {
    return {
      error: {
        status: 403,
        message: 'You do not have access to this chat.',
      },
    };
  }

  const normalizedStatus = String(donationRequest.status || '').toLowerCase();

  if (normalizedStatus === 'accepted' || normalizedStatus === 'completed') {
    return { donationRequest, role };
  }

  return {
    error: {
      status: 400,
      message: getChatUnavailableMessage(normalizedStatus),
    },
  };
}

async function authorizeChatWrite(donationRequestId, userId) {
  const authorization = await authorizeChatRead(donationRequestId, userId);

  if (authorization.error) {
    return authorization;
  }

  const pairRequests = await findReadableDonationRequestsForPair(
    authorization.donationRequest.donorId,
    authorization.donationRequest.recipientId
  );
  const pairStatus = getPairChatStatus(pairRequests);

  if (!pairStatus.hasAccepted) {
    return {
      error: {
        status: 400,
        message: getChatUnavailableMessage(
          pairStatus.chatClosed ? 'completed' : authorization.donationRequest.status
        ),
      },
    };
  }

  return authorization;
}

async function authorizeConversationAccess(conversationId, userId) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return {
      error: {
        status: 404,
        message: 'Conversation not found.',
      },
    };
  }

  const conversation = await ChatConversation.findById(conversationId);

  if (!conversation) {
    return {
      error: {
        status: 404,
        message: 'Conversation not found.',
      },
    };
  }

  const userIdString = String(userId);
  const isParticipant =
    String(conversation.participantA) === userIdString ||
    String(conversation.participantB) === userIdString;

  if (!isParticipant) {
    return {
      error: {
        status: 403,
        message: 'You do not have access to this chat.',
      },
    };
  }

  const pairRequests = await findReadableDonationRequestsForPair(
    conversation.participantA,
    conversation.participantB
  );
  const pairStatus = getPairChatStatus(pairRequests);

  if (!pairStatus.hasReadable) {
    return {
      error: {
        status: 400,
        message: 'Chat is not available for this conversation.',
      },
    };
  }

  return { conversation, pairRequests, pairStatus };
}

function getReceiverId(donationRequest, senderRole) {
  if (senderRole === 'donor') {
    return donationRequest.recipientId;
  }

  return donationRequest.donorId;
}

function isConversationHiddenForUser(deletedAt, lastMessageAt) {
  if (!deletedAt) {
    return false;
  }

  if (!lastMessageAt) {
    return true;
  }

  return new Date(lastMessageAt).getTime() <= new Date(deletedAt).getTime();
}

function buildOtherUserSubtitle({ otherUserId, donorId, donorProfilesByUserId, recipientProfilesByUserId }) {
  if (String(otherUserId) === String(donorId)) {
    const bloodType = donorProfilesByUserId.get(String(otherUserId))?.bloodType;
    return bloodType ? `${bloodType} blood donor` : 'Blood donor';
  }

  const bloodTypeNeeded = recipientProfilesByUserId.get(String(otherUserId))?.bloodTypeNeeded;
  return bloodTypeNeeded ? `${bloodTypeNeeded} blood recipient` : 'Blood recipient';
}

async function loadConversationListContext(userId, conversations) {
  const otherUserIds = [
    ...new Set(conversations.map((conversation) => String(getOtherParticipantId(conversation, userId)))),
  ];

  const [otherUsers, donorProfiles, recipientProfiles] = await Promise.all([
    User.find({ _id: { $in: otherUserIds } })
      .select('fullName')
      .lean(),
    DonorProfile.find({ userId: { $in: otherUserIds } })
      .select('userId bloodType')
      .lean(),
    RecipientProfile.find({ userId: { $in: otherUserIds } })
      .select('userId bloodTypeNeeded')
      .lean(),
  ]);

  return {
    otherUsersById: new Map(otherUsers.map((user) => [String(user._id), user])),
    donorProfilesByUserId: new Map(donorProfiles.map((profile) => [String(profile.userId), profile])),
    recipientProfilesByUserId: new Map(
      recipientProfiles.map((profile) => [String(profile.userId), profile])
    ),
  };
}

async function getMessagesForConversation(conversationId) {
  return ChatMessage.find({ conversationId })
    .sort({ createdAt: 1 })
    .lean();
}

const getChatMessages = asyncHandler(async (req, res) => {
  const { donationRequestId } = req.params;
  const authorization = await authorizeChatRead(donationRequestId, req.user.id);

  if (authorization.error) {
    return res.status(authorization.error.status).json({
      success: false,
      message: authorization.error.message,
    });
  }

  const conversation = await resolveConversationFromDonationRequest(authorization.donationRequest);
  const pairRequests = await findReadableDonationRequestsForPair(
    conversation.participantA,
    conversation.participantB
  );
  const pairStatus = getPairChatStatus(pairRequests);
  const messages = await getMessagesForConversation(conversation._id);

  return res.status(200).json({
    success: true,
    conversationId: conversation._id,
    messages: messages.map(toSafeChatMessage).filter(Boolean),
    chatClosed: pairStatus.chatClosed,
    donationRequestStatus: String(authorization.donationRequest.status || '').toLowerCase(),
  });
});

const sendChatMessage = asyncHandler(async (req, res) => {
  const { donationRequestId } = req.params;
  const authorization = await authorizeChatWrite(donationRequestId, req.user.id);

  if (authorization.error) {
    return res.status(authorization.error.status).json({
      success: false,
      message: authorization.error.message,
    });
  }

  const { donationRequest, role } = authorization;
  const trimmedMessage = String(req.body?.message || '').trim();

  if (!trimmedMessage) {
    return res.status(400).json({
      success: false,
      message: 'Message is required.',
    });
  }

  if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Message must be ${MESSAGE_MAX_LENGTH} characters or less.`,
    });
  }

  const conversation = await resolveConversationFromDonationRequest(donationRequest);
  const senderId = req.user.id;
  const receiverId = getReceiverId(donationRequest, role);

  const chatMessage = await ChatMessage.create({
    conversationId: conversation._id,
    donationRequestId: donationRequest._id,
    senderId,
    receiverId,
    message: trimmedMessage,
  });

  await syncConversationLastMessageAt(conversation._id);

  try {
    const senderUser = await User.findById(senderId).select('fullName');
    await createChatMessageNotification({
      receiverId,
      donationRequestId: donationRequest._id,
      senderName: senderUser?.fullName,
    });
  } catch (notificationError) {
    console.error('[Notification] Failed to create chat message notification:', notificationError);
  }

  return res.status(201).json({
    success: true,
    message: 'Message sent.',
    chatMessage: toSafeChatMessage(chatMessage),
  });
});

const markChatMessagesAsRead = asyncHandler(async (req, res) => {
  const { donationRequestId } = req.params;
  const authorization = await authorizeChatRead(donationRequestId, req.user.id);

  if (authorization.error) {
    return res.status(authorization.error.status).json({
      success: false,
      message: authorization.error.message,
    });
  }

  const conversation = await resolveConversationFromDonationRequest(authorization.donationRequest);

  const result = await ChatMessage.updateMany(
    {
      conversationId: conversation._id,
      receiverId: req.user.id,
      readAt: null,
    },
    {
      $set: { readAt: new Date() },
    }
  );

  return res.status(200).json({
    success: true,
    updatedCount: result.modifiedCount || 0,
  });
});

const getChatConversations = asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.id);

  await migrateLegacyConversationDeletions();

  const donationRequests = await DonationRequest.find({
    $or: [{ donorId: userId }, { recipientId: userId }],
    status: { $in: ['accepted', 'completed'] },
  })
    .select('_id donorId recipientId status updatedAt')
    .lean();

  const pairMap = new Map();

  for (const request of donationRequests) {
    const participantKey = buildParticipantKey(request.donorId, request.recipientId);

    if (!pairMap.has(participantKey)) {
      pairMap.set(participantKey, {
        donorId: request.donorId,
        recipientId: request.recipientId,
        requests: [],
      });
    }

    pairMap.get(participantKey).requests.push(request);
  }

  const conversationsForUser = [];

  for (const pair of pairMap.values()) {
    const conversation = await resolveConversationFromDonationRequest(pair.requests[0]);
    conversationsForUser.push({
      conversation,
      pairRequests: pair.requests,
    });
  }

  if (!conversationsForUser.length) {
    return res.status(200).json({
      success: true,
      conversations: [],
      totalUnreadCount: 0,
    });
  }

  const conversationIds = conversationsForUser.map((item) => item.conversation._id);

  const messageStats = await ChatMessage.aggregate([
    {
      $match: {
        conversationId: { $in: conversationIds },
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$conversationId',
        lastMessage: { $first: '$message' },
        lastMessageAt: { $first: '$createdAt' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ['$receiverId', userId] }, { $eq: ['$readAt', null] }],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const statsByConversationId = new Map(messageStats.map((item) => [String(item._id), item]));

  const deletions = await ChatConversationDeletion.find({
    userId,
    conversationId: { $in: conversationIds },
  })
    .select('conversationId deletedAt')
    .lean();

  const deletionsByConversationId = new Map(
    deletions.map((item) => [String(item.conversationId), item.deletedAt])
  );

  const { otherUsersById, donorProfilesByUserId, recipientProfilesByUserId } =
    await loadConversationListContext(
      userId,
      conversationsForUser.map((item) => item.conversation)
    );

  const conversations = conversationsForUser
    .map(({ conversation, pairRequests }) => {
      const stats = statsByConversationId.get(String(conversation._id));
      const deletedAt = deletionsByConversationId.get(String(conversation._id));

      if (isConversationHiddenForUser(deletedAt, stats?.lastMessageAt)) {
        return null;
      }

      const otherUserId = getOtherParticipantId(conversation, userId);
      const pairStatus = getPairChatStatus(pairRequests);
      const primaryRequest = pairRequests.find(
        (request) => String(request.status || '').toLowerCase() === 'accepted'
      ) || pairRequests[0];
      const sortDate = stats?.lastMessageAt || primaryRequest.updatedAt;
      const otherUserRecord = otherUsersById.get(String(otherUserId)) || { _id: otherUserId };
      const otherUserIsDonor = String(otherUserId) === String(primaryRequest.donorId);

      return {
        conversation: toSafeConversation({
          conversationId: conversation._id,
          donationRequestId: primaryRequest._id,
          otherUser: {
            ...otherUserRecord,
            bloodType: otherUserIsDonor
              ? donorProfilesByUserId.get(String(otherUserId))?.bloodType || null
              : recipientProfilesByUserId.get(String(otherUserId))?.bloodTypeNeeded || null,
            role: otherUserIsDonor ? 'donor' : 'recipient',
          },
          otherUserSubtitle: buildOtherUserSubtitle({
            otherUserId,
            donorId: primaryRequest.donorId,
            donorProfilesByUserId,
            recipientProfilesByUserId,
          }),
          lastMessage: stats?.lastMessage || null,
          lastMessageAt: stats?.lastMessageAt || null,
          unreadCount: stats?.unreadCount || 0,
          donationRequestStatus: String(primaryRequest.status || '').toLowerCase(),
          chatClosed: pairStatus.chatClosed,
        }),
        sortDate,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())
    .map((item) => item.conversation);

  const totalUnreadCount = conversations.reduce(
    (sum, conversation) => sum + (conversation.unreadCount || 0),
    0
  );

  return res.status(200).json({
    success: true,
    conversations,
    totalUnreadCount,
  });
});

const deleteChatConversation = asyncHandler(async (req, res) => {
  const { donationRequestId } = req.params;
  const authorization = await authorizeChatRead(donationRequestId, req.user.id);

  if (authorization.error) {
    return res.status(authorization.error.status).json({
      success: false,
      message: authorization.error.message,
    });
  }

  await migrateLegacyConversationDeletions();

  const conversation = await resolveConversationFromDonationRequest(authorization.donationRequest);

  await ChatConversationDeletion.findOneAndUpdate(
    {
      conversationId: conversation._id,
      userId: req.user.id,
    },
    {
      deletedAt: new Date(),
      $unset: { donationRequestId: '' },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return res.status(200).json({
    success: true,
    message: 'Conversation deleted.',
  });
});

const getChatMessagesByConversationId = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const authorization = await authorizeConversationAccess(conversationId, req.user.id);

  if (authorization.error) {
    return res.status(authorization.error.status).json({
      success: false,
      message: authorization.error.message,
    });
  }

  const messages = await getMessagesForConversation(authorization.conversation._id);

  return res.status(200).json({
    success: true,
    conversationId: authorization.conversation._id,
    messages: messages.map(toSafeChatMessage).filter(Boolean),
    chatClosed: authorization.pairStatus.chatClosed,
  });
});

const sendChatMessageByConversationId = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const authorization = await authorizeConversationAccess(conversationId, req.user.id);

  if (authorization.error) {
    return res.status(authorization.error.status).json({
      success: false,
      message: authorization.error.message,
    });
  }

  if (!authorization.pairStatus.hasAccepted) {
    return res.status(400).json({
      success: false,
      message: getChatUnavailableMessage('completed'),
    });
  }

  const trimmedMessage = String(req.body?.message || '').trim();
  const donationRequestId = String(req.body?.donationRequestId || '').trim();

  if (!trimmedMessage) {
    return res.status(400).json({
      success: false,
      message: 'Message is required.',
    });
  }

  if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Message must be ${MESSAGE_MAX_LENGTH} characters or less.`,
    });
  }

  const acceptedRequest =
    authorization.pairRequests.find(
      (request) => String(request.status || '').toLowerCase() === 'accepted'
    ) || authorization.pairRequests[0];

  let donationRequest = acceptedRequest;

  if (donationRequestId) {
    const requestedDonation = authorization.pairRequests.find(
      (request) => String(request._id) === donationRequestId
    );

    if (
      requestedDonation &&
      String(requestedDonation.status || '').toLowerCase() === 'accepted'
    ) {
      donationRequest = requestedDonation;
    }
  }

  const role = getDonationParticipantRole(donationRequest, req.user.id);
  const senderId = req.user.id;
  const receiverId = getReceiverId(donationRequest, role);

  const chatMessage = await ChatMessage.create({
    conversationId: authorization.conversation._id,
    donationRequestId: donationRequest._id,
    senderId,
    receiverId,
    message: trimmedMessage,
  });

  await syncConversationLastMessageAt(authorization.conversation._id);

  try {
    const senderUser = await User.findById(senderId).select('fullName');
    await createChatMessageNotification({
      receiverId,
      donationRequestId: donationRequest._id,
      senderName: senderUser?.fullName,
    });
  } catch (notificationError) {
    console.error('[Notification] Failed to create chat message notification:', notificationError);
  }

  return res.status(201).json({
    success: true,
    message: 'Message sent.',
    chatMessage: toSafeChatMessage(chatMessage),
  });
});

const markChatMessagesAsReadByConversationId = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const authorization = await authorizeConversationAccess(conversationId, req.user.id);

  if (authorization.error) {
    return res.status(authorization.error.status).json({
      success: false,
      message: authorization.error.message,
    });
  }

  const result = await ChatMessage.updateMany(
    {
      conversationId: authorization.conversation._id,
      receiverId: req.user.id,
      readAt: null,
    },
    {
      $set: { readAt: new Date() },
    }
  );

  return res.status(200).json({
    success: true,
    updatedCount: result.modifiedCount || 0,
  });
});

const deleteChatConversationByConversationId = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const authorization = await authorizeConversationAccess(conversationId, req.user.id);

  if (authorization.error) {
    return res.status(authorization.error.status).json({
      success: false,
      message: authorization.error.message,
    });
  }

  await ChatConversationDeletion.findOneAndUpdate(
    {
      conversationId: authorization.conversation._id,
      userId: req.user.id,
    },
    {
      deletedAt: new Date(),
      $unset: { donationRequestId: '' },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return res.status(200).json({
    success: true,
    message: 'Conversation deleted.',
  });
});

module.exports = {
  getChatMessages,
  sendChatMessage,
  markChatMessagesAsRead,
  getChatConversations,
  deleteChatConversation,
  getChatMessagesByConversationId,
  sendChatMessageByConversationId,
  markChatMessagesAsReadByConversationId,
  deleteChatConversationByConversationId,
};
