const db = require('../lib/db');

async function testDatabaseConnection() {
  console.log('Testing database connection...');
  
  // Test 1: Test connection using testConnection()
  console.log('\n--- Test 1: Testing connection using testConnection() ---');
  const connectionTest = await db.testConnection();
  console.log(`Connection test ${connectionTest ? 'succeeded' : 'failed'}`);
  
  if (!connectionTest) {
    console.error('Failed to connect to the database. Please check your connection settings.');
    process.exit(1);
  }
  
  // Test 2: Test a simple query using pool.query
  console.log('\n--- Test 2: Testing simple query using pool.query ---');
  try {
    const result = await db.query('SELECT NOW() as current_time');
    console.log('Current database time:', result.rows[0].current_time);
  } catch (error) {
    console.error('Error executing query with pool.query:', error);
  }
  
  // Test 3: Test getting a client and running a transaction
  console.log('\n--- Test 3: Testing client connection and transaction ---');
  const client = await db.getClient();
  
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    // Test a simple query
    const versionResult = await client.query('SELECT version()');
    console.log('Database version:', versionResult.rows[0].version.split(' ')[0]);
    
    // Test listing tables
    const tablesResult = await client.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public'`
    );
    
    console.log('\nAvailable tables:');
    tablesResult.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.table_name}`);
    });
    
    // Rollback since we're just testing
    await client.query('ROLLBACK');
    console.log('\nTransaction rolled back (this is expected for testing)');
  } catch (error) {
    console.error('Error during transaction:', error);
    await client.query('ROLLBACK');
  } finally {
    // Always release the client back to the pool
    client.release();
    console.log('\nClient released back to the pool');
  }
  
  // Test 4: Test error handling
  console.log('\n--- Test 4: Testing error handling ---');
  try {
    // This should fail with a syntax error
    await db.query('SELECT * FROM non_existent_table');
  } catch (error) {
    console.log('Expected error caught (this is good):', error.message);
  }
  
  console.log('\nAll tests completed!');
  process.exit(0);
}

// Run the tests
testDatabaseConnection().catch(error => {
  console.error('Unhandled error during tests:', error);
  process.exit(1);
});
