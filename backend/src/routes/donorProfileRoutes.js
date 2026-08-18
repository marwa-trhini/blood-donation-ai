const express = require('express');
const {
  createDonorProfile,
  getMyDonorProfile,
  updateDonorProfile,
} = require('../controllers/donorProfileController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', protect, getMyDonorProfile);
router.patch('/me', protect, updateDonorProfile);
router.post('/', protect, createDonorProfile);

module.exports = router;
