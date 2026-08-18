const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config/env');

function generateToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      roles: user.roles,
    },
    jwtSecret,
    {
      expiresIn: jwtExpiresIn,
    }
  );
}

module.exports = generateToken;
