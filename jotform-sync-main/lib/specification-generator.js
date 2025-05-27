/**
 * Specification Generator
 * 
 * Transforms denormalized jotform submissions into normalized specification data
 * with optimal performance and reliability.
 */

const db = require('@/lib/db');

// Import progress store for real-time updates
let progressStore;
try {
  const { progressStore: store } = require('../app/api/progress-stream/route');
  progressStore = store;
} catch (err) {
  // Progress store not available (e.g. during tests or initial import)
  // This is normal and expected in some contexts
  progressStore = null;
}

// Import status management utilities
const { STATUS } = require('./submission-status');

// Constants for log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

// Configuration
const config = {
  // Default batch size for processing submissions
  batchSize: 50,
  // Log levels: 0=ERROR, 1=WARN, 2=INFO, 3=DEBUG, 4=TRACE
  logLevel: 2,
  // Cache TTL in milliseconds (10 minutes)
  cacheTTL: 10 * 60 * 1000
};

// In-memory cache for enum lookups
const enumCache = {
  data: {},
  timestamps: {},

  // Get a cached enum value
  get(table, name) {
    if (!name) return null;

    const key = `${table}:${name.toLowerCase()}`;
    const entry = this.data[key];
    const timestamp = this.timestamps[key];

    // Check if entry exists and is not expired
    if (entry !== undefined && timestamp && (Date.now() - timestamp) < config.cacheTTL) {
      log('TRACE', `Cache hit for ${key} = ${entry}`);
      return entry;
    }

    log('TRACE', `Cache miss for ${key}`);
    return undefined;
  },

  // Set a value in the cache
  set(table, name, id) {
    if (!name) return;

    const key = `${table}:${name.toLowerCase()}`;
    this.data[key] = id;
    this.timestamps[key] = Date.now();
    log('TRACE', `Cached ${key} = ${id}`);
  },

  // Clear the entire cache
  clear() {
    this.data = {};
    this.timestamps = {};
    log('DEBUG', 'Enum cache cleared');
  }
};

/**
 * Logging utility with configurable levels
 * @param {string} level - Log level: ERROR, WARN, INFO, DEBUG, TRACE
 * @param {string} message - Log message
 */
function log(level, message) {
  const levelNum = LOG_LEVELS[level] || 2;

  if (levelNum <= config.logLevel) {
    const timestamp = new Date().toISOString();
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log']
      (`[${timestamp}] ${level}: ${message}`);
  }
}

/**
 * Generates normalized specifications from processed jotform submissions
 * Only processes submissions with jotform.processed = true
 * 
 * @param {Object} options - Configuration options
 * @param {number} [options.batchSize] - Number of submissions to process in each batch
 * @param {number} [options.logLevel] - Log verbosity (0=ERROR to 4=TRACE)
 * @param {Function} [options.progressCallback] - Callback function for progress updates
 * @param {boolean} [options.dryRun] - If true, validates but doesn't commit changes
 * @returns {Promise<Object>} - Results summary
 */
