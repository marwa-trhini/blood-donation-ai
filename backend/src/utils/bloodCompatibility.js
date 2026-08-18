const ALLOWED_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const RECIPIENT_TO_DONOR_COMPATIBILITY = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'],
};

function getCompatibleDonorBloodTypes(recipientBloodType) {
  const normalized = String(recipientBloodType || '').trim();

  if (!RECIPIENT_TO_DONOR_COMPATIBILITY[normalized]) {
    return [];
  }

  return [...RECIPIENT_TO_DONOR_COMPATIBILITY[normalized]];
}

function isValidBloodType(bloodType) {
  return ALLOWED_BLOOD_TYPES.includes(String(bloodType || '').trim());
}

function isDonorCompatibleWithRecipientBloodType(
  donorBloodType,
  recipientBloodTypeNeeded
) {
  const normalizedDonor = String(donorBloodType || '').trim();
  const compatibleDonors = getCompatibleDonorBloodTypes(recipientBloodTypeNeeded);

  return compatibleDonors.includes(normalizedDonor);
}

module.exports = {
  ALLOWED_BLOOD_TYPES,
  getCompatibleDonorBloodTypes,
  isValidBloodType,
  isDonorCompatibleWithRecipientBloodType,
};
