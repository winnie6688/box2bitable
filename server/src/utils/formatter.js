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

module.exports = {
  normalizeSize
};
