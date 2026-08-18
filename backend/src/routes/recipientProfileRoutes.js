const express = require('express');
const {
  createRecipientProfile,
  getMyRecipientProfile,
  updateRecipientProfile,
} = require('../controllers/recipientProfileController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', protect, getMyRecipientProfile);
router.patch('/me', protect, updateRecipientProfile);
router.post('/', protect, createRecipientProfile);

module.exports = router;
