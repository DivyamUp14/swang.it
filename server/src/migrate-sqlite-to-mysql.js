/**
 * Data Migration Script: SQLite to MySQL
 * 
 * This script exports all data from SQLite and imports it into MySQL.
 * Run this ONCE after setting up MySQL and before switching the application to use MySQL.
 * 
 * Usage:
 *   node src/migrate-sqlite-to-mysql.js
 * 
 * Prerequisites:
 *   1. MySQL database must be created and configured in .env
 *   2. All tables must be created in MySQL (run the app once to create tables)
 *   3. SQLite database file must exist at server/vcapp.sqlite
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');

// SQLite connection
const sqlitePath = path.join(__dirname, '..', 'vcapp.sqlite');
const sqliteDb = new Database(sqlitePath);

// MySQL connection config
const mysqlConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vcapp',
  multipleStatements: true
};

// Tables to migrate (in order to respect foreign keys)
const tables = [
  'users',
  'micro_categories',
  'consultant_profiles',
  'requests',
  'sessions',
  'chat_messages',
  'favorites',
  'booking_slots',
  'reviews',
  'payout_requests',
  'invoices',
  'transactions',
  'booking_reminders',
  'discount_codes',
  'audit_logs',
  'system_settings',
  'password_reset_tokens'
];

async function migrateTable(mysqlConn, tableName) {
  console.log(`\nMigrating table: ${tableName}...`);
  
  // Get all data from SQLite
  const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all();
  console.log(`  Found ${rows.length} rows in SQLite`);
  
  if (rows.length === 0) {
    console.log(`  No data to migrate for ${tableName}`);
    return;
  }
  
  // Get column names
  const columns = Object.keys(rows[0]);
  const columnList = columns.map(col => `\`${col}\``).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  
  // Temporarily disable foreign key checks for tables with foreign keys
  const hasForeignKeys = ['requests', 'sessions', 'chat_messages', 'favorites', 'booking_slots', 
                          'reviews', 'payout_requests', 'invoices', 'transactions', 'booking_reminders',
                          'consultant_profiles', 'password_reset_tokens'].includes(tableName);
  
  if (hasForeignKeys) {
    await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 0');
  }
  
  // Clear existing data (optional - comment out if you want to append)
  await mysqlConn.query(`DELETE FROM \`${tableName}\``);
  console.log(`  Cleared existing data in MySQL`);
  
  // Insert data in batches
  // For users table, use INSERT IGNORE to handle duplicate emails (case-insensitive)
  const useIgnore = tableName === 'users';
  const batchSize = 100;
  let inserted = 0;
  let skipped = 0;
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.map(row => columns.map(col => {
      const value = row[col];
      // Handle NULL
      if (value === null) return null;
      
      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString().slice(0, 19).replace('T', ' ');
      }
      
      // Handle ISO 8601 date strings (like '2025-12-04T12:33:27.789Z')
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return value.slice(0, 19).replace('T', ' ');
      }
      
      // Handle booleans
      if (typeof value === 'boolean') return value ? 1 : 0;
      
      return value;
    }));
    
    // For users table, deduplicate by email (case-insensitive) before inserting
    if (tableName === 'users') {
      const seenEmails = new Set();
      const uniqueRows = [];
      const uniqueValues = [];
      
      for (let j = 0; j < batch.length; j++) {
        const email = batch[j].email?.toLowerCase();
        if (!email || !seenEmails.has(email)) {
          seenEmails.add(email);
          uniqueRows.push(batch[j]);
          uniqueValues.push(values[j]);
        } else {
          skipped++;
          console.log(`  Skipping duplicate email: ${batch[j].email}`);
        }
      }
      
      if (uniqueValues.length > 0) {
        const sql = `INSERT IGNORE INTO \`${tableName}\` (${columnList}) VALUES ?`;
        await mysqlConn.query(sql, [uniqueValues]);
        inserted += uniqueValues.length;
      }
    } else {
      const sql = useIgnore 
        ? `INSERT IGNORE INTO \`${tableName}\` (${columnList}) VALUES ?`
        : `INSERT INTO \`${tableName}\` (${columnList}) VALUES ?`;
      try {
        await mysqlConn.query(sql, [values]);
        inserted += batch.length;
      } catch (error) {
        // If duplicate key error, try inserting one by one with IGNORE
        if (error.code === 'ER_DUP_ENTRY') {
          console.log(`  Duplicate detected, inserting row by row...`);
          const singlePlaceholder = columns.map(() => '?').join(', ');
          for (const valueRow of values) {
            try {
              await mysqlConn.query(`INSERT IGNORE INTO \`${tableName}\` (${columnList}) VALUES (${singlePlaceholder})`, valueRow);
              inserted++;
            } catch (e) {
              skipped++;
            }
          }
        } else {
          throw error;
        }
      }
    }
    console.log(`  Inserted ${inserted}/${rows.length} rows${skipped > 0 ? `, skipped ${skipped} duplicates` : ''}...`);
  }
  
  // Re-enable foreign key checks
  if (hasForeignKeys) {
    await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 1');
  }
  
  console.log(`  ✓ Completed migration of ${tableName}: ${inserted} rows${skipped > 0 ? `, skipped ${skipped} rows` : ''}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('SQLite to MySQL Data Migration');
  console.log('='.repeat(60));
  
  // Verify SQLite database exists
  try {
    const test = sqliteDb.prepare('SELECT 1').get();
    console.log('✓ SQLite database connected');
  } catch (error) {
    console.error('✗ Error connecting to SQLite:', error.message);
    process.exit(1);
  }
  
  // Connect to MySQL
  let mysqlConn;
  try {
    mysqlConn = await mysql.createConnection(mysqlConfig);
    console.log('✓ MySQL database connected');
    
    // Test query
    await mysqlConn.query('SELECT 1');
    console.log('✓ MySQL connection verified');
  } catch (error) {
    console.error('✗ Error connecting to MySQL:', error.message);
    console.error('  Make sure MySQL is running and .env is configured correctly');
    process.exit(1);
  }
  
  try {
    // Get row counts from SQLite for verification
    console.log('\n' + '='.repeat(60));
    console.log('SQLite Data Summary:');
    console.log('='.repeat(60));
    const sqliteCounts = {};
    for (const table of tables) {
      try {
        const count = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        sqliteCounts[table] = count.count;
        console.log(`  ${table}: ${count.count} rows`);
      } catch (e) {
        // Table might not exist, skip
        sqliteCounts[table] = 0;
      }
    }
    
    // Migrate each table
    console.log('\n' + '='.repeat(60));
    console.log('Starting Migration...');
    console.log('='.repeat(60));
    
    for (const table of tables) {
      if (sqliteCounts[table] > 0) {
        await migrateTable(mysqlConn, table);
      } else {
        console.log(`\nSkipping ${table} (no data)`);
      }
    }
    
    // Verify migration
    console.log('\n' + '='.repeat(60));
    console.log('Verification:');
    console.log('='.repeat(60));
    
    let allMatch = true;
    for (const table of tables) {
      try {
        const [mysqlRows] = await mysqlConn.query(`SELECT COUNT(*) as count FROM \`${table}\``);
        const mysqlCount = mysqlRows[0].count;
        const sqliteCount = sqliteCounts[table] || 0;
        
        if (mysqlCount === sqliteCount) {
          console.log(`  ✓ ${table}: ${mysqlCount} rows (matches SQLite)`);
        } else {
          console.log(`  ✗ ${table}: MySQL=${mysqlCount}, SQLite=${sqliteCount} (MISMATCH!)`);
          allMatch = false;
        }
      } catch (e) {
        console.log(`  ? ${table}: Error checking (${e.message})`);
      }
    }
    
    if (allMatch) {
      console.log('\n' + '='.repeat(60));
      console.log('✓ Migration completed successfully!');
      console.log('='.repeat(60));
      console.log('\nNext steps:');
      console.log('1. Test your application with MySQL');
      console.log('2. Keep SQLite files as backup until you\'re confident');
      console.log('3. Once verified, you can remove SQLite files (optional)');
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('⚠ Migration completed with mismatches!');
      console.log('Please review the data and re-run if needed.');
      console.log('='.repeat(60));
    }
    
  } catch (error) {
    console.error('\n✗ Migration error:', error);
    throw error;
  } finally {
    await mysqlConn.end();
    sqliteDb.close();
    console.log('\n✓ Connections closed');
  }
}

// Run migration
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

