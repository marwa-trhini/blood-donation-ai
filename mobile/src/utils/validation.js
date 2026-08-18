const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();

  return Boolean(normalized) && emailRegex.test(normalized);
}

const LEBANESE_LOCAL_REGEX = /^(03|70|71|76|78|79|81)\d{6}$/;
const LEBANESE_INTL_REGEX = /^\+961(3|70|71|76|78|79|81)\d{6}$/;
const LEBANESE_INTL_NO_PLUS_REGEX = /^961(3|70|71|76|78|79|81)\d{6}$/;

function cleanPhoneInput(phoneNumber) {
  return String(phoneNumber || '')
    .trim()
    .replace(/[\s\-().]/g, '')
    .replace(/^00/, '+');
}

export function normalizeLebanesePhone(phoneNumber) {
  const cleaned = cleanPhoneInput(phoneNumber);

  if (!cleaned) {
    return null;
  }

  if (LEBANESE_LOCAL_REGEX.test(cleaned)) {
    if (cleaned.startsWith('0')) {
      return `+961${cleaned.slice(1)}`;
    }

    return `+961${cleaned}`;
  }

  if (LEBANESE_INTL_REGEX.test(cleaned)) {
    return cleaned;
  }

  if (LEBANESE_INTL_NO_PLUS_REGEX.test(cleaned)) {
    return `+${cleaned}`;
  }

  return null;
}

