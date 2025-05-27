import db from '@/lib/db';
import { cleanProductName } from '@/lib/product-title-cleaner';
import { STATUS, updateSubmissionStatus, VALID_TRANSITIONS } from '@/lib/submission-status';

/**
 * Apply product title cleaning rules to unprocessed submissions
 * This helps prepare titles for the Fetch Shopify Data feature
 * Now using cleaned_product_title column instead of modifying original titles
 */
export async function cleanProductTitles() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    // Get submissions with product titles that are in the FETCHED state
    // This enforces the state transition rule: only FETCHED submissions can be cleaned
    const validSourceStates = VALID_TRANSITIONS[STATUS.TITLE_CLEANED] || [];
    const validStatesPlaceholders = validSourceStates
      .map((_, index) => `$${index + 1}`)
      .join(', ');
    
    const result = await client.query(`
      SELECT 
        submission_id, 
        select_product,
        cleaned_product_title,
        status
      FROM jotform 
      WHERE select_product IS NOT NULL
        AND select_product != ''
        AND status IN (${validStatesPlaceholders})
    `, validSourceStates);
    
    if (result.rows.length === 0) {
      return {
        success: true,
        cleaned: 0,
        message: 'No unprocessed submissions found that need title cleaning.'
      };
    }
    
    let cleaned = 0;
    let skipped = 0;
    let updates = [];
    let skippedDetails = [];
    
    // Process each submission and clean its title
    for (const row of result.rows) {
      const { submission_id, select_product, status } = row;
      const new_cleaned_title = cleanProductName(select_product);
      
      // Always apply cleaning rules to generate an updated cleaned title
      if (new_cleaned_title) {
        // Use our enhanced updateSubmissionStatus function to validate the transition
        const updateResult = await updateSubmissionStatus(
          client, 
          submission_id, 
          STATUS.TITLE_CLEANED, 
          null,  // No error message
          false  // Don't skip validation
        );
        
        if (updateResult.success) {
          // Also update the cleaned title
          await client.query(
            'UPDATE jotform SET cleaned_product_title = $1 WHERE submission_id = $2',
            [new_cleaned_title, submission_id]
          );
          
          cleaned++;
          updates.push({
            id: submission_id,
            original: select_product,
            cleaned: new_cleaned_title,
            status: STATUS.TITLE_CLEANED,
            previousStatus: status
          });
        } else {
          skipped++;
          skippedDetails.push({
            id: submission_id,
            reason: updateResult.errorMessage,
            status: status
          });
        }
      } else {
        // No cleaning needed, but still track it
        skipped++;
        skippedDetails.push({
          id: submission_id,
          reason: "No cleaning rules applied",
          status: status
        });
      }
    }
    
    await client.query('COMMIT');
    
    // Create a detailed status message
    let message = '';
    const totalProcessed = result.rows.length;
    
    if (cleaned > 0) {
      message = `✅ Cleaned ${cleaned} product title${cleaned !== 1 ? 's' : ''} successfully.`;
      
      if (skipped > 0) {
        message += ` ℹ️ Skipped ${skipped} submission${skipped !== 1 ? 's' : ''}.`;
      }
    } else if (totalProcessed > 0) {
      if (skipped === totalProcessed) {
        message = `No titles were cleaned. All ${skipped} submission${skipped !== 1 ? 's were' : ' was'} skipped.`;
      } else {
        message = `No titles needed cleaning. All ${totalProcessed} already have optimal formatting.`;
      }
    } else {
      message = 'No submissions found in the appropriate state for title cleaning.';
    }
    
    // Add details about state transition issues if any submissions were skipped due to invalid transitions
    const invalidStateTransitions = skippedDetails.filter(item => 
      item.reason && item.reason.includes('Invalid state transition')
    );
    
    if (invalidStateTransitions.length > 0) {
      message += `\n${invalidStateTransitions.length} submission${invalidStateTransitions.length !== 1 ? 's' : ''} had invalid state transitions. Only submissions in "${validSourceStates.join(', ')}" state can be processed.`;
    }
    
    return {
      success: cleaned > 0,
      cleaned,
      skipped,
      updates: updates.length > 10 ? updates.slice(0, 10) : updates,
      skippedDetails: skippedDetails.length > 10 ? skippedDetails.slice(0, 10) : skippedDetails,
      hasMore: updates.length > 10 || skippedDetails.length > 10,
      totalUpdates: updates.length,
      totalSkipped: skippedDetails.length,
      totalProcessed,
      message
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.warn('Error cleaning product titles:', error);
    throw error;
  } finally {
    if (client && typeof client.release === 'function') {
      await client.release();
    }
  }
}
