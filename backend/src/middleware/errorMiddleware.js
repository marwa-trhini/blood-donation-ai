function notFound(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((item) => item.message);

    return res.status(400).json({
      success: false,
      message: messages.join(', '),
    });
  }

  if (Number(err.code) === 11000) {
    const field =
      Object.keys(err.keyValue || {})[0] ||
      Object.keys(err.keyPattern || {})[0] ||
      'field';
    const errorText = `${err.message || ''} ${JSON.stringify(err.keyValue || {})}`;

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

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token.',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired.',
    });
  }

  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error.',
  });
}

module.exports = {
  notFound,
  errorHandler,
};
