/**
 * Jotform API client
 * 
 * Provides methods to interact with the Jotform API using the official npm package
 */

import config from '@/config';
import * as jotform from '@wojtekmaj/jotform'; // Only getFormSubmissions is available for fetching submissions
import db from './db';
import { cleanProductName } from '@/lib/product-title-cleaner';
import { STATUS } from './submission-status';

// Initialize Jotform client
jotform.options({
  apiKey: config.jotform.apiKey,
  url: config.jotform.apiUrl
});

// Type definitions for better code completion
/**
 * @typedef {Object} JotformSubmission
 * @property {string} id - Submission ID
 * @property {string} form_id - Form ID
 * @property {string} created_at - ISO date string
 * @property {string} status - Submission status
 * @property {Object.<string, any>} answers - Submission answers
 */

/**
 * Fetches submissions from Jotform API with pagination and filtering
 * @param {Object} options - Fetch options
 * @param {number} [options.limit=100] - Max number of submissions to fetch per page
 * @param {string} [options.filter] - Filter string (e.g., "created_at:gt:2023-01-01")
 * @param {string} [options.orderby='created_at'] - Field to order by
 * @param {'ASC'|'DESC'} [options.direction='DESC'] - Sort direction
 * @param {string} [options.formId] - Form ID (defaults to JOTFORM_FORM_ID from config)
 * @returns {Promise<JotformSubmission[]>} Array of submission objects
 */
async function fetchSubmissions({
  limit = 100,
  filter,
  orderby = 'created_at',
  direction = 'DESC',
  formId = config.jotform.formId
} = {}) {
  try {
    const options = {
      limit: Math.min(1000, limit), // Jotform max limit is 1000
      offset: 0,
      orderby,
      direction
    };

    // Jotform SDK expects filter as an object (not string)
    if (filter && typeof filter === 'object') {
      options.filter = filter;
    }

    // Fetch logging removed for performance

    // Use the correct SDK method and expect an array
    const submissions = await jotform.getFormSubmissions(
      formId,
      {
        limit: options.limit,
        offset: options.offset,
        filter: options.filter,
        orderby: options.orderby,
        direction: options.direction
      }
    );

    if (!Array.isArray(submissions)) {
      throw new Error('Invalid API response format: expected an array of submissions');
    }

    return submissions;
  } catch (error) {
    console.error('Error in fetchSubmissions:', {
      message: error.message,
      status: error.status,
      response: error.response?.data,
      stack: error.stack
    });
    throw new Error(`Failed to fetch submissions: ${error.message}`);
  }
}

/**
 * Format a submission from Jotform API to match our database schema
 * @param {JotformSubmission} submission - Raw submission from Jotform API
 * @returns {Object|null} Formatted submission or null if invalid
 */
function formatSubmission(submission) {
  if (!submission?.id) {
    console.warn('Invalid submission: missing ID', { submissionFragment: JSON.stringify(submission).substring(0, 100) });
    return { invalid: true, reason: 'missing_id', originalSubmission: submission };
  }

  try {
    // Safely parse the created_at timestamp
    let createdAt;
    try {
      // The API format should be ISO 8601 or similar
      createdAt = submission.created_at ? new Date(submission.created_at) : new Date();
      
      // Validate the date object
      if (isNaN(createdAt.getTime())) {
        console.warn(`Invalid created_at (${submission.created_at}) for submission ${submission.id}, using current date`);
        createdAt = new Date();
      }
    } catch (e) {
      console.warn(`Error parsing date for submission ${submission.id}:`, e);
      createdAt = new Date();
    }

    // Build answers as { [id]: answerObject }
    const answers = {};
    if (submission.answers) {
      Object.entries(submission.answers).forEach(([id, answer]) => {
        if (answer) {
          answers[id] = answer;
        }
      });
    }

    // Map to database schema based on the provided mapping
    // Import cleaner at the top
    // const { cleanProductName } = require('./product-title-cleaner');

    // Store the original title without cleaning it
    // This preserves the raw data for the dedicated cleaning step
    const originalTitle = answers['10']?.answer || '';
    
    const formatted = {
      submission_id: submission.id,
      reviewer: answers['4']?.answer || '',
      select_product: originalTitle,
      snuff_type: answers['18']?.answer || '',
      tobacco: answers['20']?.answer || '',
      moisture: answers['26']?.answer || '',
      grind: answers['27']?.answer || '',
      nicotine: answers['28']?.answer || '',
      ease_of_use: answers['29']?.answer || '',
      review: answers['35']?.answer || '',
      star_rating: parseInt(answers['36']?.answer, 10) || 0,
      cure: answers['38']?.answer || '',
      tasting_notes: answers['40']?.answer || '',
      fermented: (answers['41']?.answer || '').toLowerCase() === 'yes',
      oral_tobacco: (answers['42']?.answer || '').toLowerCase() === 'yes',
      artisan: (answers['43']?.answer || '').toLowerCase() === 'yes',
      rating_boost: parseInt(answers['46']?.answer, 10) || 0,
      created_at: submission.created_at || new Date().toISOString(),
      raw_json: JSON.stringify(submission)
    };

    return formatted;
  } catch (error) {
    console.error(`Error formatting submission ${submission.id}:`, error);
    return { 
      invalid: true, 
      reason: 'formatting_error', 
      error: error.message,
      submissionId: submission.id
    };
  }
}

/**
 * Sync submissions from Jotform to the database
 * @param {Object} options - Sync options
 * @param {number} [options.limit=100] - Max number of submissions to sync
 * @param {Date|string} [options.since] - Only sync submissions after this date
 * @returns {Promise<{total: number, new: number, updated: number, errors: number}>} Sync results
 */
