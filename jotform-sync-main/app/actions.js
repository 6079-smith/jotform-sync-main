'use server';

import { getLatestSubmissionDate, getSubmissionsAfterDate, getUnprocessedSubmissions } from "@/lib/submissions";
import { syncSubmissions } from "@/lib/jotform-submissions";
import { generateSpecifications } from "@/lib/specification-generator";
import { getSubmissionsWithStatus, getSubmissionCountsByStatus } from "@/lib/status-helper";
import { getLastJotformFetchTimestamp } from "@/lib/last-fetch-helper";

/**
 * Loads unprocessed submissions from the database
 */
export async function loadUnprocessedSubmissions() {
  try {
    // Get all unprocessed submissions
    let submissions = await getUnprocessedSubmissions();
    

    
    return { 
      submissions,
      timestamp: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    console.error('Error loading unprocessed submissions:', error);
    return { 
      submissions: [],
      timestamp: new Date().toISOString(),
      error: error.message 
    };
  }
}

/**
 * Loads submissions after the latest processed date
 */
export async function loadSubmissions() {
  try {
    // Get the latest processed submission date
    const latestDate = await getLatestSubmissionDate();
    
    // Get submissions after that date
    const submissions = await getSubmissionsAfterDate(latestDate);
    
    return { 
      submissions,
      latestDate,
      timestamp: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    console.error('Error loading submissions:', error);
    return { 
      submissions: [],
      latestDate: null,
      timestamp: new Date().toISOString(),
      error: error.message 
    };
  }
}

/**
 * Loads the most recent submissions regardless of process date
 */
export async function loadAllSubmissions() {
  try {
    // Use the enhanced function that includes status information - get all submissions
    const submissions = await getSubmissionsWithStatus();
    const statusCounts = await getSubmissionCountsByStatus();
    
    // Get the timestamp of the most recently created jotform record from the database
    // This represents when data was last fetched from Jotform
    const lastFetchedTimestamp = await getLastJotformFetchTimestamp();
    
    return { 
      submissions,
      statusCounts,
      timestamp: new Date().toISOString(), // This is for overall data refresh timestamp
      lastFetchedTimestamp, // This is specifically for the Jotform fetch operation
      error: null
    };
  } catch (error) {
    console.error('Error loading all submissions:', error);
    // Even in error case, try to get the last fetch timestamp from database
    let lastFetchedTimestamp = null;
    try {
      lastFetchedTimestamp = await getLastJotformFetchTimestamp();
    } catch (timestampError) {
      console.error('Error getting last fetch timestamp:', timestampError);
    }
    
    return { 
      submissions: [],
      statusCounts: { total: 0 },
      timestamp: new Date().toISOString(),
      lastFetchedTimestamp,
      error: error.message 
    };
  }
}

/**
 * Fetches new submissions from Jotform API and saves them to the database
 */
export async function fetchNewSubmissions() {
  try {
    // Sync submissions from Jotform API
    const result = await syncSubmissions({
      limit: 100 // Fetch up to 100 submissions
    });
    
    // Get updated list of unprocessed submissions
    const submissions = await getUnprocessedSubmissions();
    
    // When we fetch from Jotform, the lastFetchedTimestamp will automatically
    // be updated since new records will be created with the current timestamp
    return {
      success: result.success,
      message: result.message,
      added: result.added,
      submissions,
      timestamp: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    console.error('Error fetching new submissions:', error);
    return {
      success: false,
      message: `Error: ${error.message}`,
      added: 0,
      submissions: [],
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

/**
 * Generates normalized specifications from processed jotform data
 */
export async function generateNormalizedSpecifications(options = {}) {
  try {
    // Set default options for server action
    const defaultOptions = {
      logLevel: 2, // INFO level by default
      batchSize: 50
    };
    
    // Merge with any user-provided options
    const mergedOptions = { ...defaultOptions, ...options };
    
    // Call the specification generator with options
    const result = await generateSpecifications(mergedOptions);
    
    return {
      success: true,
      result,
      timestamp: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    console.error('Error generating specifications:', error);
    
    return {
      success: false,
      result: null,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}
