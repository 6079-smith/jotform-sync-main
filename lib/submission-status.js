/**
 * Submission Status Management
 * 
 * Utilities for managing the status of submissions throughout the transformation pipeline.
 * Implements validation for state transitions to ensure proper workflow.
 */

// Status enum values
const STATUS = {
  FETCHED: 'fetched',
  TITLE_CLEANED: 'title_cleaned',
  SHOPIFY_MAPPED: 'shopify_mapped',
  SPECIFICATION_GENERATED: 'specification_generated',
  ERROR: 'error'
};

/**
 * Valid state transitions
 * Each key is a target state, and its value is an array of valid source states
 */
const VALID_TRANSITIONS = {
  [STATUS.FETCHED]: [null], // Can only move to fetched from no previous state
  [STATUS.TITLE_CLEANED]: [STATUS.FETCHED], // Can only clean titles for fetched submissions
  [STATUS.SHOPIFY_MAPPED]: [STATUS.TITLE_CLEANED], // Can only map to Shopify after cleaning titles
  [STATUS.SPECIFICATION_GENERATED]: [STATUS.SHOPIFY_MAPPED], // Can only generate specs after Shopify mapping
  [STATUS.ERROR]: [STATUS.FETCHED, STATUS.TITLE_CLEANED, STATUS.SHOPIFY_MAPPED, STATUS.SPECIFICATION_GENERATED] // Can move to error from any state
};

/**
 * Validates if a state transition is allowed
 * 
 * @param {Object} client - Database client
 * @param {string} submissionId - The submission ID to check
 * @param {string} newStatus - The target status
 * @returns {Promise<{valid: boolean, errorMessage: string|null, currentStatus: string|null}>} - Validation result
 */
async function validateStateTransition(client, submissionId, newStatus) {
  try {
    // Get the current status of the submission
    const result = await client.query(
      'SELECT status FROM jotform WHERE submission_id = $1',
      [submissionId]
    );
    
    // If submission doesn't exist, return error
    if (result.rows.length === 0) {
      return {
        valid: false,
        errorMessage: `Submission ${submissionId} not found`,
        currentStatus: null
      };
    }
    
    const currentStatus = result.rows[0].status;
    
    // If moving to error state, always allow it
    if (newStatus === STATUS.ERROR) {
      return { valid: true, errorMessage: null, currentStatus };
    }
    
    // Check if the transition is valid based on our rules
    const validSourceStates = VALID_TRANSITIONS[newStatus] || [];
    const isValidTransition = validSourceStates.includes(currentStatus);
    
    return {
      valid: isValidTransition,
      errorMessage: isValidTransition ? null : 
        `Invalid state transition: ${currentStatus} → ${newStatus}. ` + 
        `Submission must be in one of these states: ${validSourceStates.join(', ')}`,
      currentStatus
    };
  } catch (error) {
    // We'll keep error logs for debugging purposes
    return {
      valid: false,
      errorMessage: `Error validating state transition: ${error.message}`,
      currentStatus: null
    };
  }
}

/**
 * Update submission status
 * 
 * @param {Object} client - Database client
 * @param {string} submissionId - The submission ID to update
 * @param {string} status - The new status
 * @param {string} [errorMessage] - Optional error message if status is ERROR
 * @param {boolean} [skipValidation=false] - Whether to skip state transition validation
 * @returns {Promise<{success: boolean, submission: Object|null, errorMessage: string|null}>} - The update result
 */
async function updateSubmissionStatus(client, submissionId, status, errorMessage = null, skipValidation = false) {
  try {
    // Validate state transition unless we're skipping validation
    if (!skipValidation && status !== STATUS.ERROR) {
      const { valid, errorMessage: validationError } = await validateStateTransition(client, submissionId, status);
      
      if (!valid) {
        // Warning about invalid state transition removed for performance
        return {
          success: false,
          submission: null,
          errorMessage: validationError
        };
      }
    }
    
    // Build the query
    let query = `
      UPDATE jotform 
      SET 
        status = $1,
        status_updated_at = CURRENT_TIMESTAMP
    `;
    
    // If error message is provided and status is ERROR, add it to the log
    const params = [status];
    
    if (errorMessage && status === STATUS.ERROR) {
      query += `, error_message = $3`;
      params.push(errorMessage);
    }
    
    query += ` WHERE submission_id = $${params.length + 1} RETURNING *`;
    params.push(submissionId);
    
    // Execute the update
    const result = await client.query(query, params);
    
    if (result.rows.length === 0) {
      return {
        success: false,
        submission: null,
        errorMessage: `Submission ${submissionId} not found`
      };
    }
    
    return {
      success: true,
      submission: result.rows[0],
      errorMessage: null
    };
  } catch (error) {
    console.error(`Error updating status for submission ${submissionId}:`, error);
    return {
      success: false,
      submission: null,
      errorMessage: `Database error: ${error.message}`
    };
  }
}