export function validateRegistrationFields({
  fullName,
  email,
  phoneNumber,
  password,
  confirmPassword,
}) {
  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const normalizedPhone = normalizeLebanesePhone(phoneNumber);

  if (!trimmedName) {
    return { error: 'Full name is required.' };
  }

  if (trimmedName.length < 2) {
    return { error: 'Full name must be at least 2 characters.' };
  }

  if (!trimmedEmail) {
    return { error: 'Email is required.' };
  }

  if (!emailRegex.test(trimmedEmail)) {
    return { error: 'Please enter a valid email address.' };
  }

  if (!phoneNumber.trim()) {
    return { error: 'Phone number is required.' };
  }

  if (!normalizedPhone) {
    return {
      error:
        'Please enter a valid Lebanese mobile number (e.g. 03xxxxxx, 70xxxxxx, or +961...).',
    };
  }

  if (!password) {
    return { error: 'Password is required.' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters long.' };
  }

  if (!/[A-Za-z]/.test(password)) {
    return { error: 'Password must contain at least one letter.' };
  }

  if (!/\d/.test(password)) {
    return { error: 'Password must contain at least one number.' };
  }

  if (!confirmPassword) {
    return { error: 'Please confirm your password.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  return {
    error: null,
    values: {
      fullName: trimmedName,
      email: trimmedEmail,
      phoneNumber: normalizedPhone,
      password,
    },
  };
}

export function validateLoginFields({ email, password }) {
  const trimmedEmail = String(email || '')
    .trim()
    .toLowerCase();

  if (!trimmedEmail) {
    return { error: 'Email is required.' };
  }

  if (!isValidEmailFormat(trimmedEmail)) {
    return { error: 'Please enter a valid email address.' };
  }

  if (!password) {
    return { error: 'Password is required.' };
  }

  return {
    error: null,
    values: {
      email: trimmedEmail,
      password,
    },
  };
}

export function formatDateForInput(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getPostLoginScreen(user) {
  if (user?.primaryRole === 'donor') {
    return 'DonorProfile';
  }

  if (user?.primaryRole === 'recipient') {
    return 'RecipientProfile';
  }

  return 'RoleSelection';
}

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

function parseDateInput(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }

    return null;
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function validateDonorProfileFields({
  bloodType,
  dateOfBirth,
  gender,
  city,
  country,
  addressLine,
  isAvailable,
  bio,
}) {
  if (!bloodType || !BLOOD_TYPES.includes(bloodType)) {
    return { error: 'Please select a blood type.' };
  }

  const parsedDate = parseDateInput(dateOfBirth);

  if (!parsedDate) {
    return { error: 'Please enter a valid date of birth (YYYY-MM-DD).' };
  }

  if (parsedDate.getTime() > Date.now()) {
    return { error: 'Date of birth cannot be in the future.' };
  }

  const trimmedCity = String(city || '').trim();
  const trimmedCountry = String(country || '').trim();

  if (!trimmedCity) {
    return { error: 'City is required.' };
  }

  if (!trimmedCountry) {
    return { error: 'Country is required.' };
  }

  if (typeof isAvailable !== 'boolean') {
    return { error: 'Please select your availability.' };
  }

  if (gender && !GENDER_OPTIONS.some((option) => option.value === gender)) {
    return { error: 'Please select a valid gender option.' };
  }

  const trimmedBio = String(bio || '').trim();

  if (trimmedBio.length > 200) {
    return { error: 'Bio must be 200 characters or less.' };
  }

  return {
    error: null,
    values: {
      bloodType,
      dateOfBirth: parsedDate.toISOString(),
      gender: gender || null,
      location: {
        city: trimmedCity,
        country: trimmedCountry,
        addressLine: String(addressLine || '').trim() || undefined,
      },
      isAvailable,
      bio: trimmedBio || undefined,
    },
  };
}

export const URGENCY_OPTIONS = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
];

export function validateRecipientProfileFields({
  bloodTypeNeeded,
  dateOfBirth,
  gender,
  city,
  country,
  addressLine,
  hospitalName,
  hospitalCity,
  hospitalAddressLine,
  urgency,
  requiredDate,
  unitsNeeded,
  medicalNotes,
  emergencyContactName,
  emergencyContactPhone,
}) {
  if (!bloodTypeNeeded || !BLOOD_TYPES.includes(bloodTypeNeeded)) {
    return { error: 'Please select the blood type needed.' };
  }

  const parsedDateOfBirth = parseDateInput(dateOfBirth);

  if (!parsedDateOfBirth) {
    return { error: 'Please enter a valid date of birth (YYYY-MM-DD).' };
  }

  if (parsedDateOfBirth.getTime() > Date.now()) {
    return { error: 'Date of birth cannot be in the future.' };
  }

  if (gender && !GENDER_OPTIONS.some((option) => option.value === gender)) {
    return { error: 'Please select a valid gender option.' };
  }

  const trimmedCity = String(city || '').trim();
  const trimmedCountry = String(country || '').trim();

  if (!trimmedCity) {
    return { error: 'City is required.' };
  }

  if (!trimmedCountry) {
    return { error: 'Country is required.' };
  }

  const trimmedHospitalName = String(hospitalName || '').trim();
  const trimmedHospitalCity = String(hospitalCity || '').trim();

  if (!trimmedHospitalName) {
    return { error: 'Hospital name is required.' };
  }

  if (!trimmedHospitalCity) {
    return { error: 'Hospital city is required.' };
  }

  if (!urgency || !URGENCY_OPTIONS.some((option) => option.value === urgency)) {
    return { error: 'Please select an urgency level.' };
  }

  let parsedRequiredDate = null;

  if (String(requiredDate || '').trim()) {
    parsedRequiredDate = parseDateInput(requiredDate);

    if (!parsedRequiredDate) {
      return { error: 'Please enter a valid required date (YYYY-MM-DD).' };
    }
  }

  const parsedUnits = Number(unitsNeeded);

  if (!Number.isInteger(parsedUnits) || parsedUnits < 1) {
    return { error: 'Units needed must be at least 1.' };
  }

  const trimmedMedicalNotes = String(medicalNotes || '').trim();

  if (trimmedMedicalNotes.length > 500) {
    return { error: 'Medical notes must be 500 characters or less.' };
  }

  const trimmedEmergencyPhone = String(emergencyContactPhone || '').trim();

  if (trimmedEmergencyPhone) {
    const normalizedPhone = normalizeLebanesePhone(trimmedEmergencyPhone);

    if (!normalizedPhone) {
      return {
        error:
          'Please provide a valid Lebanese emergency contact number (e.g. 03xxxxxx or +961...).',
      };
    }
  }

  const trimmedEmergencyName = String(emergencyContactName || '').trim();

  const emergencyContact =
    trimmedEmergencyName || trimmedEmergencyPhone
      ? {
          name: trimmedEmergencyName || undefined,
          phoneNumber: trimmedEmergencyPhone
            ? normalizeLebanesePhone(trimmedEmergencyPhone)
            : undefined,
        }
      : undefined;

  return {
    error: null,
    values: {
      bloodTypeNeeded,
      dateOfBirth: parsedDateOfBirth.toISOString(),
      gender: gender || null,
      location: {
        city: trimmedCity,
        country: trimmedCountry,
        addressLine: String(addressLine || '').trim() || undefined,
      },
      hospital: {
        name: trimmedHospitalName,
        city: trimmedHospitalCity,
        addressLine: String(hospitalAddressLine || '').trim() || undefined,
      },
      urgency,
      requiredDate: parsedRequiredDate ? parsedRequiredDate.toISOString() : undefined,
      unitsNeeded: parsedUnits,
      medicalNotes: trimmedMedicalNotes || undefined,
      emergencyContact,
    },
  };
}

export function validateBloodRequestFields({
  bloodTypeNeeded,
  unitsNeeded,
  urgency,
  requiredDate,
  hospitalName,
  hospitalCity,
  hospitalAddressLine,
  city,
  country,
  addressLine,
  medicalNotes,
  title,
}) {
  if (!bloodTypeNeeded || !BLOOD_TYPES.includes(bloodTypeNeeded)) {
    return { error: 'Please select the blood type needed.' };
  }

  const parsedUnits = Number(unitsNeeded);

  if (!Number.isInteger(parsedUnits) || parsedUnits < 1) {
    return { error: 'Units needed must be at least 1.' };
  }

  if (!urgency || !URGENCY_OPTIONS.some((option) => option.value === urgency)) {
    return { error: 'Please select an urgency level.' };
  }

  let parsedRequiredDate = null;

  if (String(requiredDate || '').trim()) {
    parsedRequiredDate = parseDateInput(requiredDate);

    if (!parsedRequiredDate) {
      return { error: 'Please enter a valid required date (YYYY-MM-DD).' };
    }
  }

  const trimmedHospitalName = String(hospitalName || '').trim();
  const trimmedHospitalCity = String(hospitalCity || '').trim();

  if (!trimmedHospitalName) {
    return { error: 'Hospital name is required.' };
  }

  if (!trimmedHospitalCity) {
    return { error: 'Hospital city is required.' };
  }

  const trimmedCity = String(city || '').trim();
  const trimmedCountry = String(country || '').trim();

  if (!trimmedCity) {
    return { error: 'City is required.' };
  }

  if (!trimmedCountry) {
    return { error: 'Country is required.' };
  }

  const trimmedMedicalNotes = String(medicalNotes || '').trim();

  if (trimmedMedicalNotes.length > 500) {
    return { error: 'Medical notes must be 500 characters or less.' };
  }

  const trimmedTitle = String(title || '').trim();

  return {
    error: null,
    values: {
      bloodTypeNeeded,
      unitsNeeded: parsedUnits,
      urgency,
      requiredDate: parsedRequiredDate ? parsedRequiredDate.toISOString() : undefined,
      hospital: {
        name: trimmedHospitalName,
        city: trimmedHospitalCity,
        addressLine: String(hospitalAddressLine || '').trim() || undefined,
      },
      location: {
        city: trimmedCity,
        country: trimmedCountry,
        addressLine: String(addressLine || '').trim() || undefined,
      },
      medicalNotes: trimmedMedicalNotes || undefined,
      title: trimmedTitle || undefined,
    },
  };
}
