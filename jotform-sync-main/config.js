require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
  // Jotform
  'JOTFORM_API_KEY',
  'JOTFORM_API_URL',
  'JOTFORM_FORM_ID',
  // Shopify
  'SHOPIFY_STORE_URL',
  'SHOPIFY_ACCESS_TOKEN',
  'SHOPIFY_API_VERSION'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Export configuration
module.exports = {
  // Jotform API Configuration
  jotform: {
    apiKey: process.env.JOTFORM_API_KEY,
    apiUrl: process.env.JOTFORM_API_URL,
    formId: process.env.JOTFORM_FORM_ID,
  },
  
  // Shopify Configuration
  shopify: {
    storeUrl: process.env.SHOPIFY_STORE_URL,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    apiVersion: process.env.SHOPIFY_API_VERSION,
    // Optional Shopify variables
    ...(process.env.SHOPIFY_API_KEY && { apiKey: process.env.SHOPIFY_API_KEY }),
    ...(process.env.SHOPIFY_API_SECRET_KEY && { apiSecretKey: process.env.SHOPIFY_API_SECRET_KEY })
  },
  
  // Database Configuration (required for submission sync)
  database: {
    // Use DATABASE_URL_DEV if available, otherwise fall back to DATABASE_URL
    url: process.env.DATABASE_URL_DEV || process.env.DATABASE_URL,
    // For compatibility with Neon serverless
    connectionString: process.env.DATABASE_URL_DEV || process.env.DATABASE_URL,
    branchId: process.env.NEON_BRANCH_ID || null, // Branch ID for NeonDB connections
    projectId: process.env.NEON_PROJECT_ID || null // Project ID for NeonDB API calls
  }
};
