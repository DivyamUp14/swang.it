const mysql = require('mysql2/promise');
require('dotenv').config();

// MySQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vcapp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true // Allow multiple statements in one query
};

// Create connection pool
let pool = null;

// Initialize database connection
function init() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

// Database wrapper class to mimic better-sqlite3 API (but async)
class Database {
  constructor() {
    this.pool = init();
    this._initialized = false;
  }

  // Initialize database (create if not exists, then connect)
  async initialize() {
    if (this._initialized) return;
    
    // First, connect without database to create it if needed
    const tempConfig = { ...dbConfig };
    delete tempConfig.database;
    const tempPool = mysql.createPool(tempConfig);
    
    try {
      const connection = await tempPool.getConnection();
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
      connection.release();
      await tempPool.end();
    } catch (error) {
      console.error('Error creating database:', error);
      throw error;
    }
    
    this._initialized = true;
  }

  // Execute a query (for CREATE TABLE, ALTER TABLE, etc.)
  async exec(sql) {
    const connection = await this.pool.getConnection();
    try {
      // Split multiple statements and execute them
      const statements = sql.split(';').filter(s => s.trim().length > 0);
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed) {
          await connection.query(trimmed);
        }
      }
    } finally {
      connection.release();
    }
  }

  // Prepare a statement (returns a Statement object)
  prepare(sql) {
    return new Statement(this.pool, sql);
  }

  // Pragma equivalent - for MySQL we'll use INFORMATION_SCHEMA
  async pragma(command) {
    // SQLite PRAGMA commands converted to MySQL equivalents
    if (command === 'journal_mode = WAL') {
      // MySQL uses InnoDB which has its own transaction log
      // No equivalent needed, just return success
      return;
    }
    // For other PRAGMA commands, we'll handle them case by case
  }

  // Helper to check if a column exists in a table (replaces PRAGMA table_info)
  async tableInfo(tableName) {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.query(
        `SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as notnull, COLUMN_DEFAULT as dflt_value, COLUMN_KEY as pk
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [dbConfig.database, tableName]
      );
      return rows.map(row => ({
        name: row.name,
        type: row.type,
        notnull: row.notnull === 'NO' ? 1 : 0,
        dflt_value: row.dflt_value,
        pk: row.pk === 'PRI' ? 1 : 0
      }));
    } finally {
      connection.release();
    }
  }

  // Transaction support (async version)
  async transaction(callback) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

// Statement class to mimic better-sqlite3 Statement API (but async)
class Statement {
  constructor(pool, sql) {
    this.pool = pool;
    this.sql = sql;
  }

  // Execute a query and return the result (async)
  async run(...params) {
    const connection = await this.pool.getConnection();
    try {
      const [result] = await connection.query(this.sql, params);
      // Return object similar to better-sqlite3's run() result
      return {
        lastInsertRowid: result.insertId || null,
        changes: result.affectedRows || 0
      };
    } finally {
      connection.release();
    }
  }

  // Get a single row (async)
  async get(...params) {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.query(this.sql, params);
      return rows[0] || undefined;
    } finally {
      connection.release();
    }
  }

  // Get all rows (async)
  async all(...params) {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.query(this.sql, params);
      return rows;
    } finally {
      connection.release();
    }
  }
}

// Create and export database instance
const db = new Database();

module.exports = db;

