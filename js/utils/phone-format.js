/**
 * Phone Number Formatting Utility
 * Handles US phone number formatting and validation
 */

/**
 * Format phone input as user types: (XXX) XXX-XXXX
 * @param {string} value - Raw input value
 * @returns {string} Formatted phone number
 */
export function formatPhoneInput(value) {
  let digits = value.replace(/\D/g, ''); // Remove non-digits
  if (digits.length > 10) digits = digits.slice(0, 10); // Max 10 digits
  
  if (digits.length === 0) {
    return '';
  } else if (digits.length <= 3) {
    return `(${digits}`;
  } else if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  } else {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
}

/**
 * Convert formatted or raw phone number to E.164 format (+1XXXXXXXXXX)
 * @param {string} phoneNumber - Formatted or raw phone number
 * @returns {string} E.164 formatted phone number
 * @throws {Error} If phone number is invalid
 */
export function toE164Format(phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, ''); // Extract only digits
  
  if (digits.length !== 10) {
    throw new Error('Phone number must be exactly 10 digits');
  }
  
  return `+1${digits}`;
}

/**
 * Validate US phone number format
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid 10-digit US number
 */
export function isValidUSPhone(phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.length === 10;
}
