import { CommonActions } from '@react-navigation/native';

import { getCurrentUser, logoutUser } from '../services/api';

let logoutConfirmationHandler = null;

export function registerLogoutConfirmationHandler(handler) {
  logoutConfirmationHandler = handler;
}

export async function executeLogout(navigation) {
  await logoutUser();
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    })
  );
}

export function getProfileRouteForUser(user) {
  if (user?.primaryRole === 'recipient') {
    return 'RecipientProfile';
  }

  if (user?.primaryRole === 'donor') {
    return 'DonorProfile';
  }

  return 'RoleSelection';
}

export function getHomeRouteForUser(user) {
  if (user?.primaryRole === 'recipient') {
    return 'RecipientHome';
  }

  if (user?.primaryRole === 'donor') {
    return 'DonorHome';
  }

  return 'RoleSelection';
}

export function getRequestsRouteForUser(user) {
  if (user?.primaryRole === 'recipient') {
    return 'RecipientDonationRequests';
  }

  if (user?.primaryRole === 'donor') {
    return 'DonationRequests';
  }

  return 'RoleSelection';
}

export function isDonorPrimaryRole(user) {
  return user?.primaryRole === 'donor';
}

export function isRecipientPrimaryRole(user) {
  return user?.primaryRole === 'recipient';
}

export function confirmLogout(navigation) {
  if (typeof logoutConfirmationHandler === 'function') {
    logoutConfirmationHandler(navigation);
    return;
  }

  executeLogout(navigation);
}
