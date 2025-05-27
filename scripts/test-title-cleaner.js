/**
 * Test script for the new product title cleaner
 * 
 * This script helps validate the new rule-based cleaning system with exceptions
 */

const { cleanProductName, explainTitleCleaning, CLEANING_RULES } = require('../lib/product-title-cleaner');

// Example titles to test
const testCases = [
  "Poschl | Ozona President", // Should be "Poschl - Ozona President" (not add double Poschl)
  "Bernard Tiger Snuff",      // Should keep "Snuff" in the name
  "Simply Snuff",             // Should keep "Snuff" in the name
  "Ozona Snuffy",             // Should not add "Poschl" prefix
  "Red Bull Snuff",           // Should become "Red Bull" (remove Snuff)
  "McChrystal's Original",    // Should become "McChrystals Original"
  "Samuel Gawiths Kendal Brown", // Should become "Samuel Gawith Kendal Brown"
  "Pöschl Löwen Prise"        // Should become "Poschl Löwen Prise"
];

console.log("Testing new product title cleaner with rules and exceptions\n");
console.log(`Total rules: ${CLEANING_RULES.generalRules.length}`);
console.log(`Total exceptions: ${CLEANING_RULES.exceptions.length}\n`);

// Test basic cleaning
console.log("Basic Cleaning Tests:");
console.log("=====================");
testCases.forEach(title => {
  const cleaned = cleanProductName(title);
  console.log(`"${title}" -> "${cleaned}"`);
});

// Test detailed explanation for a specific case
console.log("\nDetailed Explanation for 'Poschl | Ozona President':");
console.log("===================================================");
const explanation = explainTitleCleaning("Poschl | Ozona President");

console.log(`Original: "${explanation.originalTitle}"`);
console.log(`Cleaned: "${explanation.cleanedTitle}"`);
console.log(`Matching exceptions: ${explanation.matchingExceptions.length > 0 ? explanation.matchingExceptions.join(', ') : 'None'}`);

console.log("\nApplied rules:");
explanation.appliedRules.forEach(rule => {
  console.log(`- ${rule.id}: "${rule.pattern}" -> "${rule.replacement}"`);
});

console.log("\nSkipped rules:");
explanation.skippedRules.forEach(rule => {
  console.log(`- ${rule.id}: "${rule.pattern}" -> "${rule.replacement}"`);
});

// Compare with the previous cleaning method (if available)
try {
  // This is just to show the difference - in production we'd use the new method only
  const oldMethod = require('../lib/product-title-cleaner-old');
  console.log("\nComparison with previous method (if available):");
  console.log("=============================================");
  
  testCases.forEach(title => {
    const newCleaned = cleanProductName(title);
    const oldCleaned = oldMethod.cleanProductName(title);
    console.log(`"${title}"`);
    console.log(`  New: "${newCleaned}"`);
    console.log(`  Old: "${oldCleaned}"`);
    console.log(`  ${newCleaned === oldCleaned ? '✅ Same' : '❌ Different'}`);
    console.log();
  });
} catch (error) {
  // Old method not available, skip comparison
}
