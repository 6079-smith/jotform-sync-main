import db from '@/lib/db';

/**
 * Get the timestamp of the most recently created jotform record
 * This represents when data was last fetched from Jotform
 * 
 * @returns {Promise<string|null>} ISO timestamp string or null if no records
 */
export async function getLastJotformFetchTimestamp() {
  const client = await db.getClient();
  
  try {
    // Using the last_updated column from the jotform table
    // This represents when the record was last fetched from Jotform
    const query = `
      SELECT last_updated 
      FROM jotform 
      ORDER BY last_updated DESC 
      LIMIT 1
    `;
    
    const result = await client.query(query);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Get the timestamp from the database
    const lastUpdated = result.rows[0].last_updated;
    
    // Handle potential invalid date values
    if (!lastUpdated) {
      console.warn('No valid last_updated timestamp found in the database');
      return null;
    }
    
    try {
      // PostgreSQL timestamps are already in a format JavaScript can parse
      // But we'll wrap it in a try/catch to handle any potential issues
      return lastUpdated.toISOString ? lastUpdated.toISOString() : new Date(lastUpdated).toISOString();
    } catch (dateError) {
      console.error('Error formatting date:', dateError);
      return null;
    }
  } catch (error) {
    console.error('Error getting last Jotform fetch timestamp:', error);
    return null;
  } finally {
    client.release();
  }
}
