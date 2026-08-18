const bcrypt = require('bcrypt');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const toSafeUser = require('../utils/toSafeUser');
const isValidEmail = require('../utils/validateEmail');
const validatePassword = require('../utils/validatePassword');
const { normalizeLebanesePhone } = require('../utils/validatePhone');
const asyncHandler = require('../utils/asyncHandler');

const SALT_ROUNDS = 12;

const register = asyncHandler(async (req, res) => {
  const { fullName, email, phoneNumber, password } = req.body;

  if (fullName == null || email == null || phoneNumber == null || password == null) {
    return res.status(400).json({
      success: false,
      message: 'Full name, email, phone number, and password are required.',
    });
  }

  const normalizedFullName = String(fullName).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = normalizeLebanesePhone(phoneNumber);

  if (!normalizedFullName) {
    return res.status(400).json({
      success: false,
      message: 'Full name is required.',
    });
  }

  if (normalizedFullName.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Full name must be at least 2 characters.',
    });
  }

  if (!normalizedEmail) {
    return res.status(400).json({
      success: false,
      message: 'Email is required.',
    });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address.',
    });
  }

  if (!String(phoneNumber).trim()) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required.',
    });
  }

  if (!normalizedPhone) {
    return res.status(400).json({
      success: false,
      message:
        'Please provide a valid Lebanese mobile number (e.g. 03xxxxxx, 70xxxxxx, or +961...).',
    });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({
      success: false,
      message: passwordError,
    });
  }

  const existingEmailUser = await User.findOne({ email: normalizedEmail });
  if (existingEmailUser) {
    console.log('[register] Duplicate email blocked:', normalizedEmail);
    return res.status(409).json({
      success: false,
      message: 'An account with this email already exists. Please log in.',
    });
  }

  const existingPhoneUser = await User.findOne({ phoneNumber: normalizedPhone });
  if (existingPhoneUser) {
    console.log('[register] Duplicate phone blocked:', normalizedPhone);
    return res.status(409).json({
      success: false,
      message: 'An account with this phone number already exists. Please log in.',
    });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    user = await User.create({
      fullName: normalizedFullName,
      email: normalizedEmail,
      phoneNumber: normalizedPhone,
      passwordHash,
      roles: [],
      accountStatus: 'pending_verification',
    });
  } catch (error) {
    const duplicateCode = Number(error && error.code);
    if (duplicateCode === 11000) {
      const field =
        Object.keys(error.keyValue || {})[0] ||
        Object.keys(error.keyPattern || {})[0] ||
        '';
      const errorText = `${error.message || ''} ${JSON.stringify(error.keyValue || {})}`;

      console.log('[register] Mongo duplicate-key error:', field || errorText);

      if (field === 'email' || /email/i.test(errorText)) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists. Please log in.',
        });
      }

      if (field === 'phoneNumber' || /phone/i.test(errorText)) {
        return res.status(409).json({
          success: false,
          message: 'An account with this phone number already exists. Please log in.',
        });
      }

      return res.status(409).json({
        success: false,
        message: 'An account with these details already exists. Please log in.',
      });
    }

    throw error;
  }

  const token = generateToken(user);

  return res.status(201).json({
    success: true,
    message: 'Registration successful.',
    token,
    user: toSafeUser(user),
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password.',
    });
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password.',
    });
  }

  if (user.accountStatus === 'suspended') {
    return res.status(403).json({
      success: false,
      message: 'Account is suspended.',
    });
  }

  if (user.accountStatus === 'deactivated') {
    return res.status(403).json({
      success: false,
      message: 'Account is deactivated.',
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = generateToken(user);

  return res.status(200).json({
    success: true,
    message: 'Login successful.',
    token,
    user: toSafeUser(user),
  });
});

const getMe = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
});

const checkEmail = asyncHandler(async (req, res) => {
  const email = String(req.query.email || '')
    .trim()
    .toLowerCase();

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required.',
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address.',
    });
  }

  const existingUser = await User.exists({ email });

  return res.status(200).json({
    success: true,
    exists: Boolean(existingUser),
  });
});

const ALLOWED_ROLES = ['donor', 'recipient'];

const updateRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Role must be either "donor" or "recipient".',
    });
  }

  const userId = req.user.id;
  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found.',
    });
  }

  if (!user.roles.includes(role)) {
    user.roles.push(role);
  }

  user.primaryRole = role;
  await user.save();

  return res.status(200).json({
    success: true,
    message: 'Role updated successfully.',
    user: toSafeUser(user),
  });
});

module.exports = {
  register,
  login,
  getMe,
  checkEmail,
  updateRole,
};
