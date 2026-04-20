/**
 * Format and normalize shoe size according to business rules.
 * @param {string|number} size - Original size from AI or user.
 * @returns {string} - Normalized European size.
 */
const normalizeSize = (size) => {
  if (!size) return '';
  
  // Convert to number for calculation
  const numSize = parseFloat(size);
  if (isNaN(numSize)) return size.toString();

  // Rule 1: 225-285 (Millimeter scale) -> Convert to EUR
  // Formula: EUR = (mm - 50) / 5
  if (numSize >= 225 && numSize <= 285) {
    const eurSize = (numSize - 50) / 5;
    return eurSize.toString();
  }

  // Rule 2: 34-48 (EUR scale) -> Keep as is
  if (numSize >= 34 && numSize <= 48) {
    return numSize.toString();
  }

  // Outside defined ranges, return as string
  return numSize.toString();
};

/**
 * Check if the size is within the normal range (34-48).
 * @param {string|number} size - Normalized EUR size.
 * @returns {Object} - { isValid: boolean, isAnomaly: boolean }
 */
const validateSize = (size) => {
  const numSize = parseFloat(size);
  if (isNaN(numSize)) return { isValid: false, isAnomaly: true };

  // Rule: 34-48 is legal range
  if (numSize >= 34 && numSize <= 48) {
    return { isValid: true, isAnomaly: false };
  }

  // Other sizes are anomalies
  return { isValid: false, isAnomaly: true, message: '超出常规尺码范围(34-48)' };
};

const generateSkuCode = (itemNo, color, size) => {
  const cleanNo = String(itemNo || '未知').trim().toUpperCase();
  const cleanColor = String(color || '默认').trim();
  const cleanSize = String(size || '均码').trim().toUpperCase();
  return `${cleanNo}-${cleanColor}-${cleanSize}`;
};

module.exports = {
  normalizeSize,
  validateSize,
  generateSkuCode
};