async function generateSpecifications(options = {}) {
  // Apply options with defaults
  const batchSize = options.batchSize || config.batchSize;

  // Update log level if specified
  if (typeof options.logLevel === 'number') {
    config.logLevel = options.logLevel;
  }

  // Progress tracking
  let totalProcessed = 0;
  let totalSuccess = 0;
  let failedSubmissions = [];
  let startTime = Date.now();
  let lastProgressUpdate = Date.now();

  // Initialize progress tracking
  let progressData = {
    processed: 0,
    total: 0,
    percentage: 0,
    estimatedTimeRemaining: null
  };

  try {
    // Clear enum cache at the start of a new run
    enumCache.clear();

    log('INFO', 'Starting specification generation process');
    log('INFO', `Configuration: batchSize=${batchSize}, logLevel=${config.logLevel}, dryRun=${!!options.dryRun}`);

    // Get submissions to process
    const client = await db.getClient();
    try {
      // Get the submissions to process
      const submissions = await getProcessedSubmissionsForSpecification(client);
      const totalSubmissions = submissions.length;

      log('INFO', `Found ${totalSubmissions} submissions to process`);

      // Update total in progress data
      progressData.total = totalSubmissions;
      updateProgress(progressData);

      if (totalSubmissions === 0) {
        log('INFO', 'No submissions to process');
        return {
          processed: 0,
          success: 0,
          failedSubmissions: [],
          duration: Date.now() - startTime
        };
      }

      // Process each submission with its own transaction
      for (let i = 0; i < submissions.length; i++) {
        const submission = submissions[i];
        const submissionId = submission.submission_id;
        const transactionClient = await db.getClient();

        try {
          log('INFO', `Processing submission ${i+1}/${totalSubmissions}: ${submissionId}`);

          // Update progress
          totalProcessed++;
          progressData.processed = totalProcessed;
          progressData.percentage = Math.round((totalProcessed / totalSubmissions) * 100);

          // Calculate estimated time remaining
          const elapsed = Date.now() - startTime;
          const avgTimePerItem = elapsed / totalProcessed;
          const remaining = totalSubmissions - totalProcessed;
          progressData.estimatedTimeRemaining = Math.round(avgTimePerItem * remaining);

          // Only update progress every 250ms to avoid flooding the stream
          if (Date.now() - lastProgressUpdate > 250) {
            updateProgress(progressData);
            lastProgressUpdate = Date.now();
          }

          // Begin transaction for this submission
          await transactionClient.query('BEGIN');

          // Validate the submission before processing
          const validationResult = await validateSubmission(transactionClient, submission);
          
          if (!validationResult.valid) {
            // Create structured error info similar to individual endpoint
            const errorInfo = parseValidationError(validationResult.reason);
            
            // Get suggestions for enum values if applicable
            if (errorInfo.enumTable) {
              errorInfo.suggestions = await getEnumSuggestions(transactionClient, errorInfo.enumTable, errorInfo.value);
            }
            
            // Add to failed submissions with detailed error
            failedSubmissions.push({
              id: submissionId,
              title: submission.title || 'Unknown',
              error: validationResult.reason,
              errorInfo
            });
            
            await transactionClient.query('ROLLBACK');
            await logTransformError(client, submissionId, validationResult.reason);
            continue;
          }

          // If this is a dry run, skip actual processing
          if (options.dryRun) {
            log('INFO', `Dry run - skipping processing of ${submissionId}`);
            await transactionClient.query('ROLLBACK');
            totalSuccess++;
            continue;
          }

          try {
            // Create specification - use the same approach as individual endpoint
            const specification = await generateSpecification({
              submissionId,
              client: transactionClient,
              options: {
                skipStatusUpdate: false
              }
            });

            log('INFO', `Created specification with ID: ${specification.id}`);
            
            // Commit transaction
            await transactionClient.query('COMMIT');
            
            // Increment success counter
            totalSuccess++;
          } catch (err) {
            // Rollback transaction
            await transactionClient.query('ROLLBACK');
            
            // Parse the error to provide structured feedback
            const errorInfo = parseGenerationError(err.message);
            
            // Add to failed submissions list
            failedSubmissions.push({
              id: submissionId,
              title: submission.title || 'Unknown',
              error: err.message,
              errorInfo
            });
            
            // Log the error to the database
            await logTransformError(client, submissionId, err);
          }
        } catch (err) {
          // Handle any unexpected errors
          try {
            await transactionClient.query('ROLLBACK');
          } catch (rollbackErr) {
            log('ERROR', `Error in rollback: ${rollbackErr.message}`);
          }
          
          // Add to failed submissions list
          failedSubmissions.push({
            id: submissionId,
            title: submission.title || 'Unknown',
            error: err.message
          });
          
          // Log the error to the database
          await logTransformError(client, submissionId, err);
        } finally {
          // Always release the transaction client
          transactionClient.release();
        }
      }

      // Final progress update
      progressData.processed = totalProcessed;
      progressData.percentage = 100;
      progressData.estimatedTimeRemaining = 0;
      updateProgress(progressData);

      // Calculate duration
      const duration = Date.now() - startTime;
      log('INFO', `Specification generation completed in ${duration}ms`);
      log('INFO', `Processed: ${totalProcessed}, Success: ${totalSuccess}, Failures: ${failedSubmissions.length}`);

      return {
        processed: totalProcessed,
        success: totalSuccess,
        failedSubmissions,
        duration
      };
    } finally {
      client.release();
    }
  } catch (error) {
    log('ERROR', `Fatal error in specification generation: ${error.message}`);
    throw error;
  }
}