/**
 * Bulk update submission statuses
 * 
 * @param {Object} client - Database client
 * @param {string[]} submissionIds - Array of submission IDs to update
 * @param {string} status - The new status
 * @param {boolean} [skipValidation=false] - Whether to skip state transition validation
 * @returns {Promise<{success: boolean, updated: number, failed: number, errors: Object}>} - The update result
 */
async function bulkUpdateSubmissionStatus(client, submissionIds, status, skipValidation = false) {
  if (!submissionIds || submissionIds.length === 0) {
    return {
      success: true,
      updated: 0,
      failed: 0,
      errors: {}
    };
  }
  
  // If we're skipping validation or updating to error state, use the fast path
  if (skipValidation || status === STATUS.ERROR) {
    // Create placeholder string for the array of IDs ($1, $2, $3, etc)
    const placeholders = submissionIds.map((_, index) => `$${index + 2}`).join(', ');
    
    const query = `
      UPDATE jotform
      SET 
        status = $1,
        status_updated_at = CURRENT_TIMESTAMP
      WHERE submission_id IN (${placeholders})
    `;
    
    const result = await client.query(query, [status, ...submissionIds]);
    
    return {
      success: true,
      updated: result.rowCount,
      failed: submissionIds.length - result.rowCount,
      errors: {}
    };
  }
  
  // Slow path: validate each transition individually
  // Get the current status of all submissions first
  const currentStatusesResult = await client.query(
    `SELECT submission_id, status FROM jotform WHERE submission_id = ANY($1)`,
    [submissionIds]
  );
  
  // Map of submission ID to current status
  const currentStatusMap = {};
  currentStatusesResult.rows.forEach(row => {
    currentStatusMap[row.submission_id] = row.status;
  });
  
  // Determine which submissions have valid transitions
  const validSubmissionIds = [];
  const invalidResults = {};
  
  for (const submissionId of submissionIds) {
    const currentStatus = currentStatusMap[submissionId];
    
    // If submission doesn't exist in our map, it doesn't exist in DB
    if (currentStatus === undefined) {
      invalidResults[submissionId] = `Submission not found`;
      continue;
    }
    
    // Check if transition is valid
    const validSourceStates = VALID_TRANSITIONS[status] || [];
    if (validSourceStates.includes(currentStatus)) {
      validSubmissionIds.push(submissionId);
    } else {
      invalidResults[submissionId] = 
        `Invalid state transition: ${currentStatus} → ${status}. ` + 
        `Must be in one of these states: ${validSourceStates.join(', ')}`;
    }
  }
  
  // If we have no valid submissions, return early
  if (validSubmissionIds.length === 0) {
    return {
      success: false,
      updated: 0,
      failed: submissionIds.length,
      errors: invalidResults
    };
  }
  
  // Update the valid submissions
  const placeholders = validSubmissionIds.map((_, index) => `$${index + 2}`).join(', ');
  
  const query = `
    UPDATE jotform
    SET 
      status = $1,
      status_updated_at = CURRENT_TIMESTAMP
    WHERE submission_id IN (${placeholders})
  `;
  
  const result = await client.query(query, [status, ...validSubmissionIds]);
  
  return {
    success: validSubmissionIds.length > 0,
    updated: result.rowCount,
    failed: submissionIds.length - validSubmissionIds.length,
    errors: invalidResults
  };
}

/**
 * Count submissions by status
 * 
 * @param {Object} client - Database client
 * @returns {Promise<Object>} - Object with counts by status
 */
async function countSubmissionsByStatus(client) {
  const query = `
    SELECT status, COUNT(*) as count
    FROM jotform
    GROUP BY status
  `;
  
  const result = await client.query(query);
  
  // Convert the result to a more usable object
  const counts = {};
  result.rows.forEach(row => {
    counts[row.status] = parseInt(row.count);
  });
  
  return counts;
}

/**
 * Get submissions with specified status
 * 
 * @param {Object} client - Database client
 * @param {string|string[]} statuses - Status(es) to filter by
 * @param {number} [limit=100] - Maximum number of records to return
 * @param {number} [offset=0] - Number of records to skip
 * @returns {Promise<Array>} - Array of submission records
 */
async function getSubmissionsByStatus(client, statuses, limit = 100, offset = 0) {
  // Convert single status to array
  const statusArray = Array.isArray(statuses) ? statuses : [statuses];
  
  // Create placeholders for statuses
  const statusPlaceholders = statusArray.map((_, index) => `$${index + 1}`).join(', ');
  
  const query = `
    SELECT * FROM jotform
    WHERE status IN (${statusPlaceholders})
    ORDER BY created_at DESC
    LIMIT $${statusArray.length + 1} OFFSET $${statusArray.length + 2}
  `;
  
  const result = await client.query(query, [...statusArray, limit, offset]);
  return result.rows;
}

module.exports = {
  STATUS,
  VALID_TRANSITIONS,
  validateStateTransition,
  updateSubmissionStatus,
  bulkUpdateSubmissionStatus,
  countSubmissionsByStatus,
  getSubmissionsByStatus
};
