const { Pool } = require('@neondatabase/serverless');
const config = require('../config');

// Track active connections and queries
let activeConnections = 0;
let totalConnectionsCreated = 0;
let totalConnectionsReleased = 0;
let activeQueries = 0;
let totalQueriesExecuted = 0;
let connectionMap = new Map(); // Map to track connection objects by ID

// Get the connection string based on environment
const databaseUrl = process.env.DATABASE_URL_DEV || config.database?.url || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Database URL is not configured. Please set DATABASE_URL or DATABASE_URL_DEV environment variable.');
}

// Log connection info (without exposing credentials)
const connectionUrlEnd = databaseUrl.substring(databaseUrl.indexOf('@') + 1);
const isSandbox = databaseUrl === process.env.DATABASE_URL_DEV;

// Connection logging removed for performance

// Create a connection pool
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: config.database?.ssl === false ? false : { rejectUnauthorized: false },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000 // How long to wait for a connection to be established
});

// Get a client from the pool
async function getClient() {
  // Generate a unique connection ID
  const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  totalConnectionsCreated++;
  activeConnections++;

  // Client tracking log removed for performance

  try {
    const client = await pool.connect();

    // Track this connection
    connectionMap.set(connectionId, { created: new Date() });

    // Wrap the client to track connection releases
    return {
      ...client,
      connectionId,
      release: async (err) => {
        // Avoid double-release issues
        if (!connectionMap.has(connectionId)) {
          console.warn(`[${new Date().toISOString()}] Attempted to release already released client ${connectionId}`);
          return;
        }

        // Properly handle client release
        if (err) {
          console.error(`[${new Date().toISOString()}] Error releasing database client ${connectionId}:`, err);
        }

        // Update connection tracking
        activeConnections--;
        totalConnectionsReleased++;
        connectionMap.delete(connectionId);

        // Check for connection leaks
        if (activeConnections < 0) {
          console.error(`[${new Date().toISOString()}] ALERT: Connection tracking error. Active connections is negative: ${activeConnections}`);
        }

        try {
          return await client.release(err);
        } catch (releaseError) {
          console.error(`[${new Date().toISOString()}] Error during client.release for ${connectionId}:`, releaseError);
        }
      },
      query: async (text, params) => {
        const queryId = `query_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const shortText = text.substring(0, 100).replace(/\s+/g, ' ').trim() + (text.length > 100 ? '...' : '');

        activeQueries++;
        totalQueriesExecuted++;

        const startTime = Date.now();
        try {
          const result = await client.query(text, params);

          activeQueries--;

          return result;
        } catch (error) {
          activeQueries--;
          console.error(`[${new Date().toISOString()}] Database query ${queryId} error:`, {
            error: error.message,
            query: shortText,
            params: params ? JSON.stringify(params) : 'none',
            duration: Date.now() - startTime
          });
          throw error;
        }
      }
    };
  } catch (error) {
    activeConnections--; // Decrement since connection failed
    console.error(`[${new Date().toISOString()}] Failed to get client ${connectionId}:`, error);
    throw error;
  }
}

// Test the connection
async function testConnection() {
  // Test connection log removed for performance
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    // Success connection log removed for performance
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error connecting to Neon database:`, error);
    return false;
  } finally {
    if (client) {
      // Releasing client log removed for performance
      client.release();
    }
  }
}

// Function to get connection status
function getConnectionStatus() {
  return {
    activeConnections,
    totalConnectionsCreated,
    totalConnectionsReleased,
    activeQueries,
    totalQueriesExecuted,
    connectionDetails: Array.from(connectionMap.entries()).map(([id, details]) => {
      return {
        id,
        createdAt: details.created,
        ageMs: new Date() - details.created
      };
    })
  };
}

// Export the pool and functions
module.exports = {
  query: (text, params) => {
    const queryId = `direct_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return pool.query(text, params)
      .then(result => {
        return result;
      })
      .catch(error => {
        console.error(`[${new Date().toISOString()}] Direct pool query ${queryId} error: ${error.message}`);
        throw error;
      });
  },
  getClient,
  testConnection,
  getConnectionStatus,
  pool, // Export pool for direct access if needed
};