/**
 * Helper function to update progress
 * @param {Object} progressData - Progress data to update
 */
function updateProgress(progressData) {
  if (progressStore) {
    try {
      // Update the specificationProgress property in the store
      progressStore.specificationProgress = { ...progressData };
      log('TRACE', `Progress updated: ${progressData.processed}/${progressData.total} (${progressData.percentage}%)`);
    } catch (error) {
      log('ERROR', `Error updating progress: ${error.message}`);
    }
  }
}

/**
 * Get processed submissions that don't already have specifications
 * Only selects submissions in the valid states for specification generation
 * 
 * @param {Object} client - Database client
 * @returns {Promise<Array>} - List of jotform submissions to process
 */
async function getProcessedSubmissionsForSpecification(client) {
  log('DEBUG', 'Getting submissions for specification generation');

  try {
    const startTime = Date.now();

    // Explicitly target only shopify_mapped status submissions
    // Directly join using submission_id
    const submissionsQuery = `
      SELECT j.* FROM jotform j
      LEFT JOIN specifications s ON j.submission_id = s.submission_id
      WHERE j.status = 'shopify_mapped'
      AND s.id IS NULL
      LIMIT 500
    `;
    
    log('TRACE', `Executing query: ${submissionsQuery.replace(/\s+/g, ' ')}`);
    const result = await client.query(submissionsQuery);

    log('INFO', `Found ${result.rows.length} submissions to process in ${Date.now() - startTime}ms`);
    log('DEBUG', `Submissions must be in 'shopify_mapped' state`);
    return result.rows;
  } catch (error) {
    log('ERROR', `Error getting submissions for specification: ${error.message}`);
    throw error;
  }
}

/**
 * Get shopify data for a submission ID
 * 
 * @param {Object} client - Database client
 * @param {string} submissionId - Jotform submission ID
 * @returns {Promise<Object|null>} - Shopify data or null if not found
 */
async function getShopifyDataForSubmission(client, submissionId) {
  log('DEBUG', `Getting Shopify data for submission ID: ${submissionId}`);
  const startTime = Date.now();

  const query = `
    SELECT * FROM jotform_shopify
    WHERE submission_id = $1
  `;

  try {
    log('TRACE', `Running query with submissionId: ${submissionId}`);
    const result = await client.query(query, [submissionId]);
    log('DEBUG', `Query returned ${result.rows.length} rows after ${Date.now() - startTime}ms`);
    return result.rows[0];
  } catch (error) {
    log('ERROR', `Error in getShopifyDataForSubmission: ${error.message}`);
    throw error;
  }
}

/**
 * Create a new specification record or update an existing one based on submission_id
 * 
 * @param {Object} client - Database client
 * @param {Object} jotform - Jotform submission data
 * @param {Object} shopify - Shopify data for the submission
 * @returns {Promise<number>} - ID of the created or updated specification
 */
