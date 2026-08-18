function toSafeChatMessage(chatMessage) {
  if (!chatMessage) {
    return null;
  }

  const obj = chatMessage.toObject ? chatMessage.toObject() : chatMessage;

  return {
    id: obj._id,
    conversationId: obj.conversationId || null,
    donationRequestId: obj.donationRequestId || null,
    senderId: obj.senderId,
    receiverId: obj.receiverId,
    message: obj.message,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    readAt: obj.readAt || null,
  };
}

function toSafeConversation({
  conversationId,
  donationRequestId,
  otherUser,
  otherUserSubtitle,
  lastMessage,
  lastMessageAt,
  unreadCount,
  donationRequestStatus,
  chatClosed,
}) {
  return {
    conversationId,
    donationRequestId: donationRequestId || null,
    otherUser: otherUser
      ? {
          id: otherUser._id || otherUser.id,
          fullName: otherUser.fullName || null,
          bloodType: otherUser.bloodType || null,
          role: otherUser.role || null,
        }
      : null,
    otherUserSubtitle: otherUserSubtitle || null,
    lastMessage: lastMessage || null,
    lastMessageAt: lastMessageAt || null,
    unreadCount: unreadCount || 0,
    donationRequestStatus: donationRequestStatus || null,
    chatClosed: chatClosed === true,
  };
}

module.exports = {
  toSafeChatMessage,
  toSafeConversation,
};
