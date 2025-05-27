/**
 * Helper utilities for working with submission statuses
 */
import db from './db';
import { STATUS } from './submission-status';

/**
 * Gets all submissions with their status information
 * @returns {Promise<Array>} Array of submission objects with status info
 */
export async function getSubmissionsWithStatus() {
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
    
    // Normalize status fields for consistent filtering
    const submissions = result.rows.map(submission => {
      // If status is null or undefined, set it to fetched as default
      if (!submission.status) {
        submission.status = STATUS.FETCHED;
      }
      return submission;
    });
    
    return submissions;
  } catch (error) {
    console.error('Error fetching submissions with status:', error);
    return [];
  }
}

/**
 * Gets submissions count by status
 * @returns {Promise<Object>} Counts for each status
 */
export async function getSubmissionCountsByStatus() {
  try {
    const result = await db.query(`
      SELECT 
        COALESCE(status, 'fetched') as status,
        COUNT(*) as count
      FROM jotform
      WHERE status != 'ignore'
      GROUP BY COALESCE(status, 'fetched')
    `);
    
    // Convert to object with status keys
    const counts = { total: 0 };
    result.rows.forEach(row => {
      counts[row.status] = parseInt(row.count);
      counts.total += parseInt(row.count);
    });
    
    return counts;
  } catch (error) {
    console.error('Error counting submissions by status:', error);
    return { total: 0 };
  }
}
