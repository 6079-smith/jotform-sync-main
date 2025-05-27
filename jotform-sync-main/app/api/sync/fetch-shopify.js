import db from '@/lib/db';
import { findMatchingShopifyProduct, saveShopifyProductData } from '@/lib/shopify';
import { STATUS, updateSubmissionStatus, VALID_TRANSITIONS } from '@/lib/submission-status';

// Configuration for fetch processing
const BATCH_SIZE = 50; // Number of submissions to process in a single batch transaction
const PROGRESS_INTERVAL = 10; // Log progress after every X items

// NOTE: This function should only be called in response to the Fetch Shopify Data button click (enforced at API route)
export async function fetchShopifyData() {
  // Count total unprocessed submissions first
  const countClient = await db.getClient();
  let totalCount = 0;

  try {
    // Get valid source states for this action
    const validSourceStates = VALID_TRANSITIONS[STATUS.SHOPIFY_MAPPED] || [];
    const validStatesPlaceholders = validSourceStates
      .map((_, index) => `$${index + 1}`)
      .join(', ');
      
    // Only count submissions in the valid source states for this action (TITLE_CLEANED)
    const countResult = await countClient.query(`
      SELECT COUNT(*) as total
      FROM jotform j
      WHERE j.status IN (${validStatesPlaceholders})
      AND j.status != 'ignore'
      AND j.select_product IS NOT NULL
      AND j.select_product != ''
    `, validSourceStates);

    totalCount = parseInt(countResult.rows[0].total) || 0;
    // Status log removed for performance
  } catch (error) {
    console.error('Error counting submissions:', error);
    throw error;
  } finally {
    // Always release the count client when done with it
    if (countClient && typeof countClient.release === 'function') {
      await countClient.release();
    }
  }

  // If no submissions to process, return early
  if (totalCount === 0) {
    return {
      success: true,
      processed: 0,
      unmatchedCount: 0,
      message: 'No submissions need Shopify data processing.'
    };
  }

  // Calculate number of batches needed
  const batchCount = Math.ceil(totalCount / BATCH_SIZE);
  // Batch planning log removed for performance

  let processed = 0;
  let unmatched = [];
  let errors = [];
  let globalStartTime = Date.now();

  // Process submissions in batches
  for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
    const batchStartTime = Date.now();
    // Batch start log removed for performance

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Fetch submissions for this batch, only in valid source state
      const batchValidSourceStates = VALID_TRANSITIONS[STATUS.SHOPIFY_MAPPED] || [];
      const batchParams = [
        ...batchValidSourceStates,
        BATCH_SIZE,
        batchIndex * BATCH_SIZE
      ];
      
      const batchStatesPlaceholders = batchValidSourceStates
        .map((_, index) => `$${index + 1}`)
        .join(', ');
      
      const result = await client.query(`
          SELECT 
            j.submission_id, 
            j.select_product,
            j.cleaned_product_title,
            j.artisan as brand_hint,
            j.status
          FROM jotform j
          WHERE j.status IN (${batchStatesPlaceholders})
          AND j.status != 'ignore'
          AND j.select_product IS NOT NULL
          AND j.select_product != ''
          ORDER BY j.created_at DESC
          LIMIT $${batchValidSourceStates.length + 1} OFFSET $${batchValidSourceStates.length + 2}
        `, batchParams);

      if (result.rows.length === 0) {
        // Empty batch log removed for performance
        await client.query('COMMIT');
        continue;
      }

      // Processing batch log removed for performance

      // Process each submission in the batch
      let batchProcessed = 0;
      for (const [index, row] of result.rows.entries()) {
        const { submission_id, select_product, cleaned_product_title, brand_hint } = row;

        // Use cleaned title if available, otherwise fallback to original
        const titleToUse = cleaned_product_title || select_product;

        // Log progress at intervals
        const totalProcessedSoFar = processed + batchProcessed + unmatched.length + errors.length;
        if (totalProcessedSoFar > 0 && totalProcessedSoFar % PROGRESS_INTERVAL === 0) {
          const elapsedSeconds = Math.round((Date.now() - globalStartTime) / 1000);
          const itemsPerSecond = (totalProcessedSoFar / elapsedSeconds).toFixed(2);
          const percentComplete = Math.round((totalProcessedSoFar / totalCount) * 100);
          // Progress log removed for performance
        }

        try {
          // Store the current status for validation and reporting
          const currentStatus = row.status;
          
          const product = await findMatchingShopifyProduct(titleToUse, brand_hint);
          if (product) {
            try {
              // First validate if we can update the status
              const updateResult = await updateSubmissionStatus(
                client,
                submission_id,
                STATUS.SHOPIFY_MAPPED,
                null, // No error message
                false // Don't skip validation
              );
              
              if (!updateResult.success) {
                // If we can't update the status, skip this submission
                unmatched.push({
                  submissionId: submission_id,
                  productTitle: select_product,
                  cleanedTitle: cleaned_product_title,
                  reason: updateResult.errorMessage,
                  status: currentStatus
                });
                console.warn(`Skipped "${titleToUse}": ${updateResult.errorMessage}`);
                continue;
              }
              
              // Status update succeeded, now save the Shopify product data
              await saveShopifyProductData(submission_id, product, client);

              batchProcessed++;

              // Log individual successful matches for better visibility
              if (batchProcessed % 5 === 0 || index === result.rows.length - 1) {
                // Success match log removed for performance
              }
            } catch (updateError) {
              console.error(`❌ Error marking submission ${submission_id} as processed:`, updateError.message);
              throw updateError; // Rethrow to trigger batch rollback
            }
          } else {
            unmatched.push({
              submissionId: submission_id,
              productTitle: select_product,
              cleanedTitle: cleaned_product_title || null,
              titleUsed: titleToUse,
              brandHint: brand_hint || null
            });

            // Log unmatched products for troubleshooting
            // No match log removed for performance
          }
        } catch (error) {
          errors.push({
            submissionId: submission_id,
            error: error.message,
            productTitle: select_product
          });

          // Log errors immediately
          console.warn(`❌ Error processing "${select_product}": ${error.message}`);
        }
      }

      // Commit this batch's transaction and verify successful products by double-checking
      await client.query('COMMIT');
      processed += batchProcessed;

      // Verify the processed submissions after commit (sample check on the first matched submission in batch)
      if (batchProcessed > 0) {
        try {
          // Get first matched submission ID from this batch to verify
          const verificationClient = await db.getClient();
          try {
            const verifyResult = await verificationClient.query(
              'SELECT COUNT(*) as verified FROM jotform WHERE status = \'shopify_mapped\' AND submission_id IN (SELECT submission_id FROM jotform_shopify)'
            );
            // Verification log removed for performance
          } catch (verifyError) {
            console.warn(`Verification check failed:`, verifyError.message);
          } finally {
            if (verificationClient && typeof verificationClient.release === 'function') {
              await verificationClient.release();
            }
          }
        } catch (verifyClientError) {
          console.warn(`Could not create verification client:`, verifyClientError.message);
        }
      }

      // Log batch completion stats
      const batchDuration = (Date.now() - batchStartTime) / 1000;
      // Batch completion log removed for performance
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Batch ${batchIndex + 1} failed and was rolled back:`, error);
      throw error;
    } finally {
      if (client && typeof client.release === 'function') {
        await client.release();
      }
    }
  }

  // Log overall stats
  const totalDuration = (Date.now() - globalStartTime) / 1000;
  // Summary header removed for performance
  // Time summary removed for performance
  // Success count removed for performance
  // Unmatched count removed for performance
  // Error count removed for performance

  // Create a detailed status message
  let message = '';
  const totalAttempted = processed + unmatched.length + errors.length;

  if (totalAttempted === 0) {
    message = 'No submissions were available for Shopify data processing.';
  } else {
    // Success message
    if (processed > 0) {
      message += `Successfully matched ${processed} product${processed !== 1 ? 's' : ''} with Shopify data. `;
    }

    // Unmatched message
    if (unmatched.length > 0) {
      message += `${unmatched.length} product${unmatched.length !== 1 ? 's' : ''} could not be matched with Shopify. `;
    }

    // Error message
    if (errors.length > 0) {
      message += `❌ ${errors.length} error${errors.length !== 1 ? 's' : ''} occurred during processing. `;
    }

    // Suggestion if there are unmatched products
    if (unmatched.length > 0) {
      message += 'Try cleaning product titles and running again.';
    }

    // Add duration information to message
    const totalDuration = (Date.now() - globalStartTime) / 1000;
    message += ` (Completed in ${totalDuration.toFixed(1)} seconds)`;
  }

  return {
    success: true,
    processed,
    unmatchedCount: unmatched.length,
    unmatched,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    message
  };
}
