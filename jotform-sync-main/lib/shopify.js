/**
 * Shopify GraphQL API client
 * 
 * Provides methods to interact with the Shopify GraphQL API
 */

// Import config for Shopify credentials
const config = require('../config');

// Shopify GraphQL endpoint and access token
const { storeUrl, accessToken, apiVersion } = config.shopify;

// Construct GraphQL URL from config - must include /admin/ in the path
const SHOPIFY_GRAPHQL_URL = `${storeUrl}/admin/api/${apiVersion}/graphql.json`;
const SHOPIFY_ACCESS_TOKEN = accessToken;

/**
 * Execute a GraphQL query against the Shopify API
 * 
 * @param {string} query - GraphQL query
 * @param {Object} variables - Query variables
 * @returns {Promise<Object>} - Query result
 */
async function executeGraphQLQuery(query, variables = {}) {
  try {
    // Prepare to make GraphQL request
    
    const response = await fetch(SHOPIFY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Throw error to be handled by caller
      throw new Error(`Shopify API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      // Throw error to be handled by caller
      throw new Error(`Shopify GraphQL API errors: ${JSON.stringify(result.errors)}`);
    }
    
    return result.data;
  } catch (_error) {
    // Propagate error to caller
    throw error;
  }
}

/**
 * Find a matching Shopify product for a product title
 * Returns the product if a single match is found, null otherwise
 * 
 * @param {string} productTitle - Product title to search for
 * @param {string} [brand] - Optional brand to help with matching
 * @returns {Promise<Object|null>} - Product data or null if not found
 */
async function findMatchingShopifyProduct(productTitle, brand) {
  if (!productTitle) return null;
  
  try {
    // Using product title directly as it's already normalized upstream
    const products = await searchProductsByTitle(productTitle);
    
    if (products.length === 0) {
      return null;
    }
    
    // 1. Look for an exact title match (case insensitive)
    const exactMatch = products.find(p => 
      p.title.toLowerCase() === productTitle.toLowerCase()
    );
    
    if (exactMatch) {
      return exactMatch;
    }
    
    // 2. If we have brand info, try to match by brand + title contains
    if (brand) {
      const brandMatch = products.find(p => {
        const productBrand = p.brand || p.vendor || '';
        // Check that brand is a string and not null/undefined before using toLowerCase
        if (!brand || typeof brand !== 'string') {
          return false;
        }
        return (
          productBrand.toLowerCase() === brand.toLowerCase() &&
          p.title.toLowerCase().includes(productTitle.toLowerCase())
        );
      });
      
      if (brandMatch) {
        return brandMatch;
      }
    }
    
    // 3. Try to find a product where the title is contained within the search term or vice versa
    const titleLower = productTitle.toLowerCase();
    const containedMatch = products.find(p => {
      const pLower = p.title.toLowerCase();
      return pLower.includes(titleLower) || titleLower.includes(pLower);
    });
    
    if (containedMatch) {
      return containedMatch;
    }
    
    // 4. If we only have one product, return it
    if (products.length === 1) {
      return products[0];
    }
    
    // 5. No good match found
    return null;
    
  } catch (_error) {
    return null;
  }
}

/**
 * Save a Shopify product to the jotform_shopify table
 * 
 * @param {string} submissionId - Jotform submission ID
 * @param {Object} product - Product data from Shopify 
 * @param {Object} [dbClient] - Optional database client (for transactions)
 * @returns {Promise<Object>} - Saved product data
 */
async function saveShopifyProductData(submissionId, product, dbClient = null) {
  const client = dbClient || await db.getClient();
  let shouldRelease = !dbClient; // Only release if we created the client
  
  try {
    // Clean product title to avoid repetition/junk data and strange characters
    let cleanTitle = product.title ? product.title.trim() : '';
    
    // Fix for garbled text with repeated patterns like "Snubie World TourMcSnubie World TourS..."
    // Extract meaningful parts from garbled text
    
    // First look for repeating patterns
    const _patterns = [];
    const words = cleanTitle.split(' ');
    
    // Build a frequency map of word sequences
    const freqMap = {};
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = words[i] + ' ' + words[i+1];
      freqMap[phrase] = (freqMap[phrase] || 0) + 1;
    }
    
    // Find most common phrase
    let mostCommonPhrase = '';
    let highestFreq = 0;
    for (const [phrase, freq] of Object.entries(freqMap)) {
      if (freq > highestFreq) {
        highestFreq = freq;
        mostCommonPhrase = phrase;
      }
    }
    
    // If we found a repeating phrase, use it as the base
    let finalTitle = cleanTitle;
    if (highestFreq > 1 && mostCommonPhrase) {
      // Look for the full product name containing this phrase
      const phraseIndex = cleanTitle.indexOf(mostCommonPhrase);
      if (phraseIndex !== -1) {
        // Start scanning from this point to find a balanced product name
        let endPos = phraseIndex + mostCommonPhrase.length;
        let wordCount = mostCommonPhrase.split(' ').length;
        
        // Keep adding words until we have a reasonable product name
        while (endPos < cleanTitle.length && wordCount < 6) {
          const nextSpacePos = cleanTitle.indexOf(' ', endPos + 1);
          if (nextSpacePos === -1) break;
          
          endPos = nextSpacePos;
          wordCount++;
        }
        
        finalTitle = cleanTitle.substring(phraseIndex, endPos).trim();
      }
    }
    
    // Also check for simple duplicates (e.g., "Snubie World TourSnubie World Tour")
    if (finalTitle.length > 0 && finalTitle === cleanTitle) {
      const halfLength = Math.floor(cleanTitle.length / 2);
      const firstHalf = cleanTitle.substring(0, halfLength);
      
      // See if the title repeats itself
      if (halfLength > 5 && cleanTitle.includes(firstHalf, halfLength)) {
        finalTitle = firstHalf.trim();
      }
    }
    
    // Shopify data saving log removed for performance
    
    // Use the cleaned title
    const titleToSave = finalTitle || product.title || '';
    // Use the first value from custom.brands metafield, or '' if not present/invalid
    let brandToSave = '';
    try {
      if (product.metafield && product.metafield.value) {
        const brands = JSON.parse(product.metafield.value);
        if (Array.isArray(brands) && brands.length > 0) {
          brandToSave = brands[0];
        }
      }
    } catch (e) {
      // If parsing fails, leave brandToSave as ''
      // We'll keep this warning as it's an important parsing error
    }
    
    // Insert or update the product data
    const query = `
      INSERT INTO jotform_shopify (
        submission_id, 
        shopify_handle, 
        product_type, 
        product_brand, 
        shopify_title
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (submission_id) 
      DO UPDATE SET 
        shopify_handle = EXCLUDED.shopify_handle,
        product_type = EXCLUDED.product_type,
        product_brand = EXCLUDED.product_brand,
        shopify_title = EXCLUDED.shopify_title
      RETURNING *`;
    
    const params = [
      submissionId,
      product.handle || null,
      product.productType || null,
      brandToSave,
      titleToSave
    ];
    
    const result = await client.query(query, params);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to save Shopify data: No rows returned');
    }
    
    return result.rows[0];
    
  } catch (_error) {
    throw error; // Re-throw to be handled by the caller
  } finally {
    // Only release the client if we created it
    if (shouldRelease && client && typeof client.release === 'function') {
      await client.release();
    }
  }
}

/**
 * Search for products by title
 * @param {string} title - The title to search for
 * @returns {Promise<Array>} - Array of matching products
 */
async function searchProductsByTitle(title) {
  try {
    const query = `
      query searchProducts($query: String!) {
        products(first: 20, query: $query) {
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              metafield(namespace: "custom", key: "brands") {
                value
              }
              images(first: 1) {
                edges {
                  node {
                    src
                  }
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      query: `title:*${title}*`
    };

    const response = await executeGraphQLQuery(query, variables);
    
    if (!response || !response.products || !response.products.edges) {
      return [];
    }
    
    return response.products.edges.map(edge => ({
      ...edge.node,
      // Ensure we have a consistent structure with the other search function
      images: edge.node.images?.edges?.map(img => img.node) || []
    }));
    
  } catch (_error) {
    throw error;
  }
}

/**
 * Get a Shopify product by its handle
 * @param {string} handle - The product handle
 * @returns {Promise<Object|null>} - The product data or null if not found
 */
async function getShopifyProductByHandle(handle) {
  try {
    const query = `
      query getProductByHandle($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          handle
          description
          descriptionHtml
          productType
          vendor
          tags
          metafield(namespace: "custom", key: "brands") {
            value
          }
          priceRangeV2: priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 10) {
            edges {
              node {
                id
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
                compareAtPrice
                availableForSale
                sku
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
          options {
            id
            name
            values
          }
        }
      }
    `;

    const variables = { handle };
    const response = await executeGraphQLQuery(query, variables);
    
    if (!response || !response.productByHandle) {
      return null;
    }
    
    return response.productByHandle;
  } catch (_error) {
    return null;
  }
}

// Export all functions
module.exports = {
  searchProductsByTitle,
  findMatchingShopifyProduct,
  saveShopifyProductData,
  getShopifyProductByHandle
};
