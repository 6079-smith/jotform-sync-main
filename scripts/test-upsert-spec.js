/**
 * Test script to demonstrate specification upsert functionality
 * This script generates a specification for a submission ID, then regenerates it
 * to show that upserts work correctly
 */

const { connectDb } = require('../lib/db');
const { generateSpecification } = require('../lib/specification-generator');

// Usage: node scripts/test-upsert-spec.js SUBMISSION_ID
async function main() {
  const submissionId = process.argv[2];
  
  if (!submissionId) {
    console.error('Usage: node scripts/test-upsert-spec.js SUBMISSION_ID');
    process.exit(1);
  }

  console.log(`Testing specification upsert for submission ID: ${submissionId}`);
  
  // Connect to the database
  const client = await connectDb();
  
  try {
    // First generation - this should create a new specification
    console.log('\n--- FIRST GENERATION ---');
    console.log('Generating specification for the first time...');
    
    const firstResult = await generateSpecification({
      submissionId,
      client,
      options: {
        logLevel: 3 // Detailed logging
      }
    });
    
    console.log(`First generation completed with result: ${JSON.stringify(firstResult, null, 2)}`);
    
    // Second generation - this should update the existing specification
    console.log('\n--- SECOND GENERATION ---');
    console.log('Regenerating specification to test upsert...');
    
    const secondResult = await generateSpecification({
      submissionId,
      client,
      options: {
        logLevel: 3 // Detailed logging
      }
    });
    
    console.log(`Second generation completed with result: ${JSON.stringify(secondResult, null, 2)}`);
    
    // Verify that both operations returned the same specification ID
    if (firstResult.specificationId === secondResult.specificationId) {
      console.log('\n✅ SUCCESS: Both operations returned the same specification ID!');
      console.log(`Specification ID: ${firstResult.specificationId}`);
    } else {
      console.log('\n❌ ERROR: Different specification IDs were returned!');
      console.log(`First ID: ${firstResult.specificationId}`);
      console.log(`Second ID: ${secondResult.specificationId}`);
    }
    
    // Query the database to verify there is only one specification for this submission
    const verifyQuery = `
      SELECT COUNT(*) as count FROM specifications 
      WHERE submission_id = $1
    `;
    
    const verifyResult = await client.query(verifyQuery, [submissionId]);
    const count = verifyResult.rows[0].count;
    
    console.log(`\nNumber of specifications with submission_id ${submissionId}: ${count}`);
    
    if (count === '1') {
      console.log('✅ SUCCESS: Only one specification exists for this submission!');
    } else {
      console.log('❌ ERROR: Multiple specifications exist for this submission!');
    }
    
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    // Close the database connection
    await client.end();
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