async function createSpecification(client, jotform, shopify) {
  log('DEBUG', 'Creating or updating specification record');
  const startTime = Date.now();
  const submissionId = jotform.submission_id;

  // Find user ID from reviewer name
  log('DEBUG', `Getting user ID for reviewer: ${jotform.reviewer}`);
  const userId = await getUserIdFromReviewer(client, jotform.reviewer);
  log('DEBUG', `User ID: ${userId}`);

  // Get foreign key IDs
  log('DEBUG', 'Getting product type ID...');
  const productTypeId = await getEnumIdByName(client, 'enum_product_types', shopify.product_type);
  log('DEBUG', `Product type ID: ${productTypeId}`);

  let productBrandId = null;
  if (shopify.product_brand) {
    log('DEBUG', `Getting product brand ID for: ${shopify.product_brand}`);
    productBrandId = await getEnumIdByName(client, 'enum_product_brands', shopify.product_brand);
    log('DEBUG', `Product brand ID: ${productBrandId}`);
  }

  let moistureLevelId = null;
  if (jotform.moisture) {
    log('DEBUG', `Getting moisture level ID for: ${jotform.moisture}`);
    moistureLevelId = await getEnumIdByName(client, 'enum_moisture_levels', jotform.moisture);
    log('DEBUG', `Moisture level ID: ${moistureLevelId}`);
  }

  let grindId = null;
  if (jotform.grind) {
    log('DEBUG', `Getting grind ID for: ${jotform.grind}`);
    grindId = await getEnumIdByName(client, 'enum_grinds', jotform.grind);
    log('DEBUG', `Grind ID: ${grindId}`);
  }

  let nicotineLevelId = null;
  if (jotform.nicotine) {
    log('DEBUG', `Getting nicotine level ID for: ${jotform.nicotine}`);
    nicotineLevelId = await getEnumIdByName(client, 'enum_nicotine_levels', jotform.nicotine);
    log('DEBUG', `Nicotine level ID: ${nicotineLevelId}`);
  }

  let experienceLevelId = null;
  if (jotform.ease_of_use) {
    log('DEBUG', `Getting experience level ID for: ${jotform.ease_of_use}`);
    experienceLevelId = await getEnumIdByName(client, 'enum_experience_levels', jotform.ease_of_use);
    log('DEBUG', `Experience level ID: ${experienceLevelId}`);
  }

  try {
    // Check if specification already exists for this submission_id
    const existingQuery = `
      SELECT id FROM specifications WHERE submission_id = $1
    `;
    
    const existingResult = await client.query(existingQuery, [submissionId]);
    
    if (existingResult.rows.length > 0) {
      // Specification exists, update it
      const specId = existingResult.rows[0].id;
      log('INFO', `Found existing specification with ID ${specId} for submission ${submissionId}, updating...`);
      
      const updateQuery = `
        UPDATE specifications SET
          shopify_handle = $1,
          product_type_id = $2,
          is_fermented = $3,
          is_oral_tobacco = $4,
          is_artisan = $5,
          grind_id = $6,
          nicotine_level_id = $7,
          experience_level_id = $8,
          review = $9,
          star_rating = $10,
          rating_boost = $11,
          user_id = $12,
          moisture_level_id = $13,
          product_brand_id = $14,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $15
        RETURNING id
      `;
      
      const updateValues = [
        shopify.shopify_handle,
        productTypeId,
        jotform.fermented,
        jotform.oral_tobacco,
        jotform.artisan,
        grindId,
        nicotineLevelId,
        experienceLevelId,
        jotform.review,
        jotform.star_rating,
        jotform.rating_boost,
        userId,
        moistureLevelId,
        productBrandId,
        specId
      ];
      
      log('TRACE', 'Executing update query for specification');
      await client.query(updateQuery, updateValues);
      log('DEBUG', `Updated specification with ID: ${specId} (took ${Date.now() - startTime}ms)`);
      
      // First, delete any existing related data in junction tables
      if (jotform.tobacco || jotform.cure || jotform.tasting_notes) {
        log('DEBUG', 'Removing existing junction table entries before updating...');
        
        if (jotform.tobacco) {
          await client.query('DELETE FROM spec_tobacco_types WHERE specification_id = $1', [specId]);
        }
        
        if (jotform.cure) {
          await client.query('DELETE FROM spec_cures WHERE specification_id = $1', [specId]);
        }
        
        if (jotform.tasting_notes) {
          await client.query('DELETE FROM spec_tasting_notes WHERE specification_id = $1', [specId]);
        }
      }
      
      return specId;
    } else {
      // Insert new specification record
      log('DEBUG', 'Creating new specification record...');
      const insertQuery = `
        INSERT INTO specifications (
          shopify_handle, product_type_id, is_fermented, is_oral_tobacco, 
          is_artisan, grind_id, nicotine_level_id, experience_level_id, 
          review, star_rating, rating_boost, user_id, moisture_level_id,
          product_brand_id, submission_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `;

      const insertValues = [
        shopify.shopify_handle,
        productTypeId,
        jotform.fermented,
        jotform.oral_tobacco,
        jotform.artisan,
        grindId,
        nicotineLevelId,
        experienceLevelId,
        jotform.review,
        jotform.star_rating,
        jotform.rating_boost,
        userId,
        moistureLevelId,
        productBrandId,
        submissionId
      ];

      log('TRACE', 'Executing insert query for specification');
      const result = await client.query(insertQuery, insertValues);
      const specId = result.rows[0].id;
      log('DEBUG', `Inserted specification with ID: ${specId} (took ${Date.now() - startTime}ms)`);
      return specId;
    }
  } catch (error) {
    log('ERROR', `Error creating/updating specification: ${error.message}`);
    throw error;
  }
}

