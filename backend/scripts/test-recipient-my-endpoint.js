require('dotenv').config();

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const DonationRequest = require('../src/models/DonationRequest');
const { jwtSecret } = require('../src/config/env');

const API_BASE = `http://127.0.0.1:${process.env.PORT || 5000}`;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const recipient = await User.findById('6a784adbb15c37fe0d13a8c8');
  const token = jwt.sign(
    { userId: String(recipient._id), roles: recipient.roles },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const mongoCount = await DonationRequest.countDocuments({
    recipientId: recipient._id,
  });

  console.log('=== FINAL DEBUG RESULT ===');
  console.log('1. MongoDB DonationRequest.find({ recipientId }) count:', mongoCount);

  const latest = await DonationRequest.findOne({ recipientId: recipient._id })
    .sort({ createdAt: -1 })
    .lean();
  if (latest) {
    console.log('   Latest request recipientId:', String(latest.recipientId));
    console.log('   Latest request donorId:', String(latest.donorId));
    console.log('   Latest request status:', latest.status);
  }

  console.log('2. Recipient user id:', String(recipient._id));

  const myRes = await fetch(`${API_BASE}/api/donation-requests/my?as=recipient`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const my = await myRes.json();

  console.log('3. GET /api/donation-requests/my?as=recipient');
  console.log('   HTTP status:', myRes.status);
  console.log('   requests count:', Array.isArray(my.requests) ? my.requests.length : 0);

  const debugRes = await fetch(`${API_BASE}/api/donation-requests/debug/recipient`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const debug = await debugRes.json();
  console.log('4. GET /api/donation-requests/debug/recipient count:', debug.count);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