async function syncSubmissions({ limit = 100, since } = {}) {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Get the latest submission date in the database for comparison
    const lastDateResult = await client.query('SELECT MAX(created_at) as last_date FROM jotform');
    const lastDate = lastDateResult.rows[0].last_date || '2023-01-01 00:00:00';
    // Last submission date log removed for performance
    
    // Build filter for new submissions
    let filter;
    if (since) {
      const sinceDate = typeof since === 'string' ? new Date(since) : since;
      filter = `created_at:gt:${sinceDate.toISOString()}`;
    }

    // Fetch submissions from Jotform
    const submissions = await fetchSubmissions({
      limit,
      filter,
      orderby: 'created_at',
      direction: 'ASC'
    });

    if (submissions.length === 0) {
      return { total: 0, new: 0, updated: 0, errors: 0 };
    }

    // Format submissions for database
    const formattedSubmissions = submissions
      .map(formatSubmission)
      .filter(Boolean); // Remove any null/undefined

    if (formattedSubmissions.length === 0) {
      console.warn('No valid submissions to process');
      return { total: 0, new: 0, updated: 0, errors: 0 };
    }

    // Check which submissions already exist
    const submissionIds = formattedSubmissions.map(s => s.submission_id);
    const existingIds = await getExistingSubmissionIds(submissionIds);
    
    // Existing submission log removed for performance
    
    // Filter out submissions that already exist
    const newSubmissions = formattedSubmissions.filter(s => !existingIds.includes(s.submission_id));
    
    if (newSubmissions.length === 0) {
      // No new submissions log removed for performance
      await client.query('COMMIT');
      return { 
        total: formattedSubmissions.length, 
        new: 0, 
        updated: 0, 
        errors: 0 
      };
    }
    
    // Insertion log removed for performance
    
    // Insert new submissions
    const insertResult = await insertSubmissions(newSubmissions);
    const insertedCount = insertResult?.rowCount || 0;
    
    // Success log removed for performance
    
    // Commit transaction
    await client.query('COMMIT');
    
    return {
      total: formattedSubmissions.length,
      new: insertedCount,
      updated: 0,
      errors: formattedSubmissions.length - insertedCount - (formattedSubmissions.length - newSubmissions.length)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in syncSubmissions:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get existing submission IDs from the database
 * @param {string[]} submissionIds - Array of submission IDs to check
 * @returns {Promise<string[]>} Array of existing submission IDs
 */
async function getExistingSubmissionIds(submissionIds) {
  if (submissionIds.length === 0) return [];
  
  const client = await db.getClient();
  try {
    // Split into chunks to avoid SQL parameter limits
    const chunkSize = 1000;
    const chunks = [];
    for (let i = 0; i < submissionIds.length; i += chunkSize) {
      chunks.push(submissionIds.slice(i, i + chunkSize));
    }

    const existingIds = [];
    
    for (const chunk of chunks) {
      const placeholders = chunk.map((_, i) => `$${i + 1}`).join(',');
      const result = await client.query(
        `SELECT submission_id FROM jotform WHERE submission_id IN (${placeholders})`,
        chunk
      );
      existingIds.push(...result.rows.map(row => row.submission_id));
    }
    
    return existingIds;
  } catch (error) {
    console.error('Error checking existing submissions:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Insert submissions into the database
 * @param {Array<Object>} submissions - Array of formatted submission objects
 * @returns {Promise<Object>} Result object with count of inserted rows
 */
async function insertSubmissions(submissions) {
  if (!submissions.length) return { rowCount: 0 };
  
  // Filter out any submissions that might still have the invalid flag
  submissions = submissions.filter(submission => !submission.invalid);
  
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Build the query
    const columns = [
      'submission_id', 
      'reviewer',
      'select_product',
      'snuff_type',
      'tobacco',
      'moisture',
      'grind',
      'nicotine',
      'ease_of_use',
      'review',
      'star_rating',
      'cure',
      'tasting_notes',
      'fermented',
      'oral_tobacco',
      'artisan',
      'rating_boost',
      'created_at',
      'raw_json',
      'status'
    ];
    
    // Build the values array and parameter placeholders
    const values = [];
    const valueSets = [];
    let paramIndex = 1;
    
    for (const submission of submissions) {
      const submissionValues = [
        submission.submission_id,
        submission.reviewer,
        submission.select_product,
        submission.snuff_type,
        submission.tobacco,
        submission.moisture,
        submission.grind,
        submission.nicotine,
        submission.ease_of_use,
        submission.review,
        submission.star_rating,
        submission.cure,
        submission.tasting_notes,
        submission.fermented,
        submission.oral_tobacco,
        submission.artisan,
        submission.rating_boost,
        submission.created_at,
        submission.raw_json,
        submission.status || STATUS.FETCHED
      ];
      
      const placeholders = [];
      for (let i = 0; i < submissionValues.length; i++) {
        placeholders.push(`$${paramIndex++}`);
      }
      
      valueSets.push(`(${placeholders.join(', ')})`);
      values.push(...submissionValues);
    }
    
    const query = `
      INSERT INTO jotform (${columns.join(', ')})
      VALUES ${valueSets.join(', ')}
      ON CONFLICT (submission_id) DO NOTHING
      RETURNING submission_id
    `;
    
    // Execute the query
    const result = await client.query(query, values);
    
    // Commit the transaction
    await client.query('COMMIT');
    
    return result;
    
  } catch (error) {
    // Rollback the transaction on error
    await client.query('ROLLBACK');
    console.error('Error inserting submissions:', error);
    throw error;
    
  } finally {
    client.release();
  }
}

// Export all functions as a single module
export {
  fetchSubmissions,
  formatSubmission, getExistingSubmissionIds,
  insertSubmissions, syncSubmissions
};

