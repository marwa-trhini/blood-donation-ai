const express = require('express');
const {
  register,
  login,
  getMe,
  checkEmail,
  updateRole,
} = require('../controllers/authController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/check-email', checkEmail);
router.get('/me', protect, getMe);
router.patch('/role', protect, updateRole);

module.exports = router;