/**
 * Validates a submission before processing
 * Ensures it has all required data and relationships
 * 
 * @param {Object} client - Database client
 * @param {Object} submission - Jotform submission data
 * @returns {Promise<Object>} - Validation result {valid: boolean, reason: string, userId: string}
 */
async function validateSubmission(client, submission) {
  log('DEBUG', `Validating submission ${submission.submission_id}`);
  const startTime = Date.now();

  try {
    // Check for required fields
    if (!submission.reviewer) {
      log('WARN', `Missing reviewer information for submission ${submission.submission_id}`);
      return { valid: false, reason: 'Missing reviewer information' };
    }

    // Verify enum values before attempting to use them
    // This prevents transaction aborts when enum values don't exist
    // We're only checking the existence here, not using the results
    if (submission.ease_of_use) {
      try {
        // Special handling for 'Expert' value
        const experienceLevel = submission.ease_of_use === 'Expert' ? 'Advanced' : submission.ease_of_use;
        const query = `SELECT id FROM enum_experience_levels WHERE LOWER(name) = LOWER($1)`;
        const result = await client.query(query, [experienceLevel]);
        if (result.rows.length === 0) {
          return { valid: false, reason: `Value "${submission.ease_of_use}" not found in enum_experience_levels` };
        }
      } catch (err) {
        log('WARN', `Error checking experience level: ${err.message}`);
        return { valid: false, reason: err.message };
      }
    }

    // Get the user ID for the reviewer
    try {
      const userId = await getUserIdFromReviewer(client, submission.reviewer);
      if (!userId) {
        log('WARN', `No user found with jotform_name matching reviewer: ${submission.reviewer}`);
        return { valid: false, reason: `No user found with jotform_name matching reviewer: ${submission.reviewer}` };
      }
      
      log('DEBUG', `Validation completed in ${Date.now() - startTime}ms`);
      return { valid: true, userId };
    } catch (error) {
      log('WARN', `Error finding user: ${error.message}`);
      return { valid: false, reason: error.message };
    }
    // Validate newline-delimited fields
    const fieldsToValidate = [
      { field: 'tobacco', enumTable: 'enum_tobacco_types' },
      { field: 'cure', enumTable: 'enum_cures' },
      { field: 'tasting_notes', enumTable: 'enum_tasting_notes' }
    ];

    for (const { field, enumTable } of fieldsToValidate) {
      if (submission[field]) {
        // Check for malformed patterns
        if (submission[field].includes('\n\n')) {
          return {
            valid: false,
            reason: `Field ${field} contains consecutive newlines`
          };
        }

        // Validate enum values exist
        const values = submission[field]
          .split('\n')
          .map(v => v.trim())
          .filter(v => v.length > 0);

        for (const value of values) {
          // Check cache first
          let enumId = enumCache.get(enumTable, value);

          // If not in cache, query database
          if (enumId === undefined) {
            const query = `
              SELECT id FROM ${enumTable}
              WHERE LOWER(name) = LOWER($1)
            `;

            try {
              const result = await client.query(query, [value]);
              if (result.rows.length === 0) {
                return {
                  valid: false,
                  reason: `Value "${value}" not found in ${enumTable}`
                };
              }
              // Cache the result
              enumId = result.rows[0].id;
              enumCache.set(enumTable, value, enumId);
            } catch (error) {
              return {
                valid: false,
                reason: `Error validating ${field}: ${error.message}`
              };
            }
          }
        }
      }
    }
    
    // All validations passed
    log('DEBUG', `Validation completed in ${Date.now() - startTime}ms`);
    return { valid: true, userId };
  } catch (error) {
    log('ERROR', `Error validating submission: ${error.message}`);
    return { valid: false, reason: error.message };
  }
}

/**
 * Process newline-delimited fields into junction tables
 */
