import db from './db';
import { findMatchingShopifyProduct, saveShopifyProductData } from './shopify';

/**
 * Gets the date of the latest submission in the database
 * @returns {Promise<string>} Date string of the latest submission or '1970-01-01'
 */
export async function getLatestSubmissionDate() {
  try {
    const result = await db.query(`
      SELECT MAX(created_at) as latest_date 
      FROM jotform j
      WHERE j.status != 'ignore'
    `);
    
    // If no submissions found or error, return epoch start
    if (!result.rows[0].latest_date) {
      return '1970-01-01';
    }
    
    return result.rows[0].latest_date.toISOString().split('T')[0];
  } catch (error) {
    console.error('Error fetching latest submission date:', error);
    return '1970-01-01'; // Return epoch start if there was an error
  }
}

/**
 * Gets all submissions from the database equal to or after the specified date
 * @param {string} date - Date string in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of submission objects
 */
export async function getSubmissionsAfterDate(date) {
  try {
    const result = await db.query(`
      SELECT 
        j.submission_id,
        j.reviewer,
        j.select_product,
        j.cleaned_product_title,
        j.created_at,
        js.shopify_handle,
        js.product_type,
        js.product_brand,
        js.shopify_title
      FROM jotform j
      LEFT JOIN jotform_shopify js ON j.submission_id = js.submission_id
      WHERE j.status != 'ignore' AND j.created_at >= $1::timestamp
      ORDER BY j.created_at DESC
      LIMIT 100
    `, [date]);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return [];
  }
}

/**
 * Gets all submissions from the database
 * @param {number} limit - Maximum number of submissions to return
 * @returns {Promise<Array>} Array of submission objects
 */
export async function getAllSubmissions(limit = 100) {
  try {
    const result = await db.query(`
      SELECT 
        j.submission_id,
        j.reviewer,
        j.select_product,
        j.cleaned_product_title,
        j.created_at,
        js.shopify_handle,
        js.product_type,
        js.product_brand,
        js.shopify_title
      FROM jotform j
      LEFT JOIN jotform_shopify js ON j.submission_id = js.submission_id
      WHERE j.status != 'ignore'
      ORDER BY j.created_at DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching all submissions:', error);
    return [];
  }
}

/**
 * Gets all submissions from the database (renamed but keeping the function name for backward compatibility)
 * @returns {Promise<Array>} Array of submission objects
 */
export async function getUnprocessedSubmissions() {
  try {
    const result = await db.query(`
      SELECT 
        j.submission_id,
        j.reviewer,
        j.select_product,
        j.cleaned_product_title,
        j.created_at,
        j.status,
        j.status_updated_at,
        js.shopify_handle,
        js.product_type,
        js.product_brand,
        js.shopify_title
      FROM jotform j
      LEFT JOIN jotform_shopify js ON j.submission_id = js.submission_id
      WHERE j.status != 'ignore'
      ORDER BY j.created_at DESC
    `);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return [];
  }
}

/**
 * Lookup Shopify data for a submission and save it to the database
 * @param {Object} submission - Submission object with at least submission_id and select_product
 * @returns {Promise<Object>} - Submission with added Shopify data
 */
export async function lookupAndSaveShopifyData(submission) {
  if (!submission || !submission.submission_id || !submission.select_product) {
    return submission;
  }
  
  try {
    // Skip if already has Shopify data
    if (submission.shopify_handle) {
      return submission;
    }
    
    // Use cleaned title if available, otherwise use original product title
    const titleToUse = submission.cleaned_product_title || submission.select_product;
    
    // Find matching Shopify product
    const productData = await findMatchingShopifyProduct(titleToUse);
    
    if (!productData) {
      return submission;
    }
    
    // Save to database
    const success = await saveShopifyProductData(submission.submission_id, productData, db);
    
    if (success) {
      // Add data to submission object
      return {
        ...submission,
        shopify_handle: productData.handle,
        product_type: productData.productType,
        product_brand: productData.vendor,
        shopify_title: productData.title
      };
    }
    
    return submission;
  } catch (error) {
    console.error(`Error looking up Shopify data for submission ${submission.submission_id}:`, error);
    return submission;
  }
}
