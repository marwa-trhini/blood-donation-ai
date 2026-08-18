const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret } = require('../config/env');
const toSafeUser = require('../utils/toSafeUser');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Attach req.user when a valid Bearer token is present.
 * Does not reject unauthenticated requests — used for AI chat proxy.
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return next();
    }

    if (user.accountStatus === 'suspended' || user.accountStatus === 'deactivated') {
      return next();
    }

    req.user = toSafeUser(user);
    req.auth = {
      userId: decoded.userId,
      roles: decoded.roles,
    };
  } catch {
    // Invalid token — continue without authenticated user.
  }

  next();
});

module.exports = optionalAuth;