async function processNewlineDelimitedField(client, specId, delimitedValues, enumTable) {
  log('DEBUG', `Processing delimited field for specId=${specId}, enumTable=${enumTable}`);
  const startTime = Date.now();

  // Split by newline and trim values
  const values = delimitedValues
    .split('\n')
    .map(v => v.trim())
    .filter(v => v.length > 0);

  log('DEBUG', `Processing ${values.length} values for ${enumTable}`);

  // Create junction table entries
  for (const value of values) {
    log('TRACE', `Processing value: "${value}" for ${enumTable}`);

    // Get the ID from the enum table (which has the enum_ prefix)
    log('TRACE', `Looking up enum ID for value: "${value}"`);
    const enumId = await getEnumIdByName(client, enumTable, value);
    log('TRACE', `Enum ID lookup result: ${enumId}`);

    if (enumId) {
      // Remove the 'enum_' prefix for the junction table name construction
      const baseTableName = enumTable.replace(/^enum_/, '');
      const junctionTable = `spec_${baseTableName}`;

      // The column name in the junction table includes 'enum_' prefix
      // and is singular form of the table name
      const singularName = baseTableName.slice(0, -1); // Remove trailing 's'
      const enumColumn = `enum_${singularName}_id`;

      log('DEBUG', `Inserting into junction table ${junctionTable}`);
      try {
        const insertQuery = `
          INSERT INTO ${junctionTable} (specification_id, ${enumColumn})
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `;

        log('TRACE', `Junction table query: ${insertQuery.replace(/\s+/g, ' ')}`);
        log('TRACE', `With parameters: specId=${specId}, enumId=${enumId}`);

        await client.query(insertQuery, [specId, enumId]);
        log('DEBUG', `Successfully inserted ${value} into ${junctionTable}`);
      } catch (err) {
        log('ERROR', `Error inserting into junction table: ${err.message}`);
        throw err; // Re-throw to maintain existing error handling
      }
    }
  }

  log('DEBUG', `Completed processing delimited field after ${Date.now() - startTime}ms`);
}

/**
 * Get enum ID by name
 * Uses caching to reduce database queries
 * 
 * @param {Object} client - Database client
 * @param {string} enumTable - Name of the enum table
 * @param {string} name - Enum value to lookup
 * @returns {Promise<number|null>} - Enum ID or null if not found
 */
async function getEnumIdByName(client, enumTable, name) {
  log('DEBUG', `Getting enum ID for ${enumTable}.${name}`);

  if (!name) {
    log('DEBUG', 'Name is null or empty, returning null');
    return null;
  }

  try {
    // Handle special case mappings
    if (enumTable === 'enum_experience_levels' && name === 'Expert') {
      log('INFO', 'Mapping "Expert" to "Advanced" in enum_experience_levels');
      name = 'Advanced';
    }

    // Check cache first
    const cachedId = enumCache.get(enumTable, name);
    if (cachedId !== undefined) {
      return cachedId;
    }

    // Not in cache, query database
    const query = `
      SELECT id FROM ${enumTable}
      WHERE LOWER(name) = LOWER($1)
    `;

    log('TRACE', `Executing query: ${query.replace(/\s+/g, ' ')} with param: ${name}`);
    const startTime = Date.now();
    const result = await client.query(query, [name]);
    log('TRACE', `Query completed in ${Date.now() - startTime}ms`);

    if (result.rows.length === 0) {
      log('WARN', `No matching enum value found for '${name}' in '${enumTable}'`);
      // Don't log to transform_log here as it might cause transaction issues
      // Instead throw a properly formatted error that can be caught higher up
      throw new Error(`Value "${name}" not found in ${enumTable}`);
    }

    const id = result.rows[0].id;
    log('DEBUG', `Found ID ${id} for '${name}' in '${enumTable}'`);

    // Cache the result
    enumCache.set(enumTable, name, id);

    return id;
  } catch (error) {
    log('ERROR', `Error in getEnumIdByName: ${error.message}`);
    throw error;
  }
}

/**
 * Get user ID from reviewer name
 * Maps jotform.reviewer -> users.jotform_name -> users.id
 * Missing data is treated as a hard error
 */
async function getUserIdFromReviewer(client, reviewerName) {
  log('DEBUG', `Getting user ID for reviewer: '${reviewerName}'`);
  const startTime = Date.now();

  if (!reviewerName) {
    log('ERROR', 'Reviewer name is missing in submission data');
    throw new Error('Reviewer name is missing in submission data');
  }

  const query = `
    SELECT id FROM users
    WHERE LOWER(jotform_name) = LOWER($1)
  `;

  try {
    log('TRACE', `Executing query: ${query.replace(/\s+/g, ' ')} with param: ${reviewerName}`);
    const result = await client.query(query, [reviewerName]);
    log('TRACE', `Query returned ${result.rows.length} rows after ${Date.now() - startTime}ms`);

    if (result.rows.length === 0) {
      log('ERROR', `No user found with jotform_name matching reviewer: ${reviewerName}`);
      throw new Error(`No user found with jotform_name matching reviewer: ${reviewerName}`);
    }

    log('DEBUG', `Found user ID ${result.rows[0].id} for reviewer '${reviewerName}'`);
    return result.rows[0].id;
  } catch (error) {
    log('ERROR', `Error in getUserIdFromReviewer: ${error.message}`);
    throw error;
  }
}

