const Notification = require('../models/Notification');

async function createNotification({
  recipientId,
  type,
  title,
  message,
  relatedId = null,
  relatedType = null,
}) {
  return Notification.create({
    recipientId,
    type,
    title,
    message,
    relatedId,
    relatedType,
    isRead: false,
  });
}

async function createDonationRequestNotification({
  donorId,
  donationRequestId,
  bloodTypeNeeded,
}) {
  const bloodTypeLabel = bloodTypeNeeded || 'blood';

  return createNotification({
    recipientId: donorId,
    type: 'donation_request',
    title: 'New Donation Request',
    message: `Someone needs your help with a ${bloodTypeLabel} blood request.`,
    relatedId: donationRequestId,
    relatedType: 'DonationRequest',
  });
}

async function createDonationAcceptedNotification({
  recipientId,
  donationRequestId,
}) {
  return createNotification({
    recipientId,
    type: 'donation_accepted',
    title: 'Donation Request Accepted',
    message: 'Your donation request has been accepted by a donor.',
    relatedId: donationRequestId,
    relatedType: 'DonationRequest',
  });
}

async function createDonationDeclinedNotification({
  recipientId,
  donationRequestId,
}) {
  return createNotification({
    recipientId,
    type: 'donation_declined',
    title: 'Donation Request Declined',
    message: 'Your donation request was declined by the donor.',
    relatedId: donationRequestId,
    relatedType: 'DonationRequest',
  });
}

async function createDonationCancelledNotification({
  donorId,
  donationRequestId,
}) {
  return createNotification({
    recipientId: donorId,
    type: 'donation_cancelled',
    title: 'Donation Request Cancelled',
    message: 'A recipient cancelled their donation request.',
    relatedId: donationRequestId,
    relatedType: 'DonationRequest',
  });
}

async function createDonationCompletedNotifications({
  donorUserId,
  recipientUserId,
  donationRequestId,
}) {
  if (!donorUserId || !recipientUserId || !donationRequestId) {
    throw new Error('Missing required IDs for donation completed notifications.');
  }

  const donorNotification = {
    recipientId: donorUserId,
    type: 'donation_completed',
    title: 'Donation Completed',
    message:
      'Thank you for helping save a life. Your donation has been successfully completed.',
    relatedId: donationRequestId,
    relatedType: 'DonationRequest',
  };

  const recipientNotification = {
    recipientId: recipientUserId,
    type: 'donation_completed',
    title: 'Donation Completed',
    message:
      'Your blood donation request has been fulfilled. Thank you for using BloodConnect.',
    relatedId: donationRequestId,
    relatedType: 'DonationRequest',
  };

  await createNotification(donorNotification);
  await createNotification(recipientNotification);
}

async function createRideRequestedNotification({ recipientId, rideRequestId }) {
  return createNotification({
    recipientId,
    type: 'ride_requested',
    title: 'Ride Requested',
    message: 'A donor has requested a ride for the donation.',
    relatedId: rideRequestId,
    relatedType: 'RideRequest',
  });
}

async function createRideAcceptedNotification({ donorId, rideRequestId }) {
  return createNotification({
    recipientId: donorId,
    type: 'ride_accepted',
    title: 'Ride Accepted',
    message: 'Your ride request has been accepted.',
    relatedId: rideRequestId,
    relatedType: 'RideRequest',
  });
}

async function createRideCancelledNotification({
  notifyUserId,
  rideRequestId,
  cancelledByDonor,
}) {
  return createNotification({
    recipientId: notifyUserId,
    type: 'ride_cancelled',
    title: 'Ride Cancelled',
    message: cancelledByDonor
      ? 'The donor has cancelled the ride request.'
      : 'Your ride request has been cancelled.',
    relatedId: rideRequestId,
    relatedType: 'RideRequest',
  });
}

async function createRideCompletedNotifications({
  donorId,
  recipientId,
  rideRequestId,
}) {
  await createNotification({
    recipientId: donorId,
    type: 'ride_completed',
    title: 'Ride Completed',
    message: 'The ride has been completed.',
    relatedId: rideRequestId,
    relatedType: 'RideRequest',
  });

  await createNotification({
    recipientId,
    type: 'ride_completed',
    title: 'Ride Completed',
    message: 'The ride has been completed.',
    relatedId: rideRequestId,
    relatedType: 'RideRequest',
  });
}

async function createChatMessageNotification({
  receiverId,
  donationRequestId,
  senderName,
}) {
  const senderLabel = String(senderName || '').trim() || 'your contact';

  return createNotification({
    recipientId: receiverId,
    type: 'chat_message',
    title: 'New Message',
    message: `New message from ${senderLabel}.`,
    relatedId: donationRequestId,
    relatedType: 'DonationRequest',
  });
}

module.exports = {
  createNotification,
  createDonationRequestNotification,
  createDonationAcceptedNotification,
  createDonationDeclinedNotification,
  createDonationCancelledNotification,
  createDonationCompletedNotifications,
  createRideRequestedNotification,
  createRideAcceptedNotification,
  createRideCancelledNotification,
  createRideCompletedNotifications,
  createChatMessageNotification,
};
