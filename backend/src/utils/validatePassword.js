function validatePassword(password) {
  if (!password) {
    return 'Password is required.';
  }

  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }

  if (!/[A-Za-z]/.test(password)) {
    return 'Password must contain at least one letter.';
  }

  if (!/\d/.test(password)) {
    return 'Password must contain at least one number.';
  }

  return null;
}

module.exports = validatePassword;
