const express = require('express');
const {
  createRideRequest,
  getMyRideRequests,
  getRecipientRideRequests,
  getRideRequestById,
  updateRideStatus,
  previewRideRequest,
} = require('../controllers/rideRequestController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/my', protect, getMyRideRequests);
router.get('/recipient', protect, getRecipientRideRequests);
router.get('/preview', protect, previewRideRequest);
router.get('/:rideId', protect, getRideRequestById);
router.post('/', protect, createRideRequest);
router.patch('/:rideId/status', protect, updateRideStatus);

module.exports = router;
