const express = require('express');
const {
  createDonationRequest,
  getMyDonationRequests,
  getCompletedDonationRequests,
  debugRecipientDonationRequests,
  respondToDonationRequest,
  cancelDonationRequest,
  completeDonationRequest,
} = require('../controllers/donationRequestController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/debug/recipient', protect, debugRecipientDonationRequests);
router.get('/completed', protect, getCompletedDonationRequests);
router.get('/my', protect, getMyDonationRequests);
router.patch('/:requestId/cancel', protect, cancelDonationRequest);
router.patch('/:requestId/complete', protect, completeDonationRequest);
router.patch('/:requestId/respond', protect, respondToDonationRequest);
router.post('/', protect, createDonationRequest);

module.exports = router;
