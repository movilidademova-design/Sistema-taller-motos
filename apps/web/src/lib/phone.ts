/**
 * Normalizes a stored phone number into the digits-only format wa.me expects.
 * A bare 10-digit Colombian mobile number (e.g. "3105551234") is missing its
 * country code — without it, WhatsApp misreads the leading digits as an
 * invalid country code and reports the number as nonexistent. Numbers that
 * already carry a country code (any other digit count, or one already
 * starting with "57") are passed through unchanged.
 */
export function toWhatsappPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}
