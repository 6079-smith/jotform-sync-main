/**
 * Database Schema Extraction Script
 * 
 * This script connects to the database using the existing db.js module
 * and extracts the complete database schema, including:
 * - Tables
 * - Columns and their data types
 * - Constraints (Primary Keys, Foreign Keys, Unique)
 * - Indexes
 * 
 * The output is written to db-schema.txt
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

async function getTableSchema(client, tableName) {
  // Get columns
  const columnsQuery = `
    SELECT 
      column_name, 
      data_type, 
      character_maximum_length,
      column_default,
      is_nullable
    FROM 
      information_schema.columns
    WHERE 
      table_name = $1
    ORDER BY 
      ordinal_position
  `;
  
  const columnsResult = await client.query(columnsQuery, [tableName]);
  
  // Get primary keys
  const pkQuery = `
    SELECT
      kcu.column_name
    FROM
      information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    WHERE
      tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_name = $1
    ORDER BY
      kcu.ordinal_position
  `;
  
  const pkResult = await client.query(pkQuery, [tableName]);
  
  // Get foreign keys
  const fkQuery = `
    SELECT
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM
      information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
    WHERE
      tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = $1
  `;
  
  const fkResult = await client.query(fkQuery, [tableName]);
  
  // Get indexes
  const indexQuery = `
    SELECT
      indexname,
      indexdef
    FROM
      pg_indexes
    WHERE
      tablename = $1
  `;
  
  const indexResult = await client.query(indexQuery, [tableName]);
  
  return {
    tableName,
    columns: columnsResult.rows,
    primaryKeys: pkResult.rows,
    foreignKeys: fkResult.rows,
    indexes: indexResult.rows
  };
}

async function getAllTables(client) {
  const tablesQuery = `
    SELECT 
      table_name
    FROM 
      information_schema.tables
    WHERE 
      table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY
      table_name
  `;
  
  const result = await client.query(tablesQuery);
  return result.rows.map(row => row.table_name);
}

function formatSchema(schema) {
  let output = '';
  
  // Table header
  output += `TABLE: ${schema.tableName}\n`;
  output += '='.repeat(50) + '\n\n';
  
  // Columns
  output += 'COLUMNS:\n';
  if (schema.columns.length === 0) {
    output += '  No columns found\n';
  } else {
    schema.columns.forEach(column => {
      let typeInfo = column.data_type;
      if (column.character_maximum_length) {
        typeInfo += `(${column.character_maximum_length})`;
      }
      
      output += `  ${column.column_name} [${typeInfo}]`;
      
      if (column.column_default) {
        output += ` DEFAULT ${column.column_default}`;
      }
      
      if (column.is_nullable === 'NO') {
        output += ' NOT NULL';
      }
      
      output += '\n';
    });
  }
  
  // Primary Keys
  output += '\nPRIMARY KEYS:\n';
  if (schema.primaryKeys.length === 0) {
    output += '  No primary keys defined\n';
  } else {
    const pkColumns = schema.primaryKeys.map(pk => pk.column_name).join(', ');
    output += `  (${pkColumns})\n`;
  }
  
  // Foreign Keys
  output += '\nFOREIGN KEYS:\n';
  if (schema.foreignKeys.length === 0) {
    output += '  No foreign keys defined\n';
  } else {
    schema.foreignKeys.forEach(fk => {
      output += `  ${fk.column_name} -> ${fk.foreign_table_name}(${fk.foreign_column_name})\n`;
    });
  }
  
  // Indexes
  output += '\nINDEXES:\n';
  if (schema.indexes.length === 0) {
    output += '  No indexes defined\n';
  } else {
    schema.indexes.forEach(index => {
      output += `  ${index.indexname}: ${index.indexdef}\n`;
    });
  }
  
  output += '\n\n';
  return output;
}

async function main() {
  let client;
  try {
    // Get client from pool
    client = await db.getClient();
    
    // Get all tables
    const tables = await getAllTables(client);
    
    // Output header
    let output = `DATABASE SCHEMA EXPORT\n`;
    output += `======================\n`;
    output += `Generated: ${new Date().toISOString()}\n\n`;
    output += `Total Tables: ${tables.length}\n\n`;
    
    // If no tables found
    if (tables.length === 0) {
      output += 'No tables found in the database.\n';
    } else {
      // Process each table
      for (const tableName of tables) {
        const tableSchema = await getTableSchema(client, tableName);
        output += formatSchema(tableSchema);
      }
    }
    
    // Write to file
    const outputPath = path.resolve(process.cwd(), 'db-schema.txt');
    fs.writeFileSync(outputPath, output);
    
    console.log(`Schema successfully exported to ${outputPath}`);
    
  } catch (error) {
    console.error('Error extracting database schema:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.release();
    }
    // Close the pool to end the process
    await db.pool.end();
  }
}

// Run the script
main();
