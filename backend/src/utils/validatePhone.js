const LEBANESE_LOCAL_REGEX = /^(03|70|71|76|78|79|81)\d{6}$/;
const LEBANESE_INTL_REGEX = /^\+961(3|70|71|76|78|79|81)\d{6}$/;
const LEBANESE_INTL_NO_PLUS_REGEX = /^961(3|70|71|76|78|79|81)\d{6}$/;

function cleanPhoneInput(phoneNumber) {
  return String(phoneNumber || '')
    .trim()
    .replace(/[\s\-().]/g, '')
    .replace(/^00/, '+');
}

function normalizeLebanesePhone(phoneNumber) {
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

function isValidLebanesePhone(phoneNumber) {
  return Boolean(normalizeLebanesePhone(phoneNumber));
}

module.exports = {
  normalizeLebanesePhone,
  isValidLebanesePhone,
};
