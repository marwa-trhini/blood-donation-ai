function toSafeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    roles: user.roles,
    primaryRole: user.primaryRole,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    profilePhotoUrl: user.profilePhotoUrl,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

module.exports = toSafeUser;