/**
 * Log transformation errors
 * 
 * @param {Object} client - Database client
 * @param {string} submissionId - Jotform submission ID or null
 * @param {Error|string} error - Error object or message
 * @returns {Promise<void>}
 */
async function logTransformError(client, submissionId, error) {
  try {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('ERROR', `Logging error for submission ${submissionId || 'unknown'}: ${errorMessage}`);
    
    // Using transform_log table instead of error_log
    const query = `
      INSERT INTO transform_log (submission_id, message)
      VALUES ($1, $2)
    `;
    
    await client.query(query, [submissionId, errorMessage]);
  } catch (logError) {
    // Don't throw here, just log to console
    log('ERROR', `Error logging to database: ${logError.message}`);
    log('ERROR', `Original error was: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse validation error messages into structured form
 * @param {string} errorMessage - The error message to parse
 * @returns {Object} Structured error information
 */
function parseValidationError(errorMessage) {
  // Default error structure
  const errorInfo = {
    message: errorMessage,
    field: null,
    value: null,
    enumTable: null
  };

  // Check for missing reviewer
  if (errorMessage.includes('Missing reviewer')) {
    errorInfo.field = 'reviewer';
    return errorInfo;
  }

  // Check for user not found
  if (errorMessage.includes('No user found with jotform_name matching reviewer')) {
    errorInfo.field = 'reviewer';
    const match = errorMessage.match(/reviewer: (.+)$/);
    if (match) {
      errorInfo.value = match[1];
    }
    return errorInfo;
  }

  // Check for enum value not found
  const enumMatch = errorMessage.match(/Value "([^"]+)" not found in (\w+)/);
  if (enumMatch) {
    errorInfo.value = enumMatch[1];
    errorInfo.enumTable = enumMatch[2];
    
    // Map enum table to field name
    if (enumMatch[2] === 'enum_tobacco_types') {
      errorInfo.field = 'tobacco';
    } else if (enumMatch[2] === 'enum_cures') {
      errorInfo.field = 'cure';
    } else if (enumMatch[2] === 'enum_tasting_notes') {
      errorInfo.field = 'tasting_notes';
    }
    
    errorInfo.message = `"${errorInfo.value}" is not a recognized value for ${errorInfo.field}`;
  }

  // Check for malformed fields
  const malformedMatch = errorMessage.match(/Field (\w+) contains consecutive/);
  if (malformedMatch) {
    errorInfo.field = malformedMatch[1];
    errorInfo.message = `The ${errorInfo.field} field contains formatting errors`;
  }

  return errorInfo;
}

/**
 * Parse generation errors into structured form
 * @param {string} errorMessage - The error message to parse
 * @returns {Object} Structured error information
 */
function parseGenerationError(errorMessage) {
  // Default error structure
  const errorInfo = {
    message: errorMessage
  };

  // Check for no Shopify data
  if (errorMessage.includes('no associated Shopify data')) {
    errorInfo.field = 'shopify_handle';
    errorInfo.message = 'This submission has no associated Shopify data';
  }

  return errorInfo;
}

/**
 * Get suggestions for enum values
 * @param {Object} client - Database client
 * @param {string} enumTable - The enum table name
 * @param {string} invalidValue - The invalid value to find suggestions for
 * @returns {Promise<Array>} List of suggestions
 */
async function getEnumSuggestions(client, enumTable, invalidValue) {
  try {
    // Get similar values to suggest
    const query = `
      SELECT name 
      FROM ${enumTable} 
      ORDER BY name ASC
      LIMIT 5
    `;
    
    const result = await client.query(query);
    return result.rows.map(row => row.name);
  } catch (error) {
    console.error(`Error getting suggestions for ${enumTable}:`, error);
    return [];
  }
}

/**
 * Generate a specification for a single submission
 * 
 * @param {Object} options - Options for generation
 * @param {string} options.submissionId - Submission ID to process
 * @param {Object} options.client - Database client (optional)
 * @param {Object} options.options - Additional options
 * @returns {Promise<Object>} - The generated specification
 */
async function generateSpecification(options) {
  const { submissionId, client: providedClient, options: genOptions = {} } = options;
  
  if (!submissionId) {
    throw new Error('Submission ID is required');
  }
  
  log('INFO', `Generating specification for submission: ${submissionId}`);
  
  // Allow caller to provide their own DB client
  const useExistingClient = !!providedClient;
  const client = useExistingClient ? providedClient : await db.getClient();
  
  try {
    // If no client provided, start our own transaction
    if (!useExistingClient) {
      await client.query('BEGIN');
    }
    
    // Get submission data with joined Shopify data
    const submissionQuery = `
      SELECT j.*, js.*
      FROM jotform j
      LEFT JOIN jotform_shopify js ON j.submission_id = js.submission_id
      WHERE j.submission_id = $1
    `;
    
    const result = await client.query(submissionQuery, [submissionId]);
    
    if (result.rows.length === 0) {
      throw new Error(`Submission ${submissionId} not found`);
    }
    
    const submission = result.rows[0];
    log('DEBUG', `Found submission: ${submission.submission_id}`);
    
    // Validate submission has required data
    if (!submission.shopify_handle) {
      throw new Error('Submission has no associated Shopify data');
    }
    
    // The createSpecification function now handles existing specifications based on submission_id
    // No need to explicitly check or delete specifications here
    
    // Create specification
    log('INFO', 'Creating new specification...');
    const specId = await createSpecification(client, submission, submission);
    log('INFO', `Created specification with ID: ${specId}`);
    
    // Process junction tables for one-to-many relationships
    if (submission.tobacco) {
      log('DEBUG', 'Processing tobacco types...');
      await processNewlineDelimitedField(client, specId, submission.tobacco, 'enum_tobacco_types');
    }
    
    if (submission.cure) {
      log('DEBUG', 'Processing cures...');
      await processNewlineDelimitedField(client, specId, submission.cure, 'enum_cures');
    }
    
    if (submission.tasting_notes) {
      log('DEBUG', 'Processing tasting notes...');
      await processNewlineDelimitedField(client, specId, submission.tasting_notes, 'enum_tasting_notes');
    }
    
    // Update submission status if needed
    const { updateSubmissionStatus } = require('./submission-status');
    
    // Check if the submission is already in SPECIFICATION_GENERATED state
    if (submission.status === STATUS.SPECIFICATION_GENERATED) {
      log('INFO', `Submission is already in ${STATUS.SPECIFICATION_GENERATED} state, skipping status update`);
    } else {
      log('DEBUG', 'Updating submission status to SPECIFICATION_GENERATED...');
      const updateResult = await updateSubmissionStatus(
        client,
        submissionId,
        STATUS.SPECIFICATION_GENERATED
      );
      
      if (!updateResult.success) {
        throw new Error(`Failed to update submission status: ${updateResult.errorMessage}`);
      }
    }
    
    // Get the complete specification
    const specQuery = `
      SELECT * FROM specifications WHERE id = $1
    `;
    
    const specResult = await client.query(specQuery, [specId]);
    const specification = specResult.rows[0];
    
    // Commit if we started the transaction
    if (!useExistingClient) {
      await client.query('COMMIT');
      log('INFO', 'Transaction committed successfully');
    }
    
    return specification;
  } catch (error) {
    // Rollback if we started the transaction
    if (!useExistingClient) {
      await client.query('ROLLBACK');
      log('ERROR', `Transaction rolled back due to error: ${error.message}`);
    }
    
    throw error;
  } finally {
    // Release client if we acquired it
    if (!useExistingClient) {
      client.release();
    }
  }
}

module.exports = {
  generateSpecifications,
  generateSpecification,
  // Export configuration for external modification
  config,
  // For testing purposes
  _internal: {
    validateSubmission,
    getProcessedSubmissionsForSpecification,
    getShopifyDataForSubmission,
    createSpecification,
    processNewlineDelimitedField,
    getEnumIdByName,
    getUserIdFromReviewer,
    logTransformError,
    parseValidationError,
    parseGenerationError,
    getEnumSuggestions
  }
};
