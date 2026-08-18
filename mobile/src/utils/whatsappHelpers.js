import { Linking } from 'react-native';

export function normalizePhoneForWhatsApp(phoneNumber) {
  const cleaned = String(phoneNumber || '')
    .trim()
    .replace(/[\s\-().]/g, '')
    .replace(/^\+/, '')
    .replace(/^00/, '');

  if (!/^\d{8,15}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

export function buildDonorWhatsAppMessage(donorName, bloodTypeNeeded) {
  const name = String(donorName || '').trim() || 'there';
  const bloodType = String(bloodTypeNeeded || '').trim();
  const requestLabel = bloodType ? ` my ${bloodType} blood donation request` : ' my blood donation request';

  return `Hello ${name}, I'm contacting you through BloodConnect regarding${requestLabel}. Thank you for being willing to help save a life.`;
}

export function buildWhatsAppUrl(phoneNumber, message) {
  const normalizedPhone = normalizePhoneForWhatsApp(phoneNumber);

  if (!normalizedPhone) {
    return null;
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export async function openWhatsAppContact(phoneNumber, message) {
  const normalizedPhone = normalizePhoneForWhatsApp(phoneNumber);

  if (!normalizedPhone) {
    return { ok: false, error: 'Donor phone number is unavailable.' };
  }

  const url = buildWhatsAppUrl(normalizedPhone, message);

  if (!url) {
    return { ok: false, error: 'Donor phone number is unavailable.' };
  }

  try {
    const canOpenWhatsApp = await Linking.canOpenURL('whatsapp://send');

    if (!canOpenWhatsApp) {
      return { ok: false, error: 'WhatsApp is not installed on this device.' };
    }

    await Linking.openURL(url);
    return { ok: true };
  } catch {
    return { ok: false, error: 'WhatsApp is not installed on this device.' };
  }
}
