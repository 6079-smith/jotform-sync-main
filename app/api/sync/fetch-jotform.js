import db from '@/lib/db';
import { fetchSubmissions, formatSubmission, insertSubmissions } from '@/lib/jotform-submissions';

export async function fetchNewSubmissions() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT MAX(created_at) as last_date FROM jotform'
    );
    // Get the latest date from the database
    const lastDate = result.rows[0].last_date || '2023-01-01 00:00:00';
    // Last date log removed for performance
    
    // Determine if we should look for new submissions or explicitly skip the latest
    const checkExistingSubmission = await client.query(
      'SELECT submission_id, created_at FROM jotform ORDER BY created_at DESC LIMIT 1'
    );
    
    // If we have submissions in the database, prepare to exclude the latest by ID
    let filter = {};
    if (checkExistingSubmission.rows.length > 0) {
      const latestSubmission = checkExistingSubmission.rows[0];
      // Latest submission log removed for performance
      
      // Use a combined approach: filter by the latest date AND exclude the latest submission ID
      // Format the date as YYYY-MM-DD HH:MM:SS to match Jotform's expected format
      const formattedDate = new Date(lastDate).toISOString().replace('T', ' ').split('.')[0];
      // Formatted date log removed for performance
      
      filter = {
        'id:ne': latestSubmission.submission_id,
        'created_at:gt': formattedDate
      };
      
      // Filter log removed for performance
    } else {
      // If no submissions yet, use a basic date filter with a reasonable start date
      // We'll use the beginning of the previous year as a reasonable default
      const defaultStartDate = new Date();
      defaultStartDate.setFullYear(defaultStartDate.getFullYear() - 1);
      defaultStartDate.setMonth(0, 1); // January 1st
      defaultStartDate.setHours(0, 0, 0, 0);
      
      const formattedDefaultDate = defaultStartDate.toISOString().replace('T', ' ').split('.')[0];
      // Default date log removed for performance
      
      filter = { 'created_at:gt': formattedDefaultDate };
    }

    // Fetch new submissions using the local library
    const submissions = await fetchSubmissions({
      filter,
      limit: 1000,
    });
    
    if (!submissions.length) {
      await client.query('COMMIT');
      return { 
        success: true, 
        fetched: 0, 
        saved: 0, 
        skipped: 0, 
        errorCount: 0,
        message: 'No new submissions available from JotForm.'
      };
    }

    // Format submissions and track invalid ones
    const formattedResults = submissions.map(formatSubmission);
    
    // Separate valid submissions from invalid ones
    const validSubmissions = [];
    const invalidSubmissions = [];
    const invalidReasons = {};
    
    formattedResults.forEach(result => {
      if (result && !result.invalid) {
        validSubmissions.push(result);
      } else if (result && result.invalid) {
        invalidSubmissions.push(result);
        // Track reasons for invalidity
        const reason = result.reason || 'unknown';
        invalidReasons[reason] = (invalidReasons[reason] || 0) + 1;
      }
    });
    
    // Get list of existing submission IDs
    const existingIdsResult = await client.query(
      'SELECT submission_id FROM jotform WHERE submission_id = ANY($1)',
      [validSubmissions.map(s => s.submission_id)]
    );
    
    const existingIds = new Set(existingIdsResult.rows.map(row => row.submission_id));
    
    const existingSubmissions = validSubmissions.filter(s => existingIds.has(s.submission_id));
    
    const newSubmissions = validSubmissions.filter(s => !existingIds.has(s.submission_id));
    
    // Track how many were skipped because they already exist
    const alreadyExistsCount = validSubmissions.length - newSubmissions.length;
    
    // Insert only the new submissions
    const resultInsert = await insertSubmissions(newSubmissions);

    await client.query('COMMIT');
    
    // Create a detailed status message
    let message = '';
    // Initialize all counters
    const fetchedCount = submissions.length;
    const savedCount = resultInsert.rowCount;
    const invalidCount = invalidSubmissions.length;
    const skippedExistingCount = alreadyExistsCount;
    const totalSkipped = invalidCount + skippedExistingCount;
    
    if (fetchedCount > 0) {
      message += `✅ Downloaded ${fetchedCount} new submission${fetchedCount !== 1 ? 's' : ''} from JotForm. `;
      
      if (savedCount > 0) {
        message += `✨ Saved ${savedCount} new submission${savedCount !== 1 ? 's' : ''} to database. `;
      }
      
      if (totalSkipped > 0) {
        message += `ℹ️ Skipped ${totalSkipped} submission${totalSkipped !== 1 ? 's' : ''}: `;
        
        if (skippedExistingCount > 0) {
          message += `${skippedExistingCount} already exist${skippedExistingCount === 1 ? 's' : ''}`;
        }
        
        if (invalidCount > 0) {
          if (skippedExistingCount > 0) message += ', ';
          message += `${invalidCount} invalid`;
          
          // Add reasons if we have them
          if (Object.keys(invalidReasons).length > 0) {
            message += ' (reasons: ' + 
              Object.entries(invalidReasons)
                .map(([reason, count]) => `${reason}: ${count}`)
                .join(', ') + 
              ')';
          }
        }
      }
    } else {
      message = 'No new submissions available from JotForm.';
    }
    
    return {
      success: true,
      fetched: fetchedCount,
      saved: savedCount,
      skipped: totalSkipped,
      skippedExisting: skippedExistingCount,
      skippedInvalid: invalidCount,
      errorCount: 0,
      message,
    };
  } catch (error) {
    console.error('Error in fetchNewSubmissions:', error);
    await client.query('ROLLBACK');
    throw new Error(`Failed to fetch and save submissions: ${error.message}`);
  } finally {
    if (client && typeof client.release === 'function') {
      await client.release();
    }
  }
}