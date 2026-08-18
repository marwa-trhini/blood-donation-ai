const express = require('express');
const {
  createBloodRequest,
  getMyBloodRequests,
  getCompatibleBloodRequests,
  getBloodRequestById,
  getBloodRequestMatches,
} = require('../controllers/bloodRequestController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/compatible', protect, getCompatibleBloodRequests);
router.get('/my', protect, getMyBloodRequests);
router.get('/:requestId/matches', protect, getBloodRequestMatches);
router.get('/:requestId', protect, getBloodRequestById);
router.post('/', protect, createBloodRequest);

module.exports = router;
