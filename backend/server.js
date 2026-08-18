require('dotenv').config();

const express = require('express');
const connectDB = require('./src/config/db');
const { port } = require('./src/config/env');
const authRoutes = require('./src/routes/authRoutes');
const donorProfileRoutes = require('./src/routes/donorProfileRoutes');
const recipientProfileRoutes = require('./src/routes/recipientProfileRoutes');
const bloodRequestRoutes = require('./src/routes/bloodRequestRoutes');
const donationRequestRoutes = require('./src/routes/donationRequestRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const rideRequestRoutes = require('./src/routes/rideRequestRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const aiRoutes = require('./src/routes/aiRoutes');
const { notFound, errorHandler } = require('./src/middleware/errorMiddleware');

const app = express();

connectDB();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'BloodConnect API is running',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/donor-profiles', donorProfileRoutes);
app.use('/api/recipient-profiles', recipientProfileRoutes);
app.use('/api/blood-requests', bloodRequestRoutes);
app.use('/api/donation-requests', donationRequestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ride-requests', rideRequestRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(port, '0.0.0.0', () => {
  console.log(`BloodConnect API running on port ${port}`);
  console.log('Mounted routes include: GET/PATCH/POST /api/donor-profiles');
  console.log('Mounted routes include: GET/PATCH/POST /api/recipient-profiles');
  console.log('Mounted routes include: POST /api/blood-requests');
  console.log('Mounted routes include: GET /api/blood-requests/compatible');
  console.log('Mounted routes include: GET /api/blood-requests/my');
  console.log('Mounted routes include: GET /api/blood-requests/:requestId');
  console.log('Mounted routes include: GET /api/blood-requests/:requestId/matches');
  console.log('Mounted routes include: POST/GET /api/donation-requests');
  console.log('Mounted routes include: GET /api/donation-requests/completed');
  console.log('Mounted routes include: PATCH /api/donation-requests/:requestId/respond');
  console.log('Mounted routes include: POST/GET /api/ride-requests');
  console.log('Mounted routes include: GET/POST/PATCH /api/chat');
  console.log('Mounted routes include: POST /api/ai/chat');
});
