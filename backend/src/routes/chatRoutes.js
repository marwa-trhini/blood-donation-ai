const express = require('express');
const {
  getChatMessages,
  sendChatMessage,
  markChatMessagesAsRead,
  getChatConversations,
  deleteChatConversation,
  getChatMessagesByConversationId,
  sendChatMessageByConversationId,
  markChatMessagesAsReadByConversationId,
  deleteChatConversationByConversationId,
} = require('../controllers/chatController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/conversations', protect, getChatConversations);
router.get('/conversations/:conversationId/messages', protect, getChatMessagesByConversationId);
router.post('/conversations/:conversationId/messages', protect, sendChatMessageByConversationId);
router.patch('/conversations/:conversationId/read', protect, markChatMessagesAsReadByConversationId);
router.delete('/conversations/:conversationId', protect, deleteChatConversationByConversationId);
router.delete('/:donationRequestId', protect, deleteChatConversation);
router.get('/:donationRequestId/messages', protect, getChatMessages);
router.post('/:donationRequestId/messages', protect, sendChatMessage);
router.patch('/:donationRequestId/read', protect, markChatMessagesAsRead);

module.exports = router;
