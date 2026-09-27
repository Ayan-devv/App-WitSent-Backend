/**
 * Utility to sanitize, validate, and normalize phone numbers for WhatsApp
 */
function sanitizePhoneNumber(phone) {
  if (!phone) return null;
  
  // Convert to string and remove all non-digit characters
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  
  // Strip leading 00 (international dialing prefix e.g. 0092... -> 92...)
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  
  // Handle Pakistani 11-digit local format (03xx xxxxxxx -> 923xx xxxxxxx)
  if (cleaned.startsWith('03') && cleaned.length === 11) {
    cleaned = '92' + cleaned.substring(1);
  }
  
  // Handle any other 11-digit local number starting with 0
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = '92' + cleaned.substring(1);
  }

  // Valid WhatsApp numbers must be between 8 and 15 digits
  if (cleaned.length < 8 || cleaned.length > 15) {
    return null;
  }
  
  return cleaned;
}

module.exports = { sanitizePhoneNumber };
