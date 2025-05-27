/**
 * Text cleaning utilities for consistent data formatting
 */
const fs = require('fs');
const path = require('path');

// Path to the product title cleaning rules config file
const PRODUCT_RULES_FILE = path.join(process.cwd(), 'lib', 'product-title-cleaning-rules.json');

/**
 * Loads product title cleaning rules from the config file
 * @returns {Object} The rules object with generalRules and exceptions
 * @throws {Error} If the file does not exist or is invalid
 */
function loadCleaningRules() {
  if (!fs.existsSync(PRODUCT_RULES_FILE)) {
    throw new Error(`Product title cleaning rules file not found: ${PRODUCT_RULES_FILE}`);
  }
  const data = fs.readFileSync(PRODUCT_RULES_FILE, 'utf8');
  const rules = JSON.parse(data);
  
  // Validate the structure
  if (!rules.generalRules || !Array.isArray(rules.generalRules)) {
    throw new Error('Product title cleaning rules file must contain a generalRules array.');
  }
  if (!rules.exceptions || !Array.isArray(rules.exceptions)) {
    throw new Error('Product title cleaning rules file must contain an exceptions array.');
  }
  
  return rules;
}

// Load rules from file (throws if not found or invalid)
const CLEANING_RULES = loadCleaningRules();

/**
 * Cleans up a product name based on the loaded rules and exceptions
 * 
 * @param {string} text - The product name to clean
 * @param {Object[]} [additionalRules=[]] - Custom general rules to apply
 * @param {Object[]} [additionalExceptions=[]] - Custom exceptions to apply
 * @returns {string|null} The cleaned product name, or null if input is empty
 */
function cleanProductName(text, additionalRules = [], additionalExceptions = []) {
  if (!text) return null;
  
  // Start with trimmed title
  let cleaned = text.trim();
  
  // Get all rules and exceptions
  const generalRules = [...CLEANING_RULES.generalRules, ...additionalRules];
  const allExceptions = [...CLEANING_RULES.exceptions, ...additionalExceptions];
  
  // Check if this title matches any exception product names
  const matchingExceptions = allExceptions.filter(exception => 
    exception.productName === cleaned
  );
  
  // Get list of rule IDs to skip
  const skipRuleIds = matchingExceptions.length > 0 
    ? matchingExceptions.reduce((acc, exception) => 
        [...acc, ...(exception.skipRules || [])], 
      [])
    : [];
  
  // Apply each general rule, skipping those in the skipRuleIds list
  for (const rule of generalRules) {
    // Skip this rule if it's in the exception list for this product
    if (skipRuleIds.includes(rule.id)) continue;
    
    // Apply the rule
    if (typeof rule.pattern === 'string') {
      // Replace all occurrences of the string pattern
      cleaned = cleaned.replaceAll(rule.pattern, rule.replacement);
    } else {
      // For RegExp patterns if we decide to support them
      cleaned = cleaned.replace(new RegExp(rule.pattern, 'g'), rule.replacement);
    }
  }
  
  // Final trimming and normalization
  cleaned = cleaned.trim();
  // Normalize multiple spaces to single spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  return cleaned;
}


/**
 * Creates a configurable text cleaner function
 * 
 * @param {Object[]} rules - Array of cleaning rules
 * @param {string|RegExp} rules[].pattern - String or regex to match
 * @param {string} rules[].replacement - Replacement text
 * @returns {Function} A function that cleans text according to the rules
 */
function createTextCleaner(rules) {
  return (text) => {
    if (!text) return null;
    
    let cleaned = text.trim();
    
    for (const { pattern, replacement } of rules) {
      cleaned = cleaned.replace(pattern, replacement);
    }
    
    return cleaned.trim();
  };
}
/**
 * Creates a configurable text cleaner function (legacy function preserved for backward compatibility)
 * 
 * @param {Object[]} rules - Array of cleaning rules
 * @param {string|RegExp} rules[].pattern - String or regex to match
 * @param {string} rules[].replacement - Replacement text
 * @returns {Function} A function that cleans text according to the rules
 */
function createTextCleaner(rules) {
  return (text) => {
    if (!text) return null;
    
    let cleaned = text.trim();
    
    for (const { pattern, replacement } of rules) {
      cleaned = cleaned.replace(pattern, replacement);
    }
    
    return cleaned.trim();
  };
}

/**
 * Explains the title cleaning process for a given title
 * Useful for debugging why a particular title is cleaned the way it is
 * 
 * @param {string} originalTitle - The original title to explain cleaning for
 * @returns {Object} Object with cleaning details including applied and skipped rules
 */
function explainTitleCleaning(originalTitle) {
  if (!originalTitle) return { originalTitle: '', cleanedTitle: '', appliedRules: [], skippedRules: [], matchingExceptions: [] };
  
  const trimmedTitle = originalTitle.trim();
  
  // Check if this title matches any exception product names
  const matchingExceptions = CLEANING_RULES.exceptions.filter(exception => 
    exception.productName === trimmedTitle
  );
  
  // Get list of rule IDs to skip
  const skipRuleIds = matchingExceptions.length > 0 
    ? matchingExceptions.reduce((acc, exception) => 
        [...acc, ...(exception.skipRules || [])], 
      [])
    : [];
  
  // Get applied and skipped rules
  const appliedRules = CLEANING_RULES.generalRules
    .filter(rule => !skipRuleIds.includes(rule.id))
    .map(rule => ({
      id: rule.id,
      pattern: rule.pattern,
      replacement: rule.replacement
    }));
  
  const skippedRules = CLEANING_RULES.generalRules
    .filter(rule => skipRuleIds.includes(rule.id))
    .map(rule => ({
      id: rule.id,
      pattern: rule.pattern,
      replacement: rule.replacement
    }));
  
  return {
    originalTitle: trimmedTitle,
    cleanedTitle: cleanProductName(trimmedTitle),
    appliedRules,
    skippedRules,
    matchingExceptions: matchingExceptions.map(e => e.productName)
  };
}

module.exports = {
  cleanProductName,
  createTextCleaner,
  explainTitleCleaning,
  CLEANING_RULES
};
