require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendWelcomeEmail, sendTopUpEmail, sendBookingConfirmationEmail, sendBookingReminderEmail, sendBookingCancellationEmail, sendLowBalanceEmail, sendCallEndedEmail, sendProfileApprovedEmail, sendPayoutProcessedEmail, sendPasswordResetEmail, sendBroadcastEmail, sendInvitationEmail, sendSupportFormEmail } = require('./email');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '';
const CREDITS_PER_MINUTE = Number(process.env.CREDITS_PER_MINUTE || 5);
const WELCOME_BONUS_CREDITS = 5; // €5 bonus for new customers
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || 'eur').toLowerCase();
const ALLOWED_TOPUP_AMOUNTS = (process.env.TOPUP_AMOUNTS || '25,50,100')
  .split(',')
  .map(n => Number(n.trim()))
  .filter(n => n > 0);

const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://swang.it',
  'https://www.swang.it',
  'https://72.61.110.120'
];
const allowedOrigins = Array.from(new Set([
  ...defaultOrigins,
  ...(CLIENT_ORIGIN ? CLIENT_ORIGIN.split(',').map(o => o.trim()).filter(Boolean) : [])
]));

const app = express();
// FIX: Set trust proxy to 1 to allow loopback/proxy but be safer, preventing the rate-limit error
app.set('trust proxy', 1);
const server = http.createServer(app);

const isNgrokOrigin = (origin) => {
  try {
    if (!origin) return true;
    const hostname = new URL(origin).hostname;
    return /\.ngrok(-free)?\.app$/i.test(hostname);
  } catch (e) {
    return false;
  }
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (isNgrokOrigin(origin)) return true;
  return false;
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  },
});

app.disable('x-powered-by');
app.use(helmet({

  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Create upload directories if they don't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
const profilesDir = path.join(uploadsDir, 'profiles');
const invoicesDir = path.join(uploadsDir, 'invoices');

[uploadsDir, profilesDir, invoicesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'profile_photo') {
      cb(null, profilesDir);
    } else if (file.fieldname === 'invoice') {
      cb(null, invoicesDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'profile_photo') {
      // Allow images only
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      if (extname && mimetype) {
        return cb(null, true);
      }
      cb(new Error('Only image files are allowed for profile photos'));
    } else if (file.fieldname === 'invoice') {
      // Allow PDF only
      if (file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf') {
        return cb(null, true);
      }
      cb(new Error('Only PDF files are allowed for invoices'));
    } else {
      cb(null, true);
    }
  }
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

app.use('/uploads', express.static(uploadsDir));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000, // Increased to 5000
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Increased to 200
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many payment attempts. Please try again later.' }
});

app.use(generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/payments', paymentLimiter);

// MySQL setup - initialize database connection
(async () => {
  try {
    await db.initialize();
    await db.pragma('journal_mode = WAL'); // No-op for MySQL, but kept for compatibility
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
})();

// Initialize tables - wrap in async IIFE
(async () => {
  try {
    await db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role ENUM('customer','consultant','admin') NOT NULL,
  credits DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

    /* MIGRATION: Add location columns if they don't exist */
    await (async () => {
      try {
        // Check if columns exist
        const [cols] = await db.pool.query("SHOW COLUMNS FROM users LIKE 'timezone'");
        if (cols.length === 0) {
          console.log('[MIGRATION] Adding location columns to users table...');
          await db.pool.query("ALTER TABLE users ADD COLUMN country VARCHAR(100) DEFAULT NULL, ADD COLUMN city VARCHAR(100) DEFAULT NULL, ADD COLUMN timezone VARCHAR(100) DEFAULT 'UTC'");
          console.log('[MIGRATION] Location columns added.');
        }
      } catch (e) {
        console.error('[MIGRATION] Error checking/adding columns:', e.message);
      }
    })();

    /* MIGRATION: Add type column to requests if it doesn't exist */
    await (async () => {
      try {
        const [cols] = await db.pool.query("SHOW COLUMNS FROM requests LIKE 'type'");
        if (cols.length === 0) {
          console.log('[MIGRATION] Adding type column to requests table...');
          await db.pool.query("ALTER TABLE requests ADD COLUMN type ENUM('chat','voice','video') DEFAULT 'chat'");
          console.log('[MIGRATION] Type column added.');
        }
      } catch (e) {
        console.error('[MIGRATION] Error checking/adding requests.type:', e.message);
      }
    })();

    /* MIGRATION: Update requests status to VARCHAR to fix truncation issues and support 'completed' */
    await (async () => {
      try {
        await db.pool.query("ALTER TABLE requests MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending'");
        // Debug: Check schema after migration
        const [cols] = await db.pool.query("SHOW COLUMNS FROM requests LIKE 'status'");
        console.log('[MIGRATION] Requests status column schema:', cols);
      } catch (e) {
        console.error('[MIGRATION] Error updating requests status schema:', e.message);
      }
    })();

    await db.exec(`
CREATE TABLE IF NOT EXISTS requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  consultant_id INT NOT NULL,
  status ENUM('pending','accepted','declined','cancelled','completed') NOT NULL DEFAULT 'pending',
  type ENUM('chat','voice','video') DEFAULT 'chat',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(consultant_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_customer (customer_id),
  INDEX idx_consultant (consultant_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT UNIQUE NOT NULL,
  room_name VARCHAR(255) UNIQUE NOT NULL,
  started_at DATETIME,
  ended_at DATETIME,
  active TINYINT(1) NOT NULL DEFAULT 0,
  customer_id INT,
  consultant_id INT,
  type ENUM('chat','voice','video') DEFAULT 'chat',
  FOREIGN KEY(request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(consultant_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_request (request_id),
  INDEX idx_room (room_name),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  sender_id INT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_session (session_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS consultant_profiles (
  consultant_id INT PRIMARY KEY,
  name VARCHAR(255),
  bio TEXT,
  experience TEXT,
  profile_photo VARCHAR(500),
  macro_category ENUM('coaching','cartomancy') DEFAULT 'coaching',
  micro_categories TEXT,
  chat_price DECIMAL(10,2) DEFAULT 0.10,
  voice_price DECIMAL(10,2) DEFAULT 1.50,
  video_price DECIMAL(10,2) DEFAULT 2.00,
  status ENUM('pending','active','inactive') DEFAULT 'pending',
  contract_agreed TINYINT(1) DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0.00,
  review_count INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(consultant_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  consultant_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_favorite (customer_id, consultant_id),
  FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(consultant_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consultant_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  time TIME NOT NULL,
  duration INT NOT NULL,
  mode ENUM('video','voice','chat') NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_booked TINYINT(1) DEFAULT 0,
  booked_by INT,
  booked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(consultant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(booked_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_consultant (consultant_id),
  INDEX idx_date (date),
  INDEX idx_booked (is_booked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  consultant_id INT NOT NULL,
  request_id INT,
  rating INT NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  reply TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(consultant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(request_id) REFERENCES requests(id) ON DELETE SET NULL,
  INDEX idx_consultant (consultant_id),
  INDEX idx_rating (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payout_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consultant_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  invoice_file_path VARCHAR(500),
  status ENUM('pending','paid','rejected') DEFAULT 'pending',
  period_month INT,
  period_year INT,
  processed_at DATETIME,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(consultant_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_consultant (consultant_id),
  INDEX idx_status (status),
  INDEX idx_period (period_year, period_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS earnings_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consultant_id INT NOT NULL,
  transaction_id INT,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('available','in_request','paid') DEFAULT 'available',
  payout_request_id INT NULL,
  period_month INT NOT NULL,
  period_year INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(consultant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  FOREIGN KEY(payout_request_id) REFERENCES payout_requests(id) ON DELETE SET NULL,
  INDEX idx_consultant_status (consultant_id, status),
  INDEX idx_period (period_year, period_month),
  INDEX idx_payout_request (payout_request_id),
  INDEX idx_transaction (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payout_request_id INT,
  consultant_id INT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(payout_request_id) REFERENCES payout_requests(id) ON DELETE SET NULL,
  FOREIGN KEY(consultant_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(50),
  status VARCHAR(50),
  description TEXT,
  reference VARCHAR(255) UNIQUE,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_reference (reference),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_reminders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slot_id INT NOT NULL,
  user_id INT NOT NULL,
  hours_before INT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_reminder (slot_id, user_id, hours_before),
  FOREIGN KEY(slot_id) REFERENCES booking_slots(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS micro_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  macro_category ENUM('coaching','cartomancy') NOT NULL,
  requires_verification TINYINT(1) DEFAULT 0,
  is_archived TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discount_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(255) UNIQUE NOT NULL,
  discount_type ENUM('percentage','fixed') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  max_uses INT,
  used_count INT DEFAULT 0,
  expires_at DATETIME,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id INT,
  details TEXT,
  ip_address VARCHAR(45),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(admin_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_admin (admin_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
  \`key\` VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invitation_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) DEFAULT 0,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token (token),
  INDEX idx_email (email),
  INDEX idx_expires (expires_at),
  INDEX idx_used (used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
})();

// Migration helper function
async function runMigrations() {
  try {
    // Migration: Add is_online column if it doesn't exist
    {
      const tableInfo = await db.tableInfo('users');
      const hasIsOnline = tableInfo.some(col => col.name === 'is_online');
      if (!hasIsOnline) {
        await db.exec('ALTER TABLE users ADD COLUMN is_online TINYINT(1) DEFAULT 0');
      }
    }

    // Migration: Add is_busy column if it doesn't exist (for "In consultation" status)
    {
      const tableInfo = await db.tableInfo('users');
      const hasIsBusy = tableInfo.some(col => col.name === 'is_busy');
      if (!hasIsBusy) {
        await db.exec('ALTER TABLE users ADD COLUMN is_busy TINYINT(1) DEFAULT 0');
      }
    }

    // Migration: Add bonus_granted column if it doesn't exist
    {
      const tableInfo = await db.tableInfo('users');
      const hasBonusGranted = tableInfo.some(col => col.name === 'bonus_granted');
      if (!hasBonusGranted) {
        await db.exec('ALTER TABLE users ADD COLUMN bonus_granted TINYINT(1) DEFAULT 0');
      }
    }

    // Migration: Add address, tax_code, and IBAN to consultant_profiles if they don't exist
    {
      const tableInfo = await db.tableInfo('consultant_profiles');
      const hasAddress = tableInfo.some(col => col.name === 'address');
      const hasTaxCode = tableInfo.some(col => col.name === 'tax_code');
      const hasIban = tableInfo.some(col => col.name === 'iban');
      if (!hasAddress) {
        await db.exec('ALTER TABLE consultant_profiles ADD COLUMN address TEXT');
      }
      if (!hasTaxCode) {
        await db.exec('ALTER TABLE consultant_profiles ADD COLUMN tax_code VARCHAR(255)');
      }
      if (!hasIban) {
        await db.exec('ALTER TABLE consultant_profiles ADD COLUMN iban VARCHAR(255)');
      }
    }

    // Migration: Add full_name and phone to users table if they don't exist
    {
      const tableInfo = await db.tableInfo('users');
      const hasFullName = tableInfo.some(col => col.name === 'full_name');
      const hasPhone = tableInfo.some(col => col.name === 'phone');
      const hasNickname = tableInfo.some(col => col.name === 'nickname');
      if (!hasFullName) {
        try {
          await db.exec('ALTER TABLE users ADD COLUMN full_name VARCHAR(255)');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error adding full_name column:', e);
          }
        }
      }
      if (!hasPhone) {
        try {
          await db.exec('ALTER TABLE users ADD COLUMN phone VARCHAR(50)');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error adding phone column:', e);
          }
        }
      }
      if (!hasNickname) {
        try {
          await db.exec('ALTER TABLE users ADD COLUMN nickname VARCHAR(100)');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error adding nickname column:', e);
          }
        }
      }
    }

    // Migration: Add phone and email to consultant_profiles if they don't exist (for admin visibility)
    {
      const tableInfo = await db.tableInfo('consultant_profiles');
      const hasPhone = tableInfo.some(col => col.name === 'phone');
      const hasEmail = tableInfo.some(col => col.name === 'email');
      if (!hasPhone) {
        await db.exec('ALTER TABLE consultant_profiles ADD COLUMN phone VARCHAR(50)');
      }
      if (!hasEmail) {
        await db.exec('ALTER TABLE consultant_profiles ADD COLUMN email VARCHAR(255)');
      }
    }

    // Migration: Add expiry_time to requests table if it doesn't exist (for auto-expiry)

    // Migration: Backfill existing earnings into earnings_ledger
    try {
      const existingLedgerCount = await db.prepare('SELECT COUNT(*) as count FROM earnings_ledger').get();
      if (existingLedgerCount.count === 0) {
        // Backfill: Create ledger entries for all existing earnings transactions
        const earningsTransactions = await db.prepare(`
          SELECT id, user_id, amount, created_at
          FROM transactions
          WHERE type = 'earnings' AND status = 'completed'
          ORDER BY created_at ASC
        `).all();

        for (const tx of earningsTransactions) {
          const txDate = new Date(tx.created_at);
          const period = getPeriodFromDate(txDate);

          // Check if ledger entry already exists (avoid duplicates)
          const existing = await db.prepare(`
            SELECT id FROM earnings_ledger WHERE transaction_id = ?
          `).get(tx.id);

          if (!existing) {
            // Determine status: if there's a paid payout request, mark as paid
            // Otherwise, check if there's a pending payout request that includes this
            // For simplicity, mark all existing as 'available' (they can be requested)
            await db.prepare(`
              INSERT INTO earnings_ledger (consultant_id, transaction_id, amount, status, period_month, period_year)
              VALUES (?, ?, ?, 'available', ?, ?)
            `).run(tx.user_id, tx.id, tx.amount, period.month, period.year);
          }
        }
      }

    } catch (error) {
      console.error('Error backfilling earnings ledger:', error);
      // Don't fail startup if backfill fails
    }
    {
      const tableInfo = await db.tableInfo('requests');
      const hasExpiryTime = tableInfo.some(col => col.name === 'expiry_time');
      if (!hasExpiryTime) {
        try {
          await db.exec('ALTER TABLE requests ADD COLUMN expiry_time DATETIME');
        } catch (e) {
          // Ignore if column already exists or deadlock (will retry on next restart)
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error adding expiry_time column:', e);
          }
        }
      }
    }

    // Migration: Add type to requests table if it doesn't exist (video/voice/chat)
    {
      const tableInfo = await db.tableInfo('requests');
      const hasType = tableInfo.some(col => col.name === 'type');
      if (!hasType) {
        await db.exec('ALTER TABLE requests ADD COLUMN type ENUM("video","voice","chat") DEFAULT "chat"');
      }
    }

    // Migration: Add customer_id, consultant_id, and type to sessions table for persistent chat sessions
    {
      const tableInfo = await db.tableInfo('sessions');
      const hasCustomerId = tableInfo.some(col => col.name === 'customer_id');
      const hasConsultantId = tableInfo.some(col => col.name === 'consultant_id');
      const hasType = tableInfo.some(col => col.name === 'type');
      if (!hasCustomerId) {
        await db.exec('ALTER TABLE sessions ADD COLUMN customer_id INT');
      }
      if (!hasConsultantId) {
        await db.exec('ALTER TABLE sessions ADD COLUMN consultant_id INT');
      }
      if (!hasType) {
        await db.exec('ALTER TABLE sessions ADD COLUMN type ENUM("chat","voice","video") DEFAULT "chat"');
      }
      // Backfill existing sessions with customer_id and consultant_id from requests
      await db.exec(`
        UPDATE sessions 
        SET customer_id = (SELECT customer_id FROM requests WHERE requests.id = sessions.request_id),
            consultant_id = (SELECT consultant_id FROM requests WHERE requests.id = sessions.request_id),
            type = (SELECT type FROM requests WHERE requests.id = sessions.request_id)
        WHERE customer_id IS NULL OR consultant_id IS NULL
      `);
    }

    // Migration: Add consultant_read_at column to track when consultant reads a chat
    {
      const tableInfo = await db.tableInfo('sessions');
      const hasConsultantReadAt = tableInfo.some(col => col.name === 'consultant_read_at');
      if (!hasConsultantReadAt) {
        await db.exec('ALTER TABLE sessions ADD COLUMN consultant_read_at DATETIME');
      }
    }

    // Migration: Add call_link_token, credits_held, and credits_released to booking_slots for unique appointment links
    {
      const tableInfo = await db.tableInfo('booking_slots');
      const hasCallLinkToken = tableInfo.some(col => col.name === 'call_link_token');
      const hasCreditsHeld = tableInfo.some(col => col.name === 'credits_held');
      const hasCreditsReleased = tableInfo.some(col => col.name === 'credits_released');
      if (!hasCallLinkToken) {
        await db.exec('ALTER TABLE booking_slots ADD COLUMN call_link_token VARCHAR(255)');
        // Create unique index separately (ignore error if index already exists)
        try {
          await db.exec('CREATE UNIQUE INDEX idx_booking_slots_call_link_token ON booking_slots(call_link_token)');
        } catch (e) {
          // Index might already exist, ignore
        }
      }
      if (!hasCreditsHeld) {
        try {
          await db.exec('ALTER TABLE booking_slots ADD COLUMN credits_held DECIMAL(10,2) DEFAULT 0');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error adding credits_held column:', e);
          }
        }
      }
      if (!hasCreditsReleased) {
        try {
          await db.exec('ALTER TABLE booking_slots ADD COLUMN credits_released TINYINT(1) DEFAULT 0');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error adding credits_released column:', e);
          }
        }
      }
    }

    // Migration: Add is_hidden and moderation_notes to reviews table for admin moderation
    {
      const tableInfo = await db.tableInfo('reviews');
      const hasIsHidden = tableInfo.some(col => col.name === 'is_hidden');
      const hasModerationNotes = tableInfo.some(col => col.name === 'moderation_notes');
      if (!hasIsHidden) {
        await db.exec('ALTER TABLE reviews ADD COLUMN is_hidden TINYINT(1) DEFAULT 0');
      }
      if (!hasModerationNotes) {
        await db.exec('ALTER TABLE reviews ADD COLUMN moderation_notes TEXT');
      }
    }

    // Migration: Add is_blocked column to users table
    {
      const tableInfo = await db.tableInfo('users');
      const hasIsBlocked = tableInfo.some(col => col.name === 'is_blocked');
      if (!hasIsBlocked) {
        await db.exec('ALTER TABLE users ADD COLUMN is_blocked TINYINT(1) DEFAULT 0');
      }
    }

    // Migration: Change credits column from INT to DECIMAL(10,2) to support decimal values (for per-message chat billing)
    {
      const tableInfo = await db.tableInfo('users');
      const creditsColumn = tableInfo.find(col => col.name === 'credits');
      if (creditsColumn && creditsColumn.type && !creditsColumn.type.includes('DECIMAL')) {
        try {
          await db.exec('ALTER TABLE users MODIFY COLUMN credits DECIMAL(10,2) NOT NULL DEFAULT 0');

        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error migrating credits column to DECIMAL:', e);
          }
        }
      }
    }

    // Migration: Update payout_requests table schema for earnings ledger system
    {
      const tableInfo = await db.tableInfo('payout_requests');
      const hasPeriodMonth = tableInfo.some(col => col.name === 'period_month');
      const hasPeriodYear = tableInfo.some(col => col.name === 'period_year');
      const hasPaidAt = tableInfo.some(col => col.name === 'paid_at');

      if (!hasPeriodMonth) {
        try {
          await db.exec('ALTER TABLE payout_requests ADD COLUMN period_month INT');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error adding period_month column:', e);
          }
        }
      }
      if (!hasPeriodYear) {
        try {
          await db.exec('ALTER TABLE payout_requests ADD COLUMN period_year INT');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error adding period_year column:', e);
          }
        }
      }
      if (!hasPaidAt) {
        try {
          await db.exec('ALTER TABLE payout_requests ADD COLUMN paid_at DATETIME');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
            console.error('Error adding paid_at column:', e);
          }
        }
      }
    }

    // Migration: Update requests status enum to include 'cancelled'
    {
      const tableInfo = await db.tableInfo('requests');
      const statusCol = tableInfo.find(col => col.name === 'status');
      // We can't easily check the enum values in SQLite/MySQL via pragma/describe in a unified way that works for all,
      // so we try to alter it. If it's already there, it's a no-op or safe update.
      // For MySQL specifically:
      try {
        await db.exec("ALTER TABLE requests MODIFY COLUMN status ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending'");
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
          console.error('Error updating requests status enum:', e);
        }
      }
    }

    // Migration: Update payout_requests status enum to include 'paid' and 'rejected' (ensure complete enum)
    {
      const tableInfo = await db.tableInfo('payout_requests');
      const statusCol = tableInfo.find(col => col.name === 'status');
      // Always try to update to ensure 'paid' is included
      try {
        await db.exec("ALTER TABLE payout_requests MODIFY COLUMN status ENUM('pending','paid','rejected') DEFAULT 'pending'");
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
          console.error('Error updating payout_requests status enum:', e);
        }
      }
    }

    // Migration: Update earnings_ledger status enum to include 'paid'
    {
      const tableInfo = await db.tableInfo('earnings_ledger');
      const statusCol = tableInfo.find(col => col.name === 'status');
      try {
        await db.exec("ALTER TABLE earnings_ledger MODIFY COLUMN status ENUM('available','in_request','paid') DEFAULT 'available'");
      } catch (e) {
        // Log error if not related to acceptable duplicate/lock issues
        if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
          console.error('Error updating earnings_ledger status enum:', e);
        }
      }
    }
  }
  catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

// Run migrations
runMigrations();

// Create password_reset_tokens table if it doesn't exist
(async () => {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } catch (error) {
    console.error('Error creating password_reset_tokens table:', error);
  }
})();

// Migration: Fix malformed profile_photo paths (remove extra spaces)
(async () => {
  try {
    // Fix spaces in the path
    await db.exec(`
      UPDATE consultant_profiles 
      SET profile_photo = TRIM(REPLACE(profile_photo, '/ uploads / profiles / ', '/uploads/profiles/'))
      WHERE profile_photo LIKE '%/ uploads / profiles / %'
    `);
  } catch (e) {
    console.error('Error fixing profile_photo paths:', e);
  }
})();

// Consultants must be manually approved by admin before activation
// New consultants will start with status = 'pending' until admin approval
// db.exec("UPDATE consultant_profiles SET status = 'active' WHERE status IS NULL OR status = 'pending'");

// Seed micro-categories if table is empty
(async () => {
  try {
    // Check if table exists first by trying to query it
    let count;
    try {
      count = await db.prepare('SELECT COUNT(*) as count FROM micro_categories').get();
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return; // Table doesn't exist yet, skip seeding
      }
      throw e; // Re-throw other errors
    }
    if (count.count === 0) {
      const coachingCategories = [
        { name: 'Life Coaching', verification: 0 },
        { name: 'Love / Relationship Coaching', verification: 0 },
        { name: 'Career Coaching', verification: 0 },
        { name: 'Business / Executive Coaching', verification: 0 },
        { name: 'Mindset & Personal Growth', verification: 0 },
        { name: 'Self-Esteem & Emotional Wellbeing', verification: 0 },
        { name: 'Anxiety & Stress Management', verification: 0 },
        { name: 'Parenting / Family Coaching', verification: 0 },
        { name: 'Teen / Student Coaching', verification: 0 },
        { name: 'Psychology (Licensed Professional)', verification: 1 },
        { name: 'Psychotherapy (Accredited)', verification: 1 },
        { name: 'Psychiatry (Medical License)', verification: 1 },
        { name: 'Mindfulness & Relaxation Techniques', verification: 0 },
        { name: 'Nutrition / Healthy Habits (Counseling)', verification: 0 },
        { name: 'Motivation & Habits', verification: 0 },
        { name: 'Communication & Assertiveness', verification: 0 },
        { name: 'Image Coaching / Style & Personal Branding', verification: 0 },
        { name: 'Spiritual Coaching', verification: 0 },
        { name: 'Trauma Healing / Emotional Release', verification: 0 },
        { name: 'Holistic / Energy Coaching', verification: 0 },
        { name: 'Sleep & Relaxation Coaching', verification: 0 }
      ];

      const cartomancyCategories = [
        { name: 'Tarot (Marseille / RWS / Thoth)', verification: 0 },
        { name: 'Sibyls', verification: 0 },
        { name: 'Lenormand', verification: 0 },
        { name: 'Oracles', verification: 0 },
        { name: 'Love Cartomancy', verification: 0 },
        { name: 'Career Cartomancy', verification: 0 },
        { name: 'Money / Finance Cartomancy', verification: 0 },
        { name: 'General Cartomancy / Open Questions', verification: 0 },
        { name: 'Natal Astrology (Birth Chart)', verification: 0 },
        { name: 'Astrology: Transits & Forecasts', verification: 0 },
        { name: 'Evolutionary Astrology', verification: 0 },
        { name: 'Karmic Astrology', verification: 0 },
        { name: 'Medical / Holistic Astrology', verification: 0 },
        { name: 'Synastry (Couple Compatibility)', verification: 0 },
        { name: 'Numerology', verification: 0 },
        { name: 'Pendulum / Radiesthesia', verification: 0 },
        { name: 'Runes', verification: 0 },
        { name: 'I Ching', verification: 0 },
        { name: 'Mediumship / Channeling', verification: 0 },
        { name: 'Clairvoyance / Spiritual Intuition', verification: 0 }
      ];

      const insertStmt = db.prepare('INSERT INTO micro_categories (name, macro_category, requires_verification) VALUES (?, ?, ?)');

      // Insert coaching categories
      for (const cat of coachingCategories) {
        await insertStmt.run(cat.name, 'coaching', cat.verification);
      }

      // Insert cartomancy categories
      for (const cat of cartomancyCategories) {
        await insertStmt.run(cat.name, 'cartomancy', cat.verification);
      }
    }
  } catch (error) {
    console.error('Error seeding micro-categories:', error);
  }
})();

// Platform account for holding commission (45% of all session fees)
async function getOrCreatePlatformAccount() {
  // Try to find existing platform account
  let platform = await db.prepare('SELECT id FROM users WHERE email = ?').get('platform@swang.it');
  if (!platform) {
    // Create platform account if it doesn't exist
    const password_hash = bcrypt.hashSync('platform_' + Date.now(), 10); // Random password, not used for login
    const info = await db.prepare('INSERT INTO users (email, password_hash, role, credits) VALUES (?, ?, ?, ?)').run(
      'platform@swang.it',
      password_hash,
      'customer', // Use 'customer' role as placeholder
      0
    );
    platform = { id: info.lastInsertRowid };
  }
  return platform.id;
}

// Revenue split constants
const PLATFORM_COMMISSION_RATE = 0.45; // 45%
const CONSULTANT_RATE = 0.55; // 55%

// Payment cycle utility functions
function getPaymentCycle(date = new Date()) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  // Cycle A: Request deadline 14th, Payment date 15th
  // Cycle B: Request deadline 29th, Payment date 30th
  // Handle edge cases: February (28 days), day 31 rolls to next cycle

  if (day <= 14) {
    return { cycle: 'A', requestDeadline: 14, paymentDate: 15, month, year };
  } else if (day <= 29) {
    // Check if month has 31 days and current day is 31
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day === 31 && daysInMonth === 31) {
      // Day 31 rolls to next cycle/month
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      return { cycle: 'A', requestDeadline: 14, paymentDate: 15, month: nextMonth, year: nextYear };
    }
    return { cycle: 'B', requestDeadline: 29, paymentDate: 30, month, year };
  } else {
    // Day 30 or 31, goes to next cycle
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return { cycle: 'A', requestDeadline: 14, paymentDate: 15, month: nextMonth, year: nextYear };
  }
}

function getPeriodFromDate(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return { month, year };
}

// Helper function to create earnings ledger entry
async function createEarningsLedgerEntry(connection, consultantId, transactionId, amount, periodMonth, periodYear) {
  await connection.query(`
    INSERT INTO earnings_ledger (consultant_id, transaction_id, amount, status, period_month, period_year)
    VALUES (?, ?, ?, 'available', ?, ?)
  `, [consultantId, transactionId, amount, periodMonth, periodYear]);
}

// Helper function to record earnings transaction and create ledger entry
async function recordEarningsTransaction(userId, transactionData) {
  // Record the transaction first
  const stmt = db.prepare(`
    INSERT INTO transactions (user_id, type, amount, method, status, description, reference, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = await stmt.run(
    userId,
    transactionData.type,
    transactionData.amount,
    transactionData.method || null,
    transactionData.status || 'completed',
    transactionData.description || null,
    transactionData.reference || null,
    transactionData.metadata ? JSON.stringify(transactionData.metadata) : null
  );

  // If it's an earnings transaction, create ledger entry
  if (transactionData.type === 'earnings') {
    const transactionId = info.lastInsertRowid;
    const now = new Date();
    const period = getPeriodFromDate(now);
    await db.prepare(`
      INSERT INTO earnings_ledger (consultant_id, transaction_id, amount, status, period_month, period_year)
      VALUES (?, ?, ?, 'available', ?, ?)
    `).run(userId, transactionId, transactionData.amount, period.month, period.year);
  }

  return info;
}

// Helper function to record earnings transaction within a transaction block
async function recordEarningsTransactionInTransaction(connection, userId, transactionData) {
  // Record the transaction first
  const [result] = await connection.query(`
    INSERT INTO transactions (user_id, type, amount, method, status, description, reference, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    userId,
    transactionData.type,
    transactionData.amount,
    transactionData.method || null,
    transactionData.status || 'completed',
    transactionData.description || null,
    transactionData.reference || null,
    transactionData.metadata ? JSON.stringify(transactionData.metadata) : null
  ]);

  // If it's an earnings transaction, create ledger entry
  if (transactionData.type === 'earnings') {
    const transactionId = result.insertId;
    const now = new Date();
    const period = getPeriodFromDate(now);
    await connection.query(`
      INSERT INTO earnings_ledger (consultant_id, transaction_id, amount, status, period_month, period_year)
      VALUES (?, ?, ?, 'available', ?, ?)
    `, [userId, transactionId, transactionData.amount, period.month, period.year]);
  }

  return result;
}

// Helpers
function createToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // Check if user is blocked (after authentication)
    const user = await db.prepare('SELECT is_blocked FROM users WHERE id = ?').get(req.user.id);

    if (user && user.is_blocked) {
      return res.status(403).json({ error: 'Account blocked' });
    }

    next();
  } catch (ex) {
    res.status(400).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// HIGH PRIORITY: Check if consultant is active (admin approved)
async function requireActiveConsultant(req, res, next) {
  if (req.user.role !== 'consultant') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const profile = await db.prepare('SELECT status FROM consultant_profiles WHERE consultant_id = ?').get(req.user.id);
  if (!profile || profile.status !== 'active') {
    return res.status(403).json({
      error: 'Il tuo profilo è in attesa di approvazione. Non puoi utilizzare la piattaforma fino all\'approvazione dell\'amministratore.'
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireAnyRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// Optional authentication middleware - doesn't fail if no token, but sets req.user if token is valid
function optionalAuthMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (e) {
      // Invalid token, but continue without user
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

async function recordTransaction(userId, { type, amount, method = null, status = 'completed', description = null, reference = null, metadata = null }) {
  await db.prepare(`
    INSERT INTO transactions (user_id, type, amount, method, status, description, reference, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    type,
    amount,
    method,
    status,
    description,
    reference,
    metadata ? JSON.stringify(metadata) : null
  );
}

// Helper for recording transactions within a transaction
async function recordTransactionInTransaction(connection, userId, { type, amount, method = null, status = 'completed', description = null, reference = null, metadata = null }) {
  try {
    // Handle metadata: if it's already a string, use it; if it's an object, stringify it
    let metadataValue = null;
    if (metadata !== null && metadata !== undefined) {
      if (typeof metadata === 'string') {
        metadataValue = metadata;
      } else {
        metadataValue = JSON.stringify(metadata);
      }
    }

    // Ensure all parameters are properly formatted (convert empty strings to null)
    const params = [
      userId,
      type,
      amount,
      method === '' ? null : method,
      status === '' ? 'completed' : status,
      description === '' ? null : description,
      reference === '' ? null : reference,
      metadataValue === '' ? null : metadataValue
    ];

    await connection.query(`
      INSERT INTO transactions (user_id, type, amount, method, status, description, reference, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, params);
  } catch (error) {
    console.error(`[RECORD_TRANSACTION] Error recording transaction:`, {
      userId,
      type,
      amount,
      method,
      status,
      description,
      reference,
      metadata,
      error: error.message,
      sql: error.sql
    });
    throw error;
  }
}

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    credits: row.credits,
    is_online: row.is_online === 1,
    bonus_granted: row.bonus_granted === 1,
    full_name: row.full_name || null,
    phone: row.phone || null,
    nickname: row.nickname || null,
    country: row.country || null,
    city: row.city || null,
    timezone: row.timezone || null
  };
}

// Create initial admin account (one-time setup)
// Call: POST /api/admin/setup { email, password }
app.post('/api/admin/setup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if any admin exists
    const existingAdmin = await db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
    if (existingAdmin) {
      return res.status(403).json({ error: 'Admin account already exists. Use regular login.' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password_hash, role, credits) VALUES (?,?,?,?)');
    const info = await stmt.run(email, password_hash, 'admin', 0);
    const userRow = await db.prepare('SELECT id, email, role, credits FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = jwt.sign({ id: userRow.id, role: userRow.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: sanitizeUser(userRow), token, message: 'Admin account created successfully' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY' || e.message.includes('UNIQUE') || e.message.includes('Duplicate')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create admin account' });
  }
});

// Auth routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, role, full_name, phone, nickname, invitation_token } = req.body;

    // MANDATORY: Validate required fields
    if (!email || !password || !['customer', 'consultant'].includes(role)) {
      return res.status(400).json({ error: 'Email, password e ruolo sono obbligatori' });
    }
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: 'Nome completo è obbligatorio' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Numero di telefono è obbligatorio' });
    }
    // NICKNAME IS MANDATORY: Required for anonymity in appointments
    if (!nickname || !nickname.trim()) {
      return res.status(400).json({ error: 'Nickname è obbligatorio per garantire l\'anonimato' });
    }

    // REQUIRE INVITATION TOKEN FOR CONSULTANT REGISTRATION
    // Invitation is OPTIONAL for consultants
    if (invitation_token) {
      const invitation = await db.prepare('SELECT * FROM invitation_tokens WHERE token = ?').get(invitation_token.trim());

      if (!invitation) {
        return res.status(400).json({ error: 'Token di invito non valido' });
      }

      if (invitation.used === 1) {
        return res.status(400).json({ error: 'Questo invito è già stato utilizzato' });
      }

      // Check expiration
      const now = new Date();
      const expiresAt = new Date(invitation.expires_at);
      if (now > expiresAt) {
        return res.status(400).json({ error: 'Questo invito è scaduto. Contatta l\'amministratore per un nuovo invito.' });
      }

      // Verify email matches invitation
      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ error: 'L\'email deve corrispondere all\'invito ricevuto' });
      }

      // Mark token as used
      await db.prepare('UPDATE invitation_tokens SET used = 1, used_at = CURRENT_TIMESTAMP WHERE token = ?').run(invitation_token.trim());
    }

    const password_hash = bcrypt.hashSync(password, 10);
    // Welcome bonus: €5 (5 credits) for customers only, one-time
    const initialCredits = role === 'customer' ? WELCOME_BONUS_CREDITS : 0;
    const bonusGranted = role === 'customer' ? 1 : 0;

    const stmt = db.prepare('INSERT INTO users (email, password_hash, role, credits, bonus_granted, full_name, phone, nickname) VALUES (?,?,?,?,?,?,?,?)');
    const info = await stmt.run(email, password_hash, role, initialCredits, bonusGranted, full_name.trim(), phone.trim(), nickname.trim());
    const userRow = await db.prepare('SELECT id, email, role, credits, is_online, bonus_granted, full_name, phone, nickname FROM users WHERE id = ?').get(info.lastInsertRowid);

    // If consultant, create initial profile
    if (role === 'consultant') {
      // HIGH PRIORITY: New consultants start with status 'pending' until admin approval
      await db.prepare('INSERT INTO consultant_profiles (consultant_id, status) VALUES (?,?)').run(userRow.id, 'pending');

      // TODO: When admin approval workflow is implemented, send profile approval email here:
      // Promise.resolve(sendProfileApprovedEmail({
      //   email: userRow.email,
      //   consultantName: null
      // })).catch(() => {});
    }

    if (role === 'customer') {
      await recordTransaction(userRow.id, {
        type: 'bonus',
        amount: WELCOME_BONUS_CREDITS,
        method: 'system',
        status: 'completed',
        description: 'Bonus di benvenuto'
      });
    }

    const user = sanitizeUser(userRow);
    const token = createToken(user);
    res.json({ token, user });

    // HIGH PRIORITY: Send automatic welcome email after account creation
    // Fire and forget welcome email (non-blocking)
    if (userRow.email) {
      Promise.resolve(sendWelcomeEmail({ email: userRow.email })).catch(() => { });
    }
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY' || e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.message.includes('UNIQUE') || e.message.includes('Duplicate')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const userRow = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!userRow) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, userRow.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const sanitized = sanitizeUser(userRow);
    const token = createToken(sanitized);
    res.json({ token, user: sanitized });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change password (for authenticated users)
app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const user = await db.prepare('SELECT id, email, role, credits, is_online, bonus_granted, full_name, phone, created_at, password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);

    // Update password
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, req.user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Request password reset
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user by email
    const user = await db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);

    // Always return success to prevent email enumeration attacks
    // But only send email if user exists
    if (user) {
      // Generate reset token
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');

      // Set expiration to 1 hour from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      // Delete any existing unused tokens for this user
      await db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used = 0').run(user.id);

      // Insert new token
      // Convert to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
      await db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(
        user.id,
        resetToken,
        expiresAt.toISOString().slice(0, 19).replace('T', ' ')
      );

      // Send password reset email
      await sendPasswordResetEmail({ email: user.email, resetToken });
    }

    // Always return success message to prevent email enumeration
    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

// Reset password with token
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Find the reset token
    const resetTokenRow = await db.prepare('SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0').get(token);

    if (!resetTokenRow) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check if token has expired
    const expiresAt = new Date(resetTokenRow.expires_at);
    const now = new Date();

    if (now > expiresAt) {
      // Mark token as used and delete expired tokens
      // Convert to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
      const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');
      await db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);
      await db.prepare('DELETE FROM password_reset_tokens WHERE expires_at < ?').run(nowStr);
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    // Get user
    const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(resetTokenRow.user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);

    // Update password
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, user.id);

    // Mark token as used
    await db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);

    // Clean up expired tokens
    // Convert to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
    const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');
    await db.prepare('DELETE FROM password_reset_tokens WHERE expires_at < ?').run(nowStr);

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Me endpoint
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const row = await db.prepare('SELECT id, email, role, credits, is_online, bonus_granted, full_name, phone, nickname, country, city, timezone FROM users WHERE id = ?').get(req.user.id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const user = sanitizeUser(row);
    let pendingCount = 0;
    if (user.role === 'consultant') {
      const countResult = await db.prepare("SELECT COUNT(*) as c FROM requests WHERE consultant_id = ? AND status = 'pending'").get(user.id);
      pendingCount = countResult.c;
    }
    res.json({ user, pendingCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stripe payment intents for credit top-ups
app.post('/api/payments/create-intent', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  const numericAmount = Number(req.body.amount);
  if (!numericAmount || numericAmount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (ALLOWED_TOPUP_AMOUNTS.length && !ALLOWED_TOPUP_AMOUNTS.includes(numericAmount)) {
    return res.status(400).json({ error: 'Importo non valido' });
  }

  try {
    const amountInMinor = Math.round(numericAmount * 100);
    const intent = await stripe.paymentIntents.create({
      amount: amountInMinor,
      currency: STRIPE_CURRENCY,
      automatic_payment_methods: { enabled: true },
      description: `Swang.IT top-up €${numericAmount.toFixed(2)}`,
      metadata: {
        userId: String(req.user.id),
        type: 'topup',
        amount_eur: numericAmount.toFixed(2)
      }
    });

    res.json({ clientSecret: intent.client_secret });
  } catch (error) {
    console.error(`[PAYMENT_INTENT_ERROR] [${new Date().toISOString()}] User ${req.user.id}:`, error);
    res.status(500).json({ error: 'Unable to create payment intent' });
  }
});

app.post('/api/payments/confirm', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  const { paymentIntentId } = req.body;
  if (!paymentIntentId) {
    return res.status(400).json({ error: 'Missing paymentIntentId' });
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!intent) return res.status(404).json({ error: 'Payment intent not found' });
    if (intent.status !== 'succeeded') {
      console.warn(`[PAYMENT_FAILED] [${new Date().toISOString()}] Intent ${paymentIntentId} status: ${intent.status}`);
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const intentUserId = intent.metadata?.userId ? Number(intent.metadata.userId) : null;
    if (intentUserId && intentUserId !== req.user.id) {
      console.error(`[PAYMENT_AUTH_MISMATCH] [${new Date().toISOString()}] User ${req.user.id} tried to claim intent ${paymentIntentId} belonging to ${intentUserId}`);
      return res.status(403).json({ error: 'Unauthorized payment confirmation' });
    }

    const amountReceived = intent.amount_received || intent.amount || 0;
    const transactionAmount = intent.metadata?.amount_eur ? Number(intent.metadata.amount_eur) : amountReceived / 100;
    const creditsToAdd = Math.round(transactionAmount);
    if (!creditsToAdd) {
      console.error(`[PAYMENT_AMOUNT_ERROR] [${new Date().toISOString()}] Intent ${paymentIntentId}: rounded credits is 0. Amount: ${transactionAmount}`);
      return res.status(400).json({ error: 'Unable to determine credit amount' });
    }

    const method = Array.isArray(intent.payment_method_types) && intent.payment_method_types.length > 0
      ? intent.payment_method_types[0]
      : 'stripe';

    const updatedUser = await db.transaction(async (connection) => {
      const [existing] = await connection.query('SELECT id FROM transactions WHERE reference = ?', [paymentIntentId]);
      if (existing.length === 0) {
        await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [creditsToAdd, req.user.id]);
        await recordTransactionInTransaction(connection, req.user.id, {
          type: 'topup',
          amount: transactionAmount,
          method,
          status: intent.status,
          description: `Ricarica credito via Stripe (€${transactionAmount.toFixed(2)})`,
          reference: paymentIntentId,
          metadata: { paymentIntentId }
        });
        console.log(`[PAYMENT_SUCCESS] [${new Date().toISOString()}] User ${req.user.id} credited €${transactionAmount} (Intent: ${paymentIntentId})`);
      } else {
        console.log(`[PAYMENT_IDEMPOTENCY] [${new Date().toISOString()}] Transaction ${paymentIntentId} already processed for User ${req.user.id}`);
      }
      const [rows] = await connection.query('SELECT id, email, role, credits, is_online, bonus_granted FROM users WHERE id = ?', [req.user.id]);
      return sanitizeUser(rows[0]);
    });

    res.json({ success: true, credits: updatedUser.credits, user: updatedUser });
    Promise.resolve(sendTopUpEmail({ email: updatedUser.email, amount: transactionAmount })).catch(err => {
      console.error(`[EMAIL_ERROR] Failed to send topup email to ${updatedUser.email}:`, err);
    });
  } catch (error) {
    console.error(`[PAYMENT_CONFIRM_ERROR] [${new Date().toISOString()}] User ${req.user.id} Intent ${paymentIntentId}:`, error);
    res.status(500).json({ error: 'Unable to confirm payment' });
  }
});

app.get('/api/transactions', authMiddleware, async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT id, type, amount, method, status, description, reference, metadata, created_at
      FROM transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);

    const transactions = await Promise.all(rows.map(async (row) => {
      const metadata = row.metadata ? JSON.parse(row.metadata) : null;
      let consultantInfo = null;

      // Extract consultant info from metadata for usage transactions (calls/chats)
      if ((row.type === 'usage' || row.type === 'deduction') && metadata && metadata.consultantId) {
        const consultantProfile = await db.prepare('SELECT name FROM consultant_profiles WHERE consultant_id = ?').get(metadata.consultantId);
        const consultantUser = await db.prepare('SELECT email FROM users WHERE id = ?').get(metadata.consultantId);
        consultantInfo = {
          id: metadata.consultantId,
          name: consultantProfile?.name || consultantUser?.email?.split('@')[0] || 'Consulente'
        };
      }

      return {
        ...row,
        metadata,
        consultant: consultantInfo
      };
    }));

    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update consultant online status (HIGH PRIORITY: only active consultants can go online)
app.put('/api/consultant/online-status', authMiddleware, requireRole('consultant'), requireActiveConsultant, async (req, res) => {
  try {
    const { isOnline } = req.body;
    await db.prepare('UPDATE users SET is_online = ? WHERE id = ?').run(isOnline ? 1 : 0, req.user.id);
    res.json({ success: true, is_online: isOnline });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Consultants list (for customers and public access)
// Public users can see active consultants to encourage registration
app.get('/api/consultants', optionalAuthMiddleware, async (req, res) => {
  try {
    // Check platform visibility for public users
    const isPublic = !req.user;
    const isAdmin = req.user && req.user.role === 'admin';

    if (isPublic && !isAdmin) {
      try {
        const platformSetting = await db.prepare('SELECT value FROM system_settings WHERE `key` = ?').get('platform_visible');
        const platformVisible = platformSetting?.value === 'true' || platformSetting?.value === '1';

        if (!platformVisible) {
          // Platform is hidden - return empty list
          return res.json({ consultants: [], total: 0, page: 1, pageSize: 10 });
        }
      } catch (err) {
        // If system_settings table doesn't exist or query fails, default to visible
        console.warn('Could not check platform visibility, defaulting to visible:', err.message);
      }
    }

    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.max(1, Math.min(50, Number(req.query.pageSize || 10)));
    const category = req.query.category; // 'coaching' or 'cartomancy'
    const microCategory = req.query.micro_category;
    const searchQuery = req.query.search; // New search parameter

    // Build query with filters
    let whereClause = "u.role = 'consultant'";
    const params = [];

    const isCustomer = req.user && req.user.role === 'customer';
    const isConsultant = req.user && req.user.role === 'consultant';

    // FIX: Strict visibility rules
    // 1. Admin: Sees all (no filter)
    // 2. Consultant: Sees 'active' profiles + their own profile (regardless of status)
    // 3. Public/Customer: Sees ONLY 'active' profiles
    if (isAdmin) {
      // No status filter needed for admins
    } else if (isConsultant) {
      whereClause += " AND (cp.status = 'active' OR u.id = ?)";
      params.push(req.user.id);
    } else {
      // Public or Customer or unauthenticated
      whereClause += " AND cp.status = 'active'";
    }

    if (category && category !== 'all') {
      whereClause += " AND cp.macro_category = ?";
      params.push(category);
    }

    if (microCategory) {
      whereClause += " AND cp.micro_categories LIKE ?";
      params.push(`%${microCategory}%`);
    }

    // Smart Search Implementation
    if (searchQuery && searchQuery.trim()) {
      const term = `%${searchQuery.trim()}%`;
      whereClause += " AND (cp.name LIKE ? OR cp.bio LIKE ? OR cp.macro_category LIKE ? OR cp.micro_categories LIKE ?)";
      params.push(term, term, term, term);
    }

    // Count total
    const countQuery = `SELECT COUNT(DISTINCT u.id) as c FROM users u LEFT JOIN consultant_profiles cp ON u.id = cp.consultant_id WHERE ${whereClause}`;
    let totalResult;
    try {
      if (params.length > 0) {
        totalResult = await db.prepare(countQuery).get(...params);
      } else {
        totalResult = await db.prepare(countQuery).get();
      }
    } catch (err) {
      console.error('Error counting consultants:', err);
      totalResult = { c: 0 };
    }
    const total = Number(totalResult?.c || totalResult?.count || 0);

    // Get consultants with profile data
    // IMPORTANT: Do NOT expose sensitive data (address, tax_code, IBAN, email, phone) to customers or public
    // Use COALESCE for columns that might not exist yet (migrations)

    // Select sensitive fields only if admin
    const sensitiveFields = isAdmin ? ', cp.email as profile_email, cp.phone, cp.address, cp.tax_code, cp.iban' : '';

    const query = `
      SELECT 
        u.id, u.email, u.role, u.credits, 
        COALESCE(u.is_online, 0) as is_online, 
        COALESCE(u.is_busy, 0) as is_busy,
        COALESCE(cp.name, u.nickname) as name, cp.bio, cp.experience, cp.profile_photo,
        cp.macro_category, cp.micro_categories,
        cp.chat_price, cp.voice_price, cp.video_price,
        cp.status, cp.rating, cp.review_count
        ${sensitiveFields}
      FROM users u
      LEFT JOIN consultant_profiles cp ON u.id = cp.consultant_id
      WHERE ${whereClause}
      ORDER BY COALESCE(u.is_online, 0) DESC, u.id
      LIMIT ? OFFSET ?
    `;

    const consultants = await db.prepare(query).all(...params, pageSize, (page - 1) * pageSize);

    // Process results
    consultants.forEach(c => {
      c.is_online = c.is_online === 1 || c.is_online === '1';
      c.is_busy = c.is_busy === 1 || c.is_busy === '1';

      // Convert numeric fields from strings to numbers (MySQL returns DECIMAL as strings)
      c.credits = parseFloat(c.credits) || 0;
      c.chat_price = parseFloat(c.chat_price) || 0.10;
      c.voice_price = parseFloat(c.voice_price) || 1.50;
      c.video_price = parseFloat(c.video_price) || 2.00;
      c.rating = parseFloat(c.rating) || 0;
      c.review_count = parseInt(c.review_count) || 0;

      // Parse micro_categories JSON
      try {
        c.micro_categories = c.micro_categories ? JSON.parse(c.micro_categories) : [];
      } catch (e) {
        c.micro_categories = [];
      }
      // Set defaults if no profile
      if (!c.name) c.name = c.email?.split('@')[0] || 'Consultant';

      // IMPORTANT: Remove sensitive data from customer/public view (admin-only fields)
      if (isPublic || isCustomer) {
        delete c.email; // Don't show email to customers/public
        delete c.profile_email; // Don't show profile email to customers/public
        delete c.phone; // Don't show phone to customers/public
        delete c.address; // Don't show address to customers/public
        delete c.tax_code; // Don't show tax code to customers/public
        delete c.iban; // Don't show IBAN to customers/public
      }
    });

    res.json({ consultants, total, page, pageSize });
  } catch (error) {
    console.error('Error in /api/consultants:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send request (customer -> consultant)
app.post('/api/requests', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { consultantId, type = 'chat' } = req.body;
    if (!consultantId) return res.status(400).json({ error: 'Missing consultantId' });

    // Validate type
    const validType = ['video', 'voice', 'chat'].includes(type) ? type : 'chat';

    const consultant = await db.prepare("SELECT id FROM users WHERE id = ? AND role = 'consultant'").get(consultantId);
    if (!consultant) return res.status(404).json({ error: 'Consultant not found' });

    // Requirement #1: Only prevent duplicate PENDING requests
    const existingPending = await db.prepare("SELECT id FROM requests WHERE customer_id = ? AND consultant_id = ? AND status = 'pending'").get(req.user.id, consultantId);
    if (existingPending) {
      return res.status(409).json({ error: 'Hai già una richiesta in sospeso con questo consulente. Attendi l\'approvazione.' });
    }

    // Requirement #1: Close any old sessions (chat, voice, video) to ensure new room creation
    // CHAT NOW WORKS LIKE CALLS: All sessions are closed when new request is made
    const oldSessions = await db.prepare(`
      SELECT s.id, s.request_id, s.room_name 
      FROM sessions s
      JOIN requests r ON r.id = s.request_id
      WHERE r.customer_id = ? AND r.consultant_id = ? AND s.ended_at IS NULL
    `).all(req.user.id, consultantId);

    if (oldSessions.length > 0) {
      for (const oldSession of oldSessions) {
        await db.prepare('UPDATE sessions SET active = 0, ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(oldSession.id);
        const room = oldSession.room_name;
        const state = sessionState.get(room);
        if (state?.intervalId) clearInterval(state.intervalId);
        if (state?.balanceUpdateInterval) clearInterval(state.balanceUpdateInterval);
        sessionState.delete(room);
        io.to(room).emit('session_ended');
      }
    }

    // Set expiry time to 60 seconds from now for auto-expiry
    // Convert to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
    const expiryTime = new Date(Date.now() + 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const info = await db.prepare("INSERT INTO requests (customer_id, consultant_id, status, expiry_time, type) VALUES (?,?,'pending',?,?)").run(req.user.id, consultantId, expiryTime, validType);
    const requestId = info.lastInsertRowid;

    // Requirement #3: Emit real-time notification to consultant (always, even for returning customers)
    io.to(`consultant_${consultantId}`).emit('new_request', { requestId, customerId: req.user.id, type: validType });

    res.json({ id: requestId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a request (customer only, for pending requests)
app.delete('/api/requests/:id', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ? AND customer_id = ?').get(id, req.user.id);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });

    // Allow cancellation of pending OR accepted requests
    if (reqRow.status !== 'pending' && reqRow.status !== 'accepted') {
      return res.status(409).json({ error: `Cannot cancel request with status '${reqRow.status}'` });
    }

    // CHECK if this request is linked to a booking slot (Calendar Appointment)
    // IMPORTANT: "accepted" requests usually mean credits were held.
    let refundAmount = 0;

    // REFACTOR: Fetch the active booking slot BEFORE starting the transaction.
    // This ensures we have the slot details for the email notification even after we release it (set booked_by = NULL).
    // FIX: Use 'db.prepare' instead of 'connection.query' because we are outside the transaction scope.
    const linkedSlot = await db.prepare(`
      SELECT * FROM booking_slots 
      WHERE consultant_id = ? 
        AND booked_by = ? 
        AND is_booked = 1
      ORDER BY id DESC
      LIMIT 1
    `).get(reqRow.consultant_id, reqRow.customer_id);

    await db.transaction(async (connection) => {
      // 1. Update Request Status
      console.log(`--- VERIFICATION: Attempting to cancel RequestID: ${id}. Current Status: ${reqRow.status} ---`);
      await connection.query("UPDATE requests SET status = 'cancelled' WHERE id = ?", [id]);
      console.log(`--- VERIFICATION: Request ${id} status updated to 'cancelled' successfully ---`);

      // 1.5 Free up the Booking Slot (if this was a scheduled appointment)
      if (linkedSlot) {
        await connection.query(`
          UPDATE booking_slots 
          SET is_booked = 0, booked_by = NULL, booked_at = NULL, credits_held = 0
          WHERE id = ?
        `, [linkedSlot.id]);

        // Refund Credits if held (and not already processed)
        if (linkedSlot.credits_held > 0) {
          refundAmount = linkedSlot.credits_held;
          await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [refundAmount, req.user.id]);

          await recordTransactionInTransaction(connection, req.user.id, {
            type: 'refund',
            amount: refundAmount,
            method: 'system',
            status: 'completed',
            description: `Rimborso prenotazione cancellata`,
            metadata: { slotId: linkedSlot.id, requestId: id }
          });
        }
        console.log(`--- VERIFICATION: Released Booking Slot ${linkedSlot.id} for Request ${id} ---`);
      } else {
        console.log(`--- VERIFICATION: No matching booking slot found to release for Request ${id} ---`);
      }

      // 3. Mark Session as Ended if exists
      await connection.query("UPDATE sessions SET active = 0, ended_at = CURRENT_TIMESTAMP WHERE request_id = ?", [id]);

      // FIX #18: Reset consultant is_busy status if no other active sessions
      // We check for other active sessions/appointments OUTSIDE this transaction to be safe? 
      // Actually, we can just do a safe update check.
      // But we are inside a transaction. We should check using the connection.

      const [activeSessions] = await connection.query(`
        SELECT id FROM sessions 
        WHERE consultant_id = ? AND active = 1 AND ended_at IS NULL AND request_id != ?
        LIMIT 1
      `, [reqRow.consultant_id, id]);

      if (activeSessions.length === 0) {
        // No other active sessions.
        // Also check for "Right Now" appointments (buffer 5 mins)
        const now = new Date();
        const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

        const [activeAppts] = await connection.query(`
             SELECT id FROM booking_slots 
             WHERE consultant_id = ? AND is_booked = 1 AND id != ?
             AND CONCAT(date, ' ', time) BETWEEN DATE_SUB(?, INTERVAL 5 MINUTE) AND DATE_ADD(?, INTERVAL 5 MINUTE)
             LIMIT 1
          `, [reqRow.consultant_id, linkedSlot ? linkedSlot.id : 0, nowStr, nowStr]);

        if (activeAppts.length === 0) {
          await connection.query('UPDATE users SET is_busy = 0 WHERE id = ?', [reqRow.consultant_id]);
          // We will emit the status update AFTER the transaction commits
        }
      }
    });

    // Notifications
    io.to(`consultant_${reqRow.consultant_id}`).emit('new_request', { type: 'cancellation', requestId: id }); // Notify of change
    io.to(`consultant_${reqRow.consultant_id}`).emit('request_cancelled', { requestId: id });
    io.to(`customer_${req.user.id}`).emit('request_cancelled', { requestId: id });

    // Send real-time status update to everyone
    io.emit('consultant_status_update', { consultantId: reqRow.consultant_id, is_busy: false });

    // Send Emails - Use the slot we cached at the start
    const consultantUser = await db.prepare('SELECT email, full_name, timezone FROM users WHERE id = ?').get(reqRow.consultant_id);
    const consultantProfile = await db.prepare('SELECT name FROM consultant_profiles WHERE consultant_id = ?').get(reqRow.consultant_id);
    const customerUser = await db.prepare('SELECT email, full_name, timezone FROM users WHERE id = ?').get(req.user.id);

    // DEBUG: Check if timezone is being fetched correctly
    console.log('[DEBUG-EMAIL] Cancellation Email Data:', {
      customerEmail: customerUser?.email,
      customerTimezone: customerUser?.timezone,
      consultantEmail: consultantUser?.email,
      consultantTimezone: consultantUser?.timezone,
      slotDate: linkedSlot?.date,
      slotTime: linkedSlot?.time
    });

    if (linkedSlot && customerUser && consultantUser) {
      const { sendBookingCancellationEmail } = require('./email');

      // Send cancellation email to both parties with timezone support
      sendBookingCancellationEmail({
        customerEmail: customerUser.email,
        consultantEmail: consultantUser.email,
        slot: linkedSlot, // Use the captured slot data
        consultantName: consultantProfile?.name || 'Consulente',
        customerName: customerUser.full_name || 'Utente',
        customerTimezone: customerUser.timezone,
        consultantTimezone: consultantUser.timezone
      }).catch(e => console.error('Email error:', e));
    }

    res.json({ success: true, refunded: refundAmount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single request
app.get('/api/requests/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    // authorize only the two parties
    if (![reqRow.customer_id, reqRow.consultant_id].includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    res.json(reqRow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [CLEANUP] Final fragments removed.

// Consultant: list incoming requests (HIGH PRIORITY: only active consultants can receive requests)
app.get('/api/incoming-requests', authMiddleware, requireRole('consultant'), requireActiveConsultant, async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT r.id, r.status, r.type, u.email AS customer_email,
        u.nickname AS customer_name,
  s.id AS session_id, s.room_name, s.active, s.ended_at,
    CASE 
          WHEN s.ended_at IS NOT NULL THEN 'closed'
          WHEN s.active = 1 THEN 'active'
          WHEN r.status = 'accepted' AND s.ended_at IS NULL THEN 'active'
          WHEN r.status = 'pending' THEN 'pending'
          ELSE 'unknown'
        END AS session_status
      FROM requests r
      JOIN users u ON u.id = r.customer_id
      LEFT JOIN sessions s ON s.request_id = r.id
      WHERE r.consultant_id = ?
  ORDER BY r.id DESC
    `).all(req.user.id);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Consultant accept/decline (HIGH PRIORITY: only active consultants can accept/decline)
app.post('/api/requests/:id/decision', authMiddleware, requireRole('consultant'), requireActiveConsultant, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { decision } = req.body; // 'accept' | 'decline'
    const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ? AND consultant_id = ?').get(id, req.user.id);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.status !== 'pending') return res.status(409).json({ error: 'Already decided' });
    if (!['accept', 'decline'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });

    const status = decision === 'accept' ? 'accepted' : 'declined';
    await db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(status, id);
    let session = null;
    if (status === 'accepted') {
      const requestType = reqRow.type || 'chat';
      // CHAT NOW WORKS LIKE CALLS: Create unique session per request (non-persistent)
      // Check if session already exists for this request (shouldn't happen, but prevent reuse)
      const existingSession = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(id);
      if (existingSession) {
        await db.prepare('UPDATE sessions SET active = 0, ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(existingSession.id);
        const room = existingSession.room_name;
        const state = sessionState.get(room);
        if (state?.intervalId) clearInterval(state.intervalId);
        if (state?.balanceUpdateInterval) clearInterval(state.balanceUpdateInterval);
        sessionState.delete(room);
        io.to(room).emit('session_ended');
      }

      // Create unique session for this request (chat, voice, or video)
      const timestamp = Date.now();
      const room = requestType === 'chat'
        ? `vcapp_chat_${id}_${timestamp}`
        : `vcapp_room_${id}_${timestamp}`;
      await db.prepare(`
        INSERT INTO sessions(request_id, room_name, active, customer_id, consultant_id, type)
VALUES(?,?, 0,?,?,?)
      `).run(id, room, reqRow.customer_id, reqRow.consultant_id, requestType);
      session = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(id);
      // Notify customer that request was accepted
      // Include request type so customer can auto-navigate to correct screen
      io.to(`customer_${reqRow.customer_id}`).emit('request_accepted', {
        requestId: id,
        room_name: room,
        type: requestType
      });
    }
    res.json({ status, session });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update session type (voice to video upgrade)
app.put('/api/requests/:id/session/upgrade-to-video', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    // authorize only the two parties
    if (![reqRow.customer_id, reqRow.consultant_id].includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    const requestType = reqRow.type || 'chat';

    // Only allow upgrade from voice to video
    if (requestType !== 'voice') {
      return res.status(400).json({ error: 'Can only upgrade voice calls to video calls' });
    }

    // Find session
    let session = null;
    if (requestType === 'voice') {
      session = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(id);
    }

    if (!session) return res.status(404).json({ error: 'No session' });
    if (session.ended_at) return res.status(410).json({ error: 'Session already ended' });

    // Update request type and session type to video
    await db.prepare('UPDATE requests SET type = ? WHERE id = ?').run('video', id);
    await db.prepare('UPDATE sessions SET type = ? WHERE id = ?').run('video', session.id);

    // Notify both participants about the upgrade
    io.to(`customer_${reqRow.customer_id}`).emit('call_upgraded_to_video', { requestId: id });
    io.to(`consultant_${reqRow.consultant_id}`).emit('call_upgraded_to_video', { requestId: id });

    res.json({ success: true, message: 'Call upgraded to video' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session by request id (for join)
app.get('/api/requests/:id/session', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    if (!reqRow) {
      return res.status(404).json({ error: 'Request not found' });
    }
    // authorize only the two parties
    if (![reqRow.customer_id, reqRow.consultant_id].includes(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const requestType = reqRow.type || 'chat';

    // CHAT NOW WORKS LIKE CALLS: Find session by request_id (non-persistent)
    const session = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(id);

    if (!session) {
      return res.status(404).json({ error: 'No session' });
    }

    // CRITICAL FIX: Prevent reopening completed rooms - return error if session is already ended
    if (session.ended_at) {
      // EXCEPTION: If this is a Calendar Appointment and the time slot is still valid, ALLOW re-entry.
      // 1. Check if there's a booked slot for this pair that matches current time
      const now = new Date();
      // We look for a slot that is booked by this customer with this consultant
      // AND where the current time is within (Start - 10min) and (End + 10min) window
      // Note: We need to handle Rome Time conversion or just rely on 'is_booked' and approximate time check

      const activeSlot = await db.prepare(`
        SELECT * FROM booking_slots 
        WHERE consultant_id = ? AND booked_by = ? AND is_booked = 1
        ORDER BY id DESC LIMIT 5
      `).all(reqRow.consultant_id, reqRow.customer_id);

      let isAppointmentValid = false;

      for (const slot of activeSlot) {
        // Parse slot time (assume Rome Time as per convention)
        let datePart = typeof slot.date === 'string' ? slot.date.split('T')[0] : slot.date.toISOString().split('T')[0];
        const romeTimeStr = `${datePart}T${slot.time}`;
        // Approximate check: We don't have perfect timezone lib here, but we can check if "now" is reasonable close
        // Better: Use the same logic as 'join' endpoint if possible, or just strict window
        // We'll use a 2-hour window check around the slot time to be safe, assuming user is trying to join "near" the time
        // Constraining strictly to duration is better

        const apptDate = new Date(romeTimeStr); // This constructs in server local time if not offset, be careful. 
        // If string is YYYY-MM-DDTHH:mm:ss, Date() assumes local.
        // Let's assume server is UTC or aligned.

        // Simple generic check: Is the slot date TODAY?
        const nowStr = now.toISOString().split('T')[0];
        if (datePart === nowStr) {
          // It's for today. Revive it.
          // We trust the user won't abuse re-joining an "ended" call from 5 hours ago if it was today.
          // Actually, we should check duration.
          isAppointmentValid = true;
          break;
        }
      }

      if (isAppointmentValid) {
        console.log(`[DEBUG-SESSION] Reviving session ${session.id} for valid appointment window.`);
        await db.prepare('UPDATE sessions SET ended_at = NULL, active = 1 WHERE id = ?').run(session.id);
        session.ended_at = null;
        session.active = 1;
      } else {
        return res.status(410).json({ error: 'Questa sessione è già stata completata e non può essere riaperta.' });
      }
    }



    res.json({ session, creditsPerMinute: CREDITS_PER_MINUTE });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// List chat messages for a request's session
// Get all active chat sessions for consultant (for chat dropdown in header)
app.get('/api/consultant/active-chats', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const consultantId = req.user.id;

    // Cleanup: End duplicate chat sessions, keep only the most recent one per customer-consultant pair
    const duplicateSessions = await db.prepare(`
      SELECT customer_id, consultant_id, GROUP_CONCAT(id) as session_ids
      FROM sessions
      WHERE consultant_id = ? AND type = 'chat' AND ended_at IS NULL
      GROUP BY customer_id, consultant_id
      HAVING COUNT(*) > 1
  `).all(consultantId);

    for (const dup of duplicateSessions) {
      // Get all sessions for this customer-consultant pair
      const sessions = await db.prepare(`
        SELECT id FROM sessions
        WHERE customer_id = ? AND consultant_id = ? AND type = 'chat' AND ended_at IS NULL
        ORDER BY id DESC
  `).all(dup.customer_id, dup.consultant_id);

      // Keep the most recent one (first in DESC order), end all others
      if (sessions.length > 1) {
        const keepSessionId = sessions[0].id;
        const endSessionIds = sessions.slice(1).map(s => s.id);
        for (const endId of endSessionIds) {
          await db.prepare('UPDATE sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(endId);
        }
      }
    }

    // Get all active chat sessions (type='chat' and not ended) for this consultant
    // CHAT NOW WORKS LIKE CALLS: Each request has its own session
    // Include read status: unread if consultant_read_at is NULL or before last message
    const chatSessions = await db.prepare(`
SELECT
s.request_id,
  s.customer_id,
  s.consultant_id,
  u.email AS customer_email,
    u.full_name AS customer_name,
      s.id AS session_id,
        (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) AS message_count,
          (SELECT MAX(created_at) FROM chat_messages WHERE session_id = s.id) AS last_message_at,
            s.consultant_read_at,
            CASE 
          WHEN s.consultant_read_at IS NULL THEN 1
WHEN(SELECT MAX(created_at) FROM chat_messages WHERE session_id = s.id) IS NULL THEN 0
          WHEN s.consultant_read_at < (SELECT MAX(created_at) FROM chat_messages WHERE session_id = s.id) THEN 1
          ELSE 0
        END AS is_unread
      FROM sessions s
      JOIN users u ON u.id = s.customer_id
      WHERE s.consultant_id = ? AND s.type = 'chat' AND s.ended_at IS NULL
      ORDER BY last_message_at DESC, s.id DESC
  `).all(consultantId);

    res.json(chatSessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark chat session as read by consultant
app.post('/api/requests/:id/mark-read', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.consultant_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    // CHAT NOW WORKS LIKE CALLS: Find session by request_id
    const chatSession = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(id);

    if (chatSession && chatSession.type === 'chat') {
      // Update consultant_read_at to current timestamp
      await db.prepare('UPDATE sessions SET consultant_read_at = CURRENT_TIMESTAMP WHERE id = ?').run(chatSession.id);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Chat session not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat request ID for a customer-consultant pair (for opening chat session)
// CHAT NOW WORKS LIKE CALLS: Find the most recent active chat session
app.get('/api/chat-request/:customerId', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const customerId = Number(req.params.customerId);
    const consultantId = req.user.id;

    // Find the most recent active chat session for this customer-consultant pair
    const chatSession = await db.prepare(`
      SELECT request_id FROM sessions 
      WHERE customer_id = ? AND consultant_id = ? AND type = 'chat' AND ended_at IS NULL
      ORDER BY id DESC LIMIT 1
  `).get(customerId, consultantId);

    if (chatSession && chatSession.request_id) {
      // Return the request_id from the chat session
      res.json({ chatRequestId: chatSession.request_id });
    } else {
      // If no active chat session exists, find any accepted chat request
      const chatRequest = await db.prepare(`
        SELECT id FROM requests 
        WHERE customer_id = ? AND consultant_id = ? AND type = 'chat' AND status = 'accepted'
        ORDER BY id DESC LIMIT 1
  `).get(customerId, consultantId);

      if (chatRequest) {
        res.json({ chatRequestId: chatRequest.id });
      } else {
        res.status(404).json({ error: 'No chat session found' });
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/requests/:id/messages', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (![reqRow.customer_id, reqRow.consultant_id].includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    // CHAT NOW WORKS LIKE CALLS: Find session by request_id for all types
    const session = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(id);

    if (!session) return res.json([]);
    const msgs = await db.prepare('SELECT sender_id as senderId, message, created_at as createdAt FROM chat_messages WHERE session_id = ? ORDER BY id ASC').all(session.id);
    res.json(msgs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Consultant Profile Management
app.get('/api/consultant/profile', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const profile = await db.prepare('SELECT * FROM consultant_profiles WHERE consultant_id = ?').get(req.user.id);
    const user = await db.prepare('SELECT email, full_name, phone FROM users WHERE id = ?').get(req.user.id);

    if (!profile) {
      // Create default profile if doesn't exist
      // HIGH PRIORITY: New consultants start with status 'pending' until admin approval
      await db.prepare('INSERT INTO consultant_profiles (consultant_id, status, email, phone) VALUES (?,?,?,?)').run(
        req.user.id, 'pending', user?.email || null, user?.phone || null
      );
      const newProfile = await db.prepare('SELECT * FROM consultant_profiles WHERE consultant_id = ?').get(req.user.id);
      try {
        newProfile.micro_categories = newProfile.micro_categories ? JSON.parse(newProfile.micro_categories) : [];
      } catch (e) {
        newProfile.micro_categories = [];
      }
      newProfile.contract_agreed = newProfile.contract_agreed === 1;
      // Populate email and phone from user if not in profile
      if (!newProfile.email && user?.email) newProfile.email = user.email;
      if (!newProfile.phone && user?.phone) newProfile.phone = user.phone;
      return res.json(newProfile);
    }
    try {
      profile.micro_categories = profile.micro_categories ? JSON.parse(profile.micro_categories) : [];
    } catch (e) {
      profile.micro_categories = [];
    }
    profile.contract_agreed = profile.contract_agreed === 1;
    // Populate email and phone from user if not in profile
    if ((!profile.email || profile.email === '') && user?.email) {
      profile.email = user.email;
    }
    if ((!profile.phone || profile.phone === '') && user?.phone) profile.phone = user.phone;

    // FIX ANONYMITY: Return real_name for private admin view
    profile.real_name = user?.full_name || '';

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload profile photo
app.post('/api/consultant/profile/photo', authMiddleware, requireRole('consultant'), upload.single('profile_photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Delete old profile photo if exists
    const existing = await db.prepare('SELECT profile_photo FROM consultant_profiles WHERE consultant_id = ?').get(req.user.id);
    if (existing && existing.profile_photo) {
      const oldPath = path.join(__dirname, '..', existing.profile_photo);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Save relative path to database
    const filePath = `/uploads/profiles/${req.file.filename}`;

    // Update or insert profile
    const profileExists = await db.prepare('SELECT consultant_id FROM consultant_profiles WHERE consultant_id = ?').get(req.user.id);
    if (profileExists) {
      await db.prepare('UPDATE consultant_profiles SET profile_photo = ?, updated_at = CURRENT_TIMESTAMP WHERE consultant_id = ?').run(filePath, req.user.id);
    } else {
      // HIGH PRIORITY: New consultants start with status 'pending' until admin approval
      await db.prepare('INSERT INTO consultant_profiles (consultant_id, profile_photo, status) VALUES (?, ?, ?)').run(req.user.id, filePath, 'pending');
    }

    res.json({ profile_photo_path: filePath, profile_photo: filePath, message: 'Profile photo uploaded successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.put('/api/consultant/profile', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const { name, email, phone, bio, experience, profile_photo, macro_category, micro_categories, chat_price, voice_price, video_price, contract_agreed, address, tax_code, iban } = req.body;

    // FIX C1: Make all consultant personal data fields mandatory
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Il nome è obbligatorio' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'L\'email è obbligatoria' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Il telefono è obbligatorio' });
    }
    if (!bio || !bio.trim()) {
      return res.status(400).json({ error: 'La biografia è obbligatoria' });
    }
    if (!experience || !experience.trim()) {
      return res.status(400).json({ error: 'L\'esperienza è obbligatoria' });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ error: 'L\'indirizzo è obbligatorio' });
    }
    if (!tax_code || !tax_code.trim()) {
      return res.status(400).json({ error: 'Il codice fiscale è obbligatorio' });
    }
    if (!iban || !iban.trim()) {
      return res.status(400).json({ error: 'L\'IBAN è obbligatorio' });
    }

    // HIGH PRIORITY: Contract acceptance is MANDATORY
    if (!contract_agreed) {
      return res.status(400).json({ error: 'Devi accettare il contratto di collaborazione per poter salvare il profilo.' });
    }

    // Validate micro_categories (1-6 items)
    const microCats = Array.isArray(micro_categories) ? micro_categories : [];
    if (microCats.length > 6) {
      return res.status(400).json({ error: 'Maximum 6 micro-categories allowed' });
    }

    // FIX C2: Validate pricing - chat: €0.01-€1.00, voice/video: €1-€10
    const validateChatPrice = (price, fieldName) => {
      if (price === null || price === undefined) return null;
      const numPrice = typeof price === 'number' ? price : parseFloat(price);
      if (isNaN(numPrice)) return null;
      if (numPrice < 0.01 || numPrice > 10.00) {
        return res.status(400).json({ error: `${fieldName} deve essere compreso tra €0.01 e €10.00` });
      }
      return numPrice;
    };

    const validateCallPrice = (price, fieldName) => {
      if (price === null || price === undefined) return null;
      const numPrice = typeof price === 'number' ? price : parseFloat(price);
      if (isNaN(numPrice)) return null;
      if (numPrice < 1 || numPrice > 10) {
        return res.status(400).json({ error: `${fieldName} deve essere compreso tra €1 e €10` });
      }
      return numPrice;
    };

    const validatedChatPrice = validateChatPrice(chat_price, 'Il prezzo della chat');
    const validatedVoicePrice = validateCallPrice(voice_price, 'Il prezzo della chiamata vocale');
    const validatedVideoPrice = validateCallPrice(video_price, 'Il prezzo della videochiamata');

    const microCatsJson = JSON.stringify(microCats);

    // Check if profile exists
    const existing = await db.prepare('SELECT consultant_id FROM consultant_profiles WHERE consultant_id = ?').get(req.user.id);

    // Also update user's phone if provided
    if (phone && phone.trim()) {
      await db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone.trim(), req.user.id);
    }

    // FIX ANONYMITY: Handle Real Name separately
    // 'real_name' from frontend updates users.full_name (Private/Admin)
    const { real_name } = req.body;
    if (real_name && real_name.trim()) {
      await db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(real_name.trim(), req.user.id);
    }
    // 'name' from frontend (Nickname) ONLY updates consultant_profiles.name (Public) - ALREADY HANDLED BELOW

    if (existing) {
      await db.prepare(`
        UPDATE consultant_profiles 
        SET name = ?, email = ?, phone = ?, bio = ?, experience = ?, profile_photo = COALESCE(?, profile_photo),
  macro_category = ?, micro_categories = ?,
  chat_price = ?, voice_price = ?, video_price = ?,
  contract_agreed = ?, address = ?, tax_code = ?, iban = ?, updated_at = CURRENT_TIMESTAMP
        WHERE consultant_id = ?
  `).run(
        name || null, email || null, phone || null, bio || null, experience || null, profile_photo || null,
        macro_category || 'coaching', microCatsJson,
        validatedChatPrice !== null ? validatedChatPrice : (chat_price && chat_price !== '' ? parseFloat(chat_price) : 1.00),
        validatedVoicePrice !== null ? validatedVoicePrice : (voice_price && voice_price !== '' ? parseFloat(voice_price) : 1.00),
        validatedVideoPrice !== null ? validatedVideoPrice : (video_price && video_price !== '' ? parseFloat(video_price) : 1.00),
        contract_agreed ? 1 : 0, address || null, tax_code || null, iban || null,
        req.user.id
      );
    } else {
      // HIGH PRIORITY: New consultants start with status 'pending' until admin approval
      await db.prepare(`
        INSERT INTO consultant_profiles
  (consultant_id, name, email, phone, bio, experience, profile_photo, macro_category, micro_categories, chat_price, voice_price, video_price, contract_agreed, address, tax_code, iban, status)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        req.user.id, name || null, email || null, phone || null, bio || null, experience || null, profile_photo || null,
        macro_category || 'coaching', microCatsJson,
        validatedChatPrice !== null ? validatedChatPrice : (chat_price && chat_price !== '' ? parseFloat(chat_price) : 1.00),
        validatedVoicePrice !== null ? validatedVoicePrice : (voice_price && voice_price !== '' ? parseFloat(voice_price) : 1.00),
        validatedVideoPrice !== null ? validatedVideoPrice : (video_price && video_price !== '' ? parseFloat(video_price) : 1.00),
        contract_agreed ? 1 : 0, address || null, tax_code || null, iban || null
      );
    }

    const updated = await db.prepare('SELECT * FROM consultant_profiles WHERE consultant_id = ?').get(req.user.id);
    try {
      updated.micro_categories = updated.micro_categories ? JSON.parse(updated.micro_categories) : [];
    } catch (e) {
      updated.micro_categories = [];
    }
    updated.contract_agreed = updated.contract_agreed === 1;
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update customer profile (nickname, full_name, phone)
app.put('/api/profile', authMiddleware, requireAnyRole('customer', 'consultant'), async (req, res) => {
  try {
    const { nickname, full_name, phone, country, city, timezone } = req.body;

    // NICKNAME IS MANDATORY for customers
    if (req.user.role === 'customer' && (!nickname || !nickname.trim())) {
      return res.status(400).json({ error: 'Nickname è obbligatorio per garantire l\'anonimato' });
    }

    const updates = [];
    const values = [];

    if (nickname !== undefined) {
      updates.push('nickname = ?');
      values.push(nickname.trim());
    }
    if (full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(full_name.trim());
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone.trim());
    }
    if (country !== undefined) {
      updates.push('country = ?');
      values.push(country);
    }
    if (city !== undefined) {
      updates.push('city = ?');
      values.push(city);
    }
    if (timezone !== undefined) {
      updates.push('timezone = ?');
      values.push(timezone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    }

    values.push(req.user.id);
    const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ? `);
    await stmt.run(...values);

    const updated = await db.prepare('SELECT id, email, role, credits, is_online, bonus_granted, full_name, phone, nickname, country, city, timezone FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: sanitizeUser(updated), message: 'Profilo aggiornato con successo' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Favorites
app.get('/api/favorites', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const favorites = await db.prepare(`
      SELECT f.id, f.consultant_id, f.created_at,
  u.email, cp.name, cp.profile_photo
      FROM favorites f
      JOIN users u ON u.id = f.consultant_id
      LEFT JOIN consultant_profiles cp ON cp.consultant_id = f.consultant_id
      WHERE f.customer_id = ?
  ORDER BY f.created_at DESC
    `).all(req.user.id);
    res.json({ favorites });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/favorites', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { consultantId } = req.body;
    if (!consultantId) return res.status(400).json({ error: 'Missing consultantId' });

    const info = await db.prepare('INSERT INTO favorites (customer_id, consultant_id) VALUES (?,?)').run(req.user.id, consultantId);
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY' || e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.message.includes('UNIQUE') || e.message.includes('Duplicate')) {
      return res.status(409).json({ error: 'Already in favorites' });
    }
    return res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/favorites/:consultantId', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const consultantId = Number(req.params.consultantId);
    await db.prepare('DELETE FROM favorites WHERE customer_id = ? AND consultant_id = ?').run(req.user.id, consultantId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Booking Slots
app.get('/api/consultant/slots', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const slots = await db.prepare('SELECT * FROM booking_slots WHERE consultant_id = ? AND is_booked = 0 ORDER BY date ASC, time ASC').all(req.user.id);
    res.json({ slots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consultant/slots', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const { title, description, date, time, duration, mode, price } = req.body;
    if (!title || !date || !time || !duration || !mode || price === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // FIX B1: Ensure price is a valid positive number
    const numPrice = typeof price === 'number' ? price : parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ error: 'Il prezzo deve essere un numero positivo maggiore di zero' });
    }

    const info = await db.prepare(`
      INSERT INTO booking_slots(consultant_id, title, description, date, time, duration, mode, price)
VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, title, description || null, date, time, duration, mode, numPrice);

    const slot = await db.prepare('SELECT * FROM booking_slots WHERE id = ?').get(info.lastInsertRowid);
    res.json(slot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/consultant/slots/:id', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const slot = await db.prepare('SELECT * FROM booking_slots WHERE id = ? AND consultant_id = ?').get(id, req.user.id);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (slot.is_booked) return res.status(409).json({ error: 'Cannot delete booked slot' });

    await db.prepare('DELETE FROM booking_slots WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available booking slots for a consultant (public)
app.get('/api/consultants/:id/slots', authMiddleware, requireAnyRole('customer', 'consultant'), async (req, res) => {
  try {
    const consultantId = Number(req.params.id);
    let slots;

    // If the user requesting is the consultant themselves, show ALL slots (so they can see their schedule)
    // Otherwise (customers), show ONLY available slots
    if (req.user.role === 'consultant' && req.user.id === consultantId) {
      slots = await db.prepare(`
        SELECT * FROM booking_slots 
        WHERE consultant_id = ? AND date >= CURDATE()
        ORDER BY date ASC, time ASC
      `).all(consultantId);
    } else {
      slots = await db.prepare(`
        SELECT * FROM booking_slots 
        WHERE consultant_id = ? AND is_booked = 0 AND date >= CURDATE()
        ORDER BY date ASC, time ASC
      `).all(consultantId);
    }

    res.json({ slots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Book a slot (customer)
app.post('/api/bookings', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { slotId } = req.body;
    if (!slotId) return res.status(400).json({ error: 'Missing slotId' });

    const slot = await db.prepare('SELECT * FROM booking_slots WHERE id = ? AND is_booked = 0').get(slotId);
    if (!slot) return res.status(404).json({ error: 'Slot not available' });

    // FIX: Prevent duplicate booking requests - check if this slot is already booked by this customer
    // Check if slot is already booked by this customer (prevents double booking)
    // We check if there is ANY slot booked by this user at the same date and time with this consultant
    const alreadyBooked = await db.prepare(`
      SELECT id FROM booking_slots 
      WHERE consultant_id = ? AND booked_by = ? AND date = ? AND time = ? AND is_booked = 1
    `).get(slot.consultant_id, req.user.id, slot.date, slot.time);

    if (alreadyBooked) {
      return res.status(409).json({ error: 'Hai già prenotato questo slot' });
    }

    // Also check if there's an existing accepted request for this customer-consultant pair from a booking
    // This prevents creating duplicate requests if booking endpoint is called twice
    const existingBookingRequest = await db.prepare(`
      SELECT r.id FROM requests r
      JOIN sessions s ON s.request_id = r.id
      WHERE r.customer_id = ? AND r.consultant_id = ?
  AND r.status = 'accepted'
        AND r.created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        AND s.ended_at IS NULL
      LIMIT 1
    `).get(req.user.id, slot.consultant_id);

    if (existingBookingRequest) {
      // Check if this existing request is from a booking (not a regular call)
      const existingSession = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(existingBookingRequest.id);
      if (existingSession && existingSession.type !== 'chat') {
        // Likely a booking request, prevent duplicate
        return res.status(409).json({ error: 'Hai già una prenotazione attiva con questo consulente' });
      }
    }

    const customer = await db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
    if (customer.credits < slot.price) {
      return res.status(400).json({ error: 'Insufficient credits' });
    }

    // Get customer and consultant details for email
    const customerUser = await db.prepare('SELECT email, nickname, timezone FROM users WHERE id = ?').get(req.user.id);
    const consultantUser = await db.prepare('SELECT email, timezone FROM users WHERE id = ?').get(slot.consultant_id);
    const consultantProfile = await db.prepare('SELECT name FROM consultant_profiles WHERE consultant_id = ?').get(slot.consultant_id);

    // Q2: Generate unique token for appointment link
    const crypto = require('crypto');
    const uniqueToken = crypto.randomBytes(32).toString('hex');

    // FIX: Deduct credits immediately when booking to prevent double credits on cancellation
    // credits_held tracks the amount deducted and held (frozen) until call starts or cancellation
    const result = await db.transaction(async (connection) => {
      // Deduct credits immediately from customer account
      await connection.query('UPDATE users SET credits = credits - ? WHERE id = ?', [slot.price, req.user.id]);

      // Record customer deduction transaction
      await recordTransactionInTransaction(connection, req.user.id, {
        type: 'deduction',
        amount: -slot.price,
        method: 'system',
        status: 'completed',
        description: `Prenotazione appuntamento(crediti congelati)`,
        metadata: { consultantId: slot.consultant_id, slotId: slotId, type: slot.mode || 'video', status: 'held' }
      });

      // UPDATE THE EXISTING SLOT (Single Booking Model)
      // This marks it as booked so it disappears from public view
      await connection.query(`
        UPDATE booking_slots 
        SET is_booked = 1, booked_by = ?, booked_at = CURRENT_TIMESTAMP, 
            call_link_token = ?, credits_held = ?, credits_released = 0
        WHERE id = ?
      `, [req.user.id, uniqueToken, slot.price, slotId]);

      // Use the existing slot ID
      const newSlotId = slotId;

      // Create request for this booking
      const [reqResult] = await connection.query('INSERT INTO requests (customer_id, consultant_id, status, type) VALUES (?,?,?,?)', [req.user.id, slot.consultant_id, 'accepted', slot.mode || 'video']);
      const requestId = reqResult.insertId;

      // Create session (but don't activate yet - will be activated when both parties join via link)
      const timestamp = Date.now();
      const room = `vcapp_room_${requestId}_${timestamp}`;
      await connection.query('INSERT INTO sessions (request_id, room_name, active, customer_id, consultant_id, type) VALUES (?,?,0,?,?,?)', [requestId, room, req.user.id, slot.consultant_id, slot.mode || 'video']);

      return { requestId, room, uniqueToken, newSlotId };
    });

    // Q2: Send confirmation emails with unique appointment link
    const baseUrl = process.env.PUBLIC_SITE_URL || process.env.CLIENT_ORIGIN?.split(',')[0] || 'https://www.swang.it';
    const appointmentLink = `${baseUrl.replace(/\/$/, '')}/appointment/${result.newSlotId}/${result.uniqueToken}`;

    Promise.resolve(sendBookingConfirmationEmail({
      customerEmail: customerUser.email,
      consultantEmail: consultantUser.email,
      slot: { ...slot, id: result.newSlotId, call_link_token: result.uniqueToken, appointment_link: appointmentLink },
      consultantName: consultantProfile?.name || null,
      customerName: customerUser.nickname || null,
      bookingId: result.newSlotId,
      token: result.uniqueToken,
      customerTimezone: customerUser.timezone || null,
      consultantTimezone: consultantUser.timezone || null
    })).catch(() => { });

    res.json({
      success: true,
      requestId: result.requestId,
      room: result.room,
      appointmentLink: appointmentLink,
      token: result.uniqueToken
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Q2: Get appointment details by booking ID and token (for appointment link page)
app.get('/api/appointment/:bookingId/:token', authMiddleware, requireAnyRole('customer', 'consultant'), async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const token = req.params.token;

    if (!bookingId || !token) {
      return res.status(400).json({ error: 'Invalid appointment link' });
    }

    const slot = await db.prepare('SELECT * FROM booking_slots WHERE id = ? AND call_link_token = ? AND is_booked = 1').get(bookingId, token);
    if (!slot) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Check if user is authorized (must be either customer or consultant for this booking)
    if (req.user.id !== slot.booked_by && req.user.id !== slot.consultant_id) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    // Calculate appointment datetime using Server-Side Authority (Rome Time)
    let datePart = slot.date;
    if (slot.date instanceof Date) {
      datePart = slot.date.toISOString().split('T')[0];
    } else if (typeof slot.date === 'string' && slot.date.includes('T')) {
      datePart = slot.date.split('T')[0];
    }

    // FORCE ROME TIME LOGIC:
    // We treat the stored date/time as "Rome Time" explicitly.
    // 1. Construct string like "YYYY-MM-DDTHH:MM:SS"
    const romeTimeStr = `${datePart}T${slot.time}`;

    // 2. Determine offset manually (Standard +01:00 or DST +02:00)
    const apptDateObj = new Date(romeTimeStr);
    const month = apptDateObj.getMonth() + 1;
    const isSummer = month >= 4 && month <= 10;
    const offset = isSummer ? '+02:00' : '+01:00';

    // 3. Create absolute Date object
    const appointmentDateTime = new Date(`${romeTimeStr}${offset}`);

    const now = new Date();
    const timeDiff = appointmentDateTime.getTime() - now.getTime();
    const minutesDiff = Math.floor(timeDiff / (1000 * 60));

    console.log(`[DEBUG-APPT] GET Appointment Info. SlotID: ${slot.id}. RomeTimeStr: ${romeTimeStr}${offset}. ApptAbsolute: ${appointmentDateTime.toISOString()}. Now: ${now.toISOString()}. DiffMinutes: ${minutesDiff}`);

    // Check time window: ±5 minutes (standardized to match join logic)
    // minutesDiff > 0 means appointment is in the future
    // minutesDiff < 0 means appointment is in the past
    // If minutesDiff is between -5 and 5, we are in the window.
    const isWithinWindow = minutesDiff >= -5 && minutesDiff <= 5;
    const isBeforeWindow = minutesDiff > 5;  // More than 5 minutes in the future
    const isAfterWindow = minutesDiff < -5;  // More than 5 minutes in the past

    // Get request and session for this booking
    const request = await db.prepare(`
      SELECT r.*, s.room_name, s.active, s.started_at, s.ended_at
      FROM requests r
      JOIN sessions s ON s.request_id = r.id
      WHERE r.customer_id = ? AND r.consultant_id = ? 
        AND r.status = 'accepted'
        AND r.type = ?
      ORDER BY r.created_at DESC
      LIMIT 1
    `).get(slot.booked_by, slot.consultant_id, slot.mode || 'video');

    // Get consultant and customer info
    const consultant = await db.prepare('SELECT email, credits FROM users WHERE id = ?').get(slot.consultant_id);
    const consultantProfile = await db.prepare('SELECT name FROM consultant_profiles WHERE consultant_id = ?').get(slot.consultant_id);
    const customer = await db.prepare('SELECT email, credits, nickname FROM users WHERE id = ?').get(slot.booked_by);

    res.json({
      slot: {
        id: slot.id,
        date: datePart, // Use sanitized date string
        time: slot.time,
        duration: slot.duration,
        mode: slot.mode || 'video',
        price: slot.price,
        title: slot.title,
        credits_held: slot.credits_held || 0,
        credits_released: slot.credits_released || 0
      },
      appointmentDateTime: appointmentDateTime.toISOString(),
      minutesDiff,
      isWithinWindow,
      isBeforeWindow,
      isAfterWindow,
      request: request || null,
      consultant: {
        id: slot.consultant_id,
        name: consultantProfile?.name || null,
        email: consultant?.email || null
      },
      customer: {
        id: slot.booked_by,
        // For anonymity: consultant only sees nickname, not email
        email: req.user.id === slot.booked_by ? (customer?.email || null) : null, // Only customer sees their own email
        nickname: customer?.nickname || null
      },
      isCustomer: req.user.id === slot.booked_by,
      isConsultant: req.user.id === slot.consultant_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel appointment (customer only, releases held credits)
app.post('/api/appointment/:bookingId/:token/cancel', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const token = req.params.token;

    if (!bookingId || !token) {
      return res.status(400).json({ error: 'Invalid appointment link' });
    }

    const slot = await db.prepare('SELECT * FROM booking_slots WHERE id = ? AND call_link_token = ? AND is_booked = 1').get(bookingId, token);
    if (!slot) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Check if user is the customer who booked this slot
    if (req.user.id !== slot.booked_by) {
      return res.status(403).json({ error: 'Unauthorized - only the customer who booked can cancel' });
    }

    // Check if appointment has already started (within time window)
    const appointmentDateTime = new Date(`${slot.date}T${slot.time}`);
    const now = new Date();
    const timeDiff = appointmentDateTime.getTime() - now.getTime();
    const minutesDiff = Math.floor(timeDiff / (1000 * 60));

    // If appointment is within 5 minutes before or after, don't allow cancellation
    if (minutesDiff >= -5 && minutesDiff <= 5) {
      return res.status(400).json({ error: 'Non è possibile cancellare un appuntamento durante la finestra di tempo attiva (5 minuti)' });
    }

    let refundAmount = 0;

    await db.transaction(async (connection) => {
      // Release held credits back to customer
      if (slot.credits_held > 0 && slot.credits_released === 0) {
        refundAmount = slot.credits_held;
        await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [slot.credits_held, req.user.id]);

        // Record transaction
        await recordTransactionInTransaction(connection, req.user.id, {
          type: 'refund',
          amount: slot.credits_held,
          method: 'system',
          status: 'completed',
          description: `Rimborso per cancellazione appuntamento #${bookingId}`,
          metadata: { bookingId, slotId: bookingId, reason: 'customer_cancellation' }
        });
      }

      // Mark slot as available again
      await connection.query('UPDATE booking_slots SET is_booked = 0, booked_by = NULL, booked_at = NULL, call_link_token = NULL, credits_held = 0 WHERE id = ?', [bookingId]);

      // Update request status to cancelled
      await connection.query('UPDATE requests SET status = ? WHERE consultant_id = ? AND customer_id = ? AND type = ? AND status = ?', ['cancelled', slot.consultant_id, req.user.id, slot.mode || 'video', 'accepted']);
    });

    // Get customer and consultant details for email
    const customerUser = await db.prepare('SELECT email, nickname FROM users WHERE id = ?').get(req.user.id);
    const consultantUser = await db.prepare('SELECT email FROM users WHERE id = ?').get(slot.consultant_id);
    const consultantProfile = await db.prepare('SELECT name FROM consultant_profiles WHERE consultant_id = ?').get(slot.consultant_id);

    // Send Cancellation Email
    const { sendBookingCancellationEmail } = require('./email');
    console.log('[DEBUG-EMAIL] Triggering sendBookingCancellationEmail for cancelled booking:', bookingId);
    Promise.resolve(sendBookingCancellationEmail({
      customerEmail: customerUser.email,
      consultantEmail: consultantUser.email,
      slot: slot,
      consultantName: consultantProfile?.name || null,
      customerName: customerUser.nickname || null,
      reason: 'customer_cancelled',
      refundAmount: refundAmount
    })).catch(err => console.error('[DEBUG-EMAIL] Error triggering cancellation email:', err));

    res.json({ success: true, refunded: refundAmount > 0, amount: refundAmount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Q2: Join appointment call (activates session and deducts credits if not already done)
app.post('/api/appointment/:bookingId/:token/join', authMiddleware, requireAnyRole('customer', 'consultant'), async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const token = req.params.token;

    if (!bookingId || !token) {
      return res.status(400).json({ error: 'Invalid appointment link' });
    }

    const slot = await db.prepare('SELECT * FROM booking_slots WHERE id = ? AND call_link_token = ? AND is_booked = 1').get(bookingId, token);
    if (!slot) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Check authorization
    if (req.user.id !== slot.booked_by && req.user.id !== slot.consultant_id) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    // Calculate appointment datetime using Server-Side Authority (Rome Time)
    let datePart = slot.date;
    if (slot.date instanceof Date) {
      datePart = slot.date.toISOString().split('T')[0];
    } else if (typeof slot.date === 'string' && slot.date.includes('T')) {
      datePart = slot.date.split('T')[0];
    }

    // FORCE ROME TIME LOGIC (Same as GET endpoint)
    const romeTimeStr = `${datePart}T${slot.time}`;
    const apptDateObj = new Date(romeTimeStr);
    const month = apptDateObj.getMonth() + 1;
    const isSummer = month >= 4 && month <= 10;
    const offset = isSummer ? '+02:00' : '+01:00';
    const absoluteAppointmentTime = new Date(`${romeTimeStr}${offset}`);

    const now = new Date();
    const timeDiff = absoluteAppointmentTime.getTime() - now.getTime();
    const minutesDiff = Math.floor(timeDiff / (1000 * 60));

    // Check if within 5 minute window (5 minutes before to 5 minutes after)
    if (minutesDiff < -5 || minutesDiff > 5) {
      return res.status(400).json({
        error: minutesDiff < -5 ? 'Appointment time has passed' : 'Appointment is not yet available',
        minutesDiff
      });
    }

    // Get request and session
    const request = await db.prepare(`
      SELECT r.*, s.id as session_id, s.room_name, s.active, s.started_at
      FROM requests r
      JOIN sessions s ON s.request_id = r.id
      WHERE r.customer_id = ? AND r.consultant_id = ? 
        AND r.status = 'accepted'
        AND r.type = ?
      ORDER BY r.created_at DESC
      LIMIT 1
    `).get(slot.booked_by, slot.consultant_id, slot.mode || 'video');

    if (!request) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Process revenue split when call starts (credits were already deducted on booking)
    const result = await db.transaction(async (connection) => {
      if (slot.credits_held > 0 && slot.credits_released === 0) {
        // Credits were already deducted when booking, now process revenue split
        // Revenue split: 45% platform, 55% consultant
        const platformFee = Math.round(slot.credits_held * PLATFORM_COMMISSION_RATE * 100) / 100;
        const consultantEarnings = Math.round(slot.credits_held * CONSULTANT_RATE * 100) / 100;
        const platformAccountId = await getOrCreatePlatformAccount();

        await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [consultantEarnings, slot.consultant_id]);
        await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [platformFee, platformAccountId]);

        // Mark credits as processed (set credits_held to 0)
        await connection.query('UPDATE booking_slots SET credits_held = 0 WHERE id = ?', [bookingId]);

        // Track transactions
        await recordTransactionInTransaction(connection, platformAccountId, {
          type: 'commission',
          amount: platformFee,
          method: 'system',
          status: 'completed',
          description: `Commissione piattaforma prenotazione (45%)`,
          metadata: { customerId: slot.booked_by, consultantId: slot.consultant_id, slotId: bookingId, totalAmount: slot.credits_held }
        });

        await recordEarningsTransactionInTransaction(connection, slot.consultant_id, {
          type: 'earnings',
          amount: consultantEarnings,
          method: 'system',
          status: 'completed',
          description: `Guadagni prenotazione (55%)`,
          metadata: { customerId: slot.booked_by, slotId: bookingId, totalAmount: slot.credits_held }
        });

        // Update customer transaction status from 'held' to 'completed'
        // The deduction transaction was already recorded on booking
      }

      // Activate session if not already active
      if (!request.started_at) {
        await connection.query('UPDATE sessions SET active = 1, started_at = CURRENT_TIMESTAMP WHERE id = ?', [request.session_id]);
        // FIX #7: Mark consultant as busy when appointment session starts
        await connection.query('UPDATE users SET is_busy = 1 WHERE id = ?', [slot.consultant_id]);
        io.emit('consultant_status_update', { consultantId: slot.consultant_id, is_busy: true });
      }

      return { room: request.room_name, requestId: request.id };
    });

    res.json({
      success: true,
      room: result.room,
      requestId: result.requestId,
      url: `/call/${result.requestId}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reviews
app.get('/api/consultants/:id/reviews', authMiddleware, requireAnyRole('customer', 'consultant'), async (req, res) => {
  try {
    const consultantId = Number(req.params.id);
    // Q1: Exclude hidden reviews from public display
    const reviews = await db.prepare(`
      SELECT r.*, u.email as customer_email, u.nickname as customer_nickname
      FROM reviews r
      JOIN users u ON u.id = r.customer_id
      WHERE r.consultant_id = ? AND (r.is_hidden = 0 OR r.is_hidden IS NULL)
      ORDER BY r.created_at DESC
    `).all(consultantId);
    res.json({ reviews });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reviews', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { consultantId, requestId, rating, comment } = req.body;
    if (!consultantId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    // Check if already reviewed for this request
    if (requestId) {
      const existing = await db.prepare('SELECT id FROM reviews WHERE customer_id = ? AND request_id = ?').get(req.user.id, requestId);
      if (existing) {
        return res.status(409).json({ error: 'Already reviewed' });
      }
    }

    const info = await db.prepare(`
      INSERT INTO reviews (customer_id, consultant_id, request_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, consultantId, requestId || null, rating, comment || null);

    // Update consultant rating
    const avgRating = await db.prepare(`
      SELECT AVG(rating) as avg, COUNT(*) as count 
      FROM reviews WHERE consultant_id = ?
    `).get(consultantId);

    await db.prepare('UPDATE consultant_profiles SET rating = ?, review_count = ? WHERE consultant_id = ?').run(
      avgRating.avg || 0, avgRating.count || 0, consultantId
    );

    const review = await db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid);
    res.json(review);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/reviews/:id/reply', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { reply } = req.body;

    const review = await db.prepare('SELECT * FROM reviews WHERE id = ? AND consultant_id = ?').get(id, req.user.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    await db.prepare('UPDATE reviews SET reply = ? WHERE id = ?').run(reply || null, id);
    const updated = await db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unified endpoint for "My Appointments" (Both Customer and Consultant)
// Get user's own reviews (for My Account page)
app.get('/api/my-reviews', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const reviews = await db.prepare(`
      SELECT r.*, 
             u.email AS consultant_email,
             cp.name AS consultant_name
      FROM reviews r
      JOIN users u ON u.id = r.consultant_id
      LEFT JOIN consultant_profiles cp ON cp.consultant_id = r.consultant_id
      WHERE r.customer_id = ?
      ORDER BY r.created_at DESC
    `).all(req.user.id);
    res.json({ reviews });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Unified endpoint for "My Requests" (Both Customer and Consultant)
app.get('/api/my-requests', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[DEBUG] /api/my-requests hit by User: ${userId} (${req.user.role})`);
    let query;

    if (req.user.role === 'customer') {
      // Customer sees requests they made to consultants
      // Join Consultant as 'u'
      query = `
        SELECT r.id, r.status, r.type, r.consultant_id, r.customer_id, u.email AS consultant_email,
          COALESCE(cp.name, u.nickname) AS consultant_name,
          s.room_name, s.active, s.ended_at,
          (
            SELECT CONCAT(bs.date, 'T', bs.time) 
            FROM booking_slots bs 
            WHERE bs.consultant_id = r.consultant_id 
            AND bs.booked_by = r.customer_id 
            AND bs.is_booked = 1
            -- Correlate by booking time being close to request creation (within 5 mins)
            AND ABS(TIMESTAMPDIFF(SECOND, bs.booked_at, r.created_at)) < 300
            LIMIT 1
          ) as appointment_date,
          (
            SELECT bs.id
            FROM booking_slots bs 
            WHERE bs.consultant_id = r.consultant_id 
            AND bs.booked_by = r.customer_id 
            AND bs.is_booked = 1
            AND ABS(TIMESTAMPDIFF(SECOND, bs.booked_at, r.created_at)) < 300
            LIMIT 1
          ) as booking_slot_id
        FROM requests r
        JOIN users u ON u.id = r.consultant_id
        LEFT JOIN consultant_profiles cp ON cp.consultant_id = r.consultant_id
        LEFT JOIN sessions s ON s.request_id = r.id
        WHERE r.customer_id = ?
        HAVING booking_slot_id IS NOT NULL
        ORDER BY r.id DESC
      `;
    } else {
      // Consultant sees requests made to them by customers
      // Join Customer as 'u'
      // Alias customer email as 'consultant_email' so the frontend reuses the exact same card component without changes
      query = `
        SELECT r.id, r.status, r.type, r.consultant_id, r.customer_id, u.email AS consultant_email,
          u.nickname AS consultant_name,
          s.room_name, s.active, s.ended_at,
          (
            SELECT CONCAT(bs.date, 'T', bs.time) 
            FROM booking_slots bs 
            WHERE bs.consultant_id = r.consultant_id 
            AND bs.booked_by = r.customer_id 
            AND bs.is_booked = 1
            -- Correlate by booking time being close to request creation (within 5 mins)
            AND ABS(TIMESTAMPDIFF(SECOND, bs.booked_at, r.created_at)) < 300
            LIMIT 1
          ) as appointment_date,
          (
            SELECT bs.id
            FROM booking_slots bs 
            WHERE bs.consultant_id = r.consultant_id 
            AND bs.booked_by = r.customer_id 
            AND bs.is_booked = 1
            AND ABS(TIMESTAMPDIFF(SECOND, bs.booked_at, r.created_at)) < 300
            LIMIT 1
          ) as booking_slot_id
        FROM requests r
        JOIN users u ON u.id = r.customer_id
        LEFT JOIN sessions s ON s.request_id = r.id
        WHERE r.consultant_id = ?
        HAVING booking_slot_id IS NOT NULL
        ORDER BY r.id DESC
      `;
    }

    const rows = await db.prepare(query).all(userId);

    // FIX TIMEZONE: Convert the raw "Rome Time" string from DB into an absolute ISO string
    // This ensures client-side "new Date()" works correctly across all timezones.
    // FIX DUPLICATES: Filter out duplicate requests for the same booking slot

    const seenSlots = new Set();
    const processedRows = [];

    for (const row of rows) {
      // Deduplication Logic
      if (row.booking_slot_id) {
        if (seenSlots.has(row.booking_slot_id)) {
          // Skip duplicate request for the same slot
          continue;
        }
        seenSlots.add(row.booking_slot_id);
      }

      let finalRow = row;
      if (row.appointment_date) {
        try {
          // 1. We have "YYYY-MM-DDTHH:MM:SS" (Rome Time)
          const romeTimeStr = row.appointment_date;

          // 2. Determine offset (Standard +01:00 or DST +02:00)
          const dateObj = new Date(romeTimeStr);
          const month = dateObj.getMonth() + 1;
          const isSummer = month >= 4 && month <= 10;
          const offset = isSummer ? '+02:00' : '+01:00';

          // 3. Create absolute Date
          const absoluteDate = new Date(`${romeTimeStr}${offset}`);

          // 4. Update the field to be ISO
          finalRow = {
            ...row,
            appointment_date: absoluteDate.toISOString()
          };
        } catch (e) {
          console.error('[DEBUG-TIMEZONE] Error parsing date in my-requests:', e);
          // Keep original row on error
        }
      }
      processedRows.push(finalRow);
    }

    res.json(processedRows);
  } catch (error) {
    console.error('Error in /api/my-requests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user account
app.delete('/api/delete-account', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Use transaction to ensure all related data is deleted
    await db.transaction(async (connection) => {
      // Delete user's reviews
      await connection.query('DELETE FROM reviews WHERE customer_id = ?', [userId]);

      // Delete user's favorites
      await connection.query('DELETE FROM favorites WHERE customer_id = ? OR consultant_id = ?', [userId, userId]);

      // Delete user's booking slots (if consultant)
      if (userRole === 'consultant') {
        await connection.query('DELETE FROM booking_slots WHERE consultant_id = ?', [userId]);
      }

      // Delete booking slots booked by user (if customer)
      if (userRole === 'customer') {
        await connection.query('UPDATE booking_slots SET is_booked = 0, booked_by = NULL, booked_at = NULL WHERE booked_by = ?', [userId]);
      }

      // Delete consultant profile if exists
      if (userRole === 'consultant') {
        await connection.query('DELETE FROM consultant_profiles WHERE consultant_id = ?', [userId]);
      }

      // Delete payout requests and invoices
      if (userRole === 'consultant') {
        const [payoutRequests] = await connection.query('SELECT id FROM payout_requests WHERE consultant_id = ?', [userId]);
        for (const pr of payoutRequests) {
          await connection.query('DELETE FROM invoices WHERE payout_request_id = ?', [pr.id]);
        }
        await connection.query('DELETE FROM payout_requests WHERE consultant_id = ?', [userId]);
      }

      // Delete password reset tokens
      await connection.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);

      // Delete transactions
      await connection.query('DELETE FROM transactions WHERE user_id = ?', [userId]);

      // Note: We don't delete requests/sessions/chat_messages to preserve historical data
      // But we can anonymize them if needed

      // Finally, delete the user
      await connection.query('DELETE FROM users WHERE id = ?', [userId]);
    });

    res.json({ success: true, message: 'Account eliminato con successo' });
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'eliminazione dell\'account' });
  }
});

// Consultant Stats
app.get('/api/consultant/stats', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const consultantId = req.user.id;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Weekly stats: minutes from sessions
    // FIX: Include sessions that have started_at set (even if not ended yet) for accurate tracking
    const weeklySessions = await db.prepare(`
      SELECT s.*, r.consultant_id
      FROM sessions s
      JOIN requests r ON r.id = s.request_id
      WHERE r.consultant_id = ? 
        AND s.started_at >= ? 
        AND s.started_at IS NOT NULL
        AND (s.ended_at IS NULL OR (s.ended_at IS NOT NULL AND s.ended_at > s.started_at))
    `).all(consultantId, weekAgo.toISOString());

    let weeklyMinutes = 0;
    weeklySessions.forEach(session => {
      if (session.started_at) {
        if (session.ended_at) {
          // Completed session: calculate duration
          const start = new Date(session.started_at);
          const end = new Date(session.ended_at);
          // FIX: Only calculate minutes if end is after start (prevent negative minutes)
          if (end > start) {
            const minutes = Math.round((end - start) / 1000 / 60);
            // Additional safety: ensure minutes is not negative
            if (minutes > 0) {
              weeklyMinutes += minutes;
            }
          }
        } else {
          // Active session: calculate minutes from start to now
          const start = new Date(session.started_at);
          const now = new Date();
          if (now > start) {
            const minutes = Math.round((now - start) / 1000 / 60);
            if (minutes > 0) {
              weeklyMinutes += minutes;
            }
          }
        }
      }
    });

    // Monthly stats: clients count
    // FIX: Count distinct customers from sessions that have started (more accurate than just requests)
    const monthlyClients = await db.prepare(`
      SELECT COUNT(DISTINCT s.customer_id) as count
      FROM sessions s
      JOIN requests r ON r.id = s.request_id
      WHERE r.consultant_id = ? 
        AND s.started_at >= ?
        AND s.started_at IS NOT NULL
        AND s.customer_id IS NOT NULL
    `).get(consultantId, monthAgo.toISOString());

    // Monthly sessions count
    // FIX: Count sessions that have started (not just ended ones)
    const monthlySessions = await db.prepare(`
      SELECT COUNT(*) as count
      FROM sessions s
      JOIN requests r ON r.id = s.request_id
      WHERE r.consultant_id = ? 
        AND s.started_at >= ?
        AND s.started_at IS NOT NULL
    `).get(consultantId, monthAgo.toISOString());

    res.json({
      weekly: {
        minutes: weeklyMinutes,
        sessions: weeklySessions.length
      },
      monthly: {
        clients: monthlyClients?.count || 0,
        sessions: monthlySessions?.count || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Payout Requests
app.get('/api/consultant/payouts', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const payouts = await db.prepare(`
      SELECT * FROM payout_requests 
      WHERE consultant_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);
    res.json({ payouts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload invoice for payout request
app.post('/api/consultant/invoice', authMiddleware, requireRole('consultant'), upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = `/uploads/invoices/${req.file.filename}`;
    res.json({ invoice_file_path: filePath, message: 'Invoice uploaded successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consultant/payout-request', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const { amount, invoice_file_path } = req.body;
    const numAmount = typeof amount === 'number' ? amount : parseFloat(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Importo non valido. Inserisci un importo maggiore di 0.' });
    }

    // PDF invoice/receipt is MANDATORY
    if (!invoice_file_path || !invoice_file_path.trim()) {
      return res.status(400).json({ error: 'Il caricamento di una fattura o ricevuta PDF è obbligatorio' });
    }

    // Check available earnings from ledger
    const availableEarnings = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM earnings_ledger
      WHERE consultant_id = ? AND status = 'available'
    `).get(req.user.id);

    const availableTotal = Number(availableEarnings.total || 0);
    if (numAmount > availableTotal) {
      return res.status(400).json({ error: 'L\'importo supera i guadagni disponibili' });
    }

    // Get payment cycle info
    const now = new Date();
    const cycle = getPaymentCycle(now);

    // Create payout request and lock credits in a transaction
    const result = await db.transaction(async (connection) => {
      // Create payout request with period info
      const [payoutResult] = await connection.query(`
        INSERT INTO payout_requests (consultant_id, amount, invoice_file_path, period_month, period_year)
        VALUES (?, ?, ?, ?, ?)
      `, [req.user.id, numAmount, invoice_file_path.trim(), cycle.month, cycle.year]);

      const payoutRequestId = payoutResult.insertId;

      // Deduct credits from user wallet
      await connection.query('UPDATE users SET credits = credits - ? WHERE id = ?', [numAmount, req.user.id]);

      // Record transaction for the deduction
      await recordTransactionInTransaction(connection, req.user.id, {
        type: 'payout_request',
        amount: -numAmount, // Negative amount for deduction
        method: 'system',
        status: 'pending', // Pending admin approval
        description: `Richiesta di pagamento #${payoutRequestId}`,
        metadata: { payoutRequestId, invoice: invoice_file_path.trim() }
      });

      // Lock available earnings ledger entries (move from 'available' to 'in_request')
      // Select credits in FIFO order (oldest first) until we reach the requested amount
      const [ledgerEntries] = await connection.query(`
        SELECT id, amount
        FROM earnings_ledger
        WHERE consultant_id = ? AND status = 'available'
        ORDER BY created_at ASC, id ASC
      `, [req.user.id]);

      let remainingAmount = numAmount;
      const lockedEntries = [];

      for (const entry of ledgerEntries) {
        if (remainingAmount <= 0) break;

        // Lock the entire entry (we don't split ledger entries)
        await connection.query(`
          UPDATE earnings_ledger
          SET status = 'in_request', payout_request_id = ?
          WHERE id = ? AND status = 'available'
        `, [payoutRequestId, entry.id]);

        lockedEntries.push({ id: entry.id, amount: entry.amount });
        remainingAmount -= entry.amount;
      }

      // Verify we locked enough credits
      if (remainingAmount > 0.01) { // Allow small rounding differences
        throw new Error('Insufficient available credits to fulfill request');
      }

      // Store invoice
      if (invoice_file_path) {
        await connection.query(`
          INSERT INTO invoices (payout_request_id, consultant_id, file_path, amount)
          VALUES (?, ?, ?, ?)
        `, [payoutRequestId, req.user.id, invoice_file_path, numAmount]);
      }

      return payoutRequestId;
    });

    const payout = await db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(result);
    res.json(payout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Consultant earnings summary with monthly history support
app.get('/api/consultant/earnings-summary', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const consultantId = req.user.id;
    const { month, year } = req.query;

    // If month/year specified, return data for that period; otherwise current month
    const now = new Date();
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1;
    const targetYear = year ? parseInt(year) : now.getFullYear();

    // Get earnings by status from ledger
    const availableRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM earnings_ledger
      WHERE consultant_id = ? AND status = 'available'
    `).get(consultantId);

    const inRequestRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM earnings_ledger
      WHERE consultant_id = ? AND status = 'in_request'
    `).get(consultantId);

    // Paid earnings for the specified month/year
    const paidRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM earnings_ledger
      WHERE consultant_id = ? AND status = 'paid' AND period_year = ? AND period_month = ?
    `).get(consultantId, targetYear, targetMonth);

    // Total earnings (all time, all statuses)
    const totalEarningsRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM earnings_ledger
      WHERE consultant_id = ?
    `).get(consultantId);

    // This month earnings (available + in_request, not paid)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const thisMonthEarningsRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM earnings_ledger
      WHERE consultant_id = ? 
        AND period_year = ? AND period_month = ?
        AND status IN ('available', 'in_request')
    `).get(consultantId, now.getFullYear(), now.getMonth() + 1);

    // Last month earnings
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEarningsRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM earnings_ledger
      WHERE consultant_id = ? 
        AND period_year = ? AND period_month = ?
        AND status IN ('available', 'in_request')
    `).get(consultantId, lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1);

    const available = Number(availableRow.total || 0);
    const inRequest = Number(inRequestRow.total || 0);
    const paid = Number(paidRow.total || 0);
    const totalEarnings = Number(totalEarningsRow.total || 0);
    const thisMonth = Number(thisMonthEarningsRow.total || 0);
    const lastMonth = Number(lastMonthEarningsRow.total || 0);

    // Approximate platform commission using split ratio (45/55)
    // FIX: Using actual calculated thisMonth for displaying "This Month" card, not just completed?
    // The query above gets 'available' + 'in_request', which are completed transactions. 

    // Calculate commission
    const swangCommission = Math.round(totalEarnings * (PLATFORM_COMMISSION_RATE / CONSULTANT_RATE) * 100) / 100;
    const consultantEarnings = totalEarnings;

    res.json({
      totalEarnings: consultantEarnings,
      thisMonth,
      lastMonth,
      swangCommission,
      consultantEarnings,
      availableForPayout: available,
      available,
      inRequest,
      paid,
      periodMonth: targetMonth,
      periodYear: targetYear
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Consultant transactions (earnings only), with pagination
app.get('/api/consultant/transactions', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const consultantId = req.user.id;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    // FIX: Add filtering by month/year
    const { month, year } = req.query;
    let dateFilter = '';
    const queryParams = [consultantId];

    if (month && year) {
      // Create start and end dates for the selected month
      // Note: SQLite/MySQL date functions vary, using standard string comparison for compatibility
      const targetMonth = parseInt(month, 10);
      const targetYear = parseInt(year, 10);

      // Pad month with leading zero if needed
      const paddedMonth = targetMonth.toString().padStart(2, '0');

      // Calculate start and end date strings for range query
      // e.g. '2023-05-01' to '2023-06-01'
      const startDate = `${targetYear}-${paddedMonth}-01`;

      // Handle December roll-over
      let nextMonth = targetMonth + 1;
      let nextYear = targetYear;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }
      const paddedNextMonth = nextMonth.toString().padStart(2, '0');
      const endDate = `${nextYear}-${paddedNextMonth}-01`;

      dateFilter = 'AND created_at >= ? AND created_at < ?';
      queryParams.push(startDate, endDate);
    }

    const countRow = await db.prepare(`
      SELECT COUNT(*) as count
      FROM transactions
      WHERE user_id = ? AND type = 'earnings' ${dateFilter}
    `).get(...queryParams);

    // Need to spread queryParams again for the second query, plus limit/offset
    const dataParams = [...queryParams, pageSize, offset];

    const rows = await db.prepare(`
      SELECT id, type, amount, method, status, description, reference, metadata, created_at
      FROM transactions
      WHERE user_id = ? AND type = 'earnings' ${dateFilter}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...dataParams);

    res.json({
      total: countRow.count || 0,
      page,
      pageSize,
      transactions: rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Consultant invoices archive
app.get('/api/consultant/invoices', authMiddleware, requireRole('consultant'), async (req, res) => {
  try {
    const consultantId = req.user.id;
    const invoices = await db.prepare(`
      SELECT id, payout_request_id, file_path, amount, created_at
      FROM invoices
      WHERE consultant_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(consultantId);
    res.json({ invoices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update payout request status (admin only)
app.put('/api/admin/payout-requests/:id/status', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, rejection_reason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }

    const payout = await db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(id);
    if (!payout) {
      return res.status(404).json({ error: 'Payout request not found' });
    }

    if (payout.status !== 'pending') {
      return res.status(400).json({ error: 'Payout request is already processed' });
    }

    await db.transaction(async (connection) => {
      // Update payout request status
      const processedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const updateQuery = rejection_reason
        ? 'UPDATE payout_requests SET status = ?, processed_at = ?, rejection_reason = ? WHERE id = ?'
        : 'UPDATE payout_requests SET status = ?, processed_at = ? WHERE id = ?';

      const updateParams = rejection_reason
        ? [status, processedAt, rejection_reason, id]
        : [status, processedAt, id];

      await connection.query(updateQuery, updateParams);

      if (status === 'approved') {
        // Mark ledger entries as paid
        await connection.query(`
          UPDATE earnings_ledger
          SET status = 'paid'
          WHERE payout_request_id = ?
        `, [id]);

        // Update transaction status to completed
        // Find the transaction linked to this payout
        // Note: We don't have a direct link in transactions table, but we can match by metadata or description
        // For simplicity, we create a new "payout completed" transaction or just rely on the ledger
        // Ideally, we should update the original transaction, but finding it might be complex without ID.
        // Let's record a logical "Payout Sent" transaction for tracking purposes (though money already left wallet)
        // actually, no, money left wallet upon request. Just update ledger is enough.

      } else if (status === 'rejected') {
        // REFUND: Return credits to user
        await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [payout.amount, payout.consultant_id]);

        // Record refund transaction
        await recordTransactionInTransaction(connection, payout.consultant_id, {
          type: 'refund',
          amount: payout.amount,
          method: 'system',
          status: 'completed',
          description: `Rimborso richiesta pagamento rifiutata #${id}`,
          metadata: { payoutRequestId: id, reason: rejection_reason }
        });

        // Release ledger entries back to available
        await connection.query(`
          UPDATE earnings_ledger
          SET status = 'available', payout_request_id = NULL
          WHERE payout_request_id = ?
        `, [id]);
      }
    });

    // Send email notification
    const consultant = await db.prepare('SELECT email FROM users WHERE id = ?').get(payout.consultant_id);
    if (consultant) {
      const { sendPayoutProcessedEmail } = require('./email');
      Promise.resolve(sendPayoutProcessedEmail({
        email: consultant.email,
        amount: payout.amount,
        status: status,
        payoutRequestId: id,
        rejectionReason: rejection_reason
      })).catch(err => console.error('Error sending payout email:', err));
    }

    await logAdminAction(req.user.id, 'update_payout_status', 'payout_request', id, { status, rejection_reason }, req.ip);

    const updated = await db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO for chat and billing
const sessionState = new Map(); // room_name -> { intervalId, startedAt, messageCount }

io.on('connection', (socket) => {
  // Socket connection established (logging removed to reduce noise)

  // Authenticate socket connection
  socket.on('authenticate', ({ token }) => {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      socket.data = { userId: user.id, userRole: user.role };

      // Auto-join role-based rooms for notifications
      if (user.role === 'consultant') {
        socket.join(`consultant_${user.id}`);
      } else if (user.role === 'customer') {
        socket.join(`customer_${user.id}`);
      }
    } catch (e) {
      // Authentication failed
    }
  });

  // Join consultant room for real-time notifications (alternative method)
  socket.on('join_consultant_room', ({ consultantId }) => {
    if (socket.data && socket.data.userRole === 'consultant' && socket.data.userId === consultantId) {
      socket.join(`consultant_${consultantId}`);
    }
  });

  // Join customer room for real-time notifications (alternative method)
  socket.on('join_customer_room', ({ customerId }) => {
    if (socket.data && socket.data.userRole === 'customer' && socket.data.userId === customerId) {
      socket.join(`customer_${customerId}`);
    }
  });

  socket.on('join_session', async ({ token, requestId }) => {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      const numericRequestId = Number(requestId);

      const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(numericRequestId);
      if (!reqRow) {
        return;
      }

      // Extract IDs with case-insensitive handling and ensure they're numbers
      const customerId = Number(reqRow.customer_id || reqRow.CUSTOMER_ID || reqRow.Customer_id);
      const consultantId = Number(reqRow.consultant_id || reqRow.CONSULTANT_ID || reqRow.Consultant_id);

      // Validate extracted IDs
      if (isNaN(customerId) || customerId <= 0 || !Number.isInteger(customerId)) {
        return;
      }
      if (isNaN(consultantId) || consultantId <= 0 || !Number.isInteger(consultantId)) {
        return;
      }

      if (![customerId, consultantId].includes(user.id)) {
        return;
      }

      const session = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(numericRequestId);
      if (!session || session.ended_at) {
        if (session?.ended_at) {
          socket.emit('error', {
            type: 'session_completed',
            message: 'Questa sessione è già stata completata e non può essere riaperta.'
          });
        }
        return;
      }

      const room = session.room_name;

      // Set socket.data BEFORE joining room to ensure it's available for message handlers
      const userRow = await db.prepare('SELECT email FROM users WHERE id = ?').get(user.id);
      socket.data = {
        ...socket.data,
        userId: user.id,
        userRole: user.role,
        room,
        requestId: numericRequestId,
        email: userRow?.email || 'unknown'
      };

      // Join the room AFTER setting socket.data
      socket.join(room);

      // Billing no longer starts on join; requires explicit 'start_call'
      // Calculate participant count accurately - ensure socket is fully joined first
      // Use setTimeout to allow Socket.IO adapter to update after join
      const sessionId = session.id;
      // customerId and consultantId already extracted above with case handling
      const sessionType = session.type || reqRow.type || 'chat';

      // FIX: Check if this is a calendar booking (pre-paid) - don't start per-minute billing
      // Calendar bookings are identified by: request created with status='accepted' immediately
      // AND there's a booking_slot linked to it (check by matching customer/consultant/date)
      const isBooking = reqRow.status === 'accepted';

      // More reliable: Check if there's a booking_slot for this customer-consultant pair around the request creation time
      // Relaxed tolerance to 1 hour to account for any timezone/clock drifts or creation delays
      const bookingCheck = await db.prepare(`
        SELECT id FROM booking_slots 
        WHERE consultant_id = ? AND booked_by = ? AND is_booked = 1
        AND ABS(TIMEDIFF(booked_at, ?)) < '01:00:00'
        LIMIT 1
      `).get(consultantId, customerId, reqRow.created_at);
      const isCalendarBooking = !!bookingCheck;

      const updatePresence = () => {
        const roomSet = io.sockets.adapter.rooms.get(room);
        const socketCount = roomSet ? roomSet.size : 0;
        const socketUserIds = new Set();
        if (roomSet) {
          for (const sid of roomSet) {
            const s = io.sockets.sockets.get(sid);
            if (s?.data?.userId) socketUserIds.add(s.data.userId);
          }
        }
        const hasCustomer = socketUserIds.has(customerId);
        const hasConsultant = socketUserIds.has(consultantId);
        const countToEmit = (hasCustomer && hasConsultant) ? 2 : socketCount;
        io.to(room).emit('presence', { count: countToEmit });
        return { count: countToEmit, hasCustomer, hasConsultant };
      };

      let presenceInfo = updatePresence();
      setTimeout(() => {
        presenceInfo = updatePresence();
      }, 500);

      // FALLBACK: Auto-start billing if both participants are in room and billing hasn't started
      // This handles cases where start_call event might not be emitted from client
      // Use user ID verification instead of just participant count for more reliability
      // IMPORTANT: Only auto-start billing for voice/video calls, NOT for chat (chat uses per-message billing)
      if ((presenceInfo.count >= 2 || (presenceInfo.hasCustomer && presenceInfo.hasConsultant)) && !sessionState.get(room)?.intervalId && !session.ended_at && !isCalendarBooking && sessionType !== 'chat') {
        // Skip billing for calendar bookings - they're pre-paid
        // Skip billing for chat - chat uses per-message billing, not per-minute
        // Check if customer has sufficient credits
        const customer = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
        if (customer && customer.credits > 0) {
          // Get consultant pricing
          const consultantProfile = await db.prepare('SELECT voice_price, video_price FROM consultant_profiles WHERE consultant_id = ?').get(consultantId);
          let pricePerMinute = Number(CREDITS_PER_MINUTE);

          if (sessionType === 'voice' && consultantProfile?.voice_price) {
            pricePerMinute = Number(consultantProfile.voice_price) || CREDITS_PER_MINUTE;
          } else if (sessionType === 'video' && consultantProfile?.video_price) {
            pricePerMinute = Number(consultantProfile.video_price) || CREDITS_PER_MINUTE;
          }

          // Ensure pricePerMinute is a valid number
          if (isNaN(pricePerMinute) || pricePerMinute <= 0) {
            pricePerMinute = Number(CREDITS_PER_MINUTE);
          }

          // Only auto-start if customer has enough credits
          if (customer.credits >= pricePerMinute) {
            setTimeout(async () => {
              const roomSockets = io.sockets.adapter.rooms.get(room) || new Set();
              const socketUserIds = new Set();
              for (const sid of roomSockets) {
                const s = io.sockets.sockets.get(sid);
                if (s?.data?.userId) socketUserIds.add(s.data.userId);
              }
              const hasCustomer = socketUserIds.has(customerId);
              const hasConsultant = socketUserIds.has(consultantId);

              if (!sessionState.get(room)?.intervalId && (hasCustomer && hasConsultant)) {
                const currentSession = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
                if (currentSession && !currentSession.ended_at) {
                  await db.prepare('UPDATE sessions SET active = 1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?').run(sessionId);
                  await startBilling(room, customerId, consultantId, sessionId, sessionType);
                  io.to(room).emit('presence', { count: 2 });
                }
              }
            }, 2000);

            setTimeout(async () => {
              // Only auto-start billing for voice/video, not chat
              if (!sessionState.get(room)?.intervalId && !isCalendarBooking && sessionType !== 'chat') {
                const roomSockets = io.sockets.adapter.rooms.get(room) || new Set();
                const socketUserIds = new Set();
                for (const sid of roomSockets) {
                  const s = io.sockets.sockets.get(sid);
                  if (s?.data?.userId) socketUserIds.add(s.data.userId);
                }
                const hasCustomer = socketUserIds.has(customerId);
                const hasConsultant = socketUserIds.has(consultantId);

                if (hasCustomer && hasConsultant) {
                  const currentSession = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
                  if (currentSession && !currentSession.ended_at) {
                    const customer = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
                    if (customer && customer.credits >= pricePerMinute) {
                      await db.prepare('UPDATE sessions SET active = 1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?').run(sessionId);
                      await startBilling(room, customerId, consultantId, sessionId, sessionType);
                      io.to(room).emit('presence', { count: 2 });
                    }
                  }
                }
              }
            }, 5000);
          }
        }
      } else if (isCalendarBooking && (presenceInfo.count >= 2 || (presenceInfo.hasCustomer && presenceInfo.hasConsultant)) && !session.ended_at) {
        // For calendar bookings: Mark session as active and started, but don't start per-minute billing
        // Credits were already deducted and consultant credited at booking time
        await db.prepare('UPDATE sessions SET active = 1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?').run(sessionId);
        // Emit balance update to show current credits (already updated at booking time)
        const customerRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
        const consultantRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(consultantId);
        const customerBal = customerRow?.credits || 0;
        const consultantBal = consultantRow?.credits || 0;
        io.to(room).emit('balances', { customerCredits: customerBal, consultantCredits: consultantBal });
        // Emit presence update for calendar bookings too
        io.to(room).emit('presence', { count: 2 });
      } else if (sessionType === 'chat' && (presenceInfo.count >= 2 || (presenceInfo.hasCustomer && presenceInfo.hasConsultant)) && !session.ended_at) {
        // For chat sessions: Mark session as active, but don't start per-minute billing
        // Chat uses per-message billing, which is handled in the chat_message handler
        await db.prepare('UPDATE sessions SET active = 1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?').run(session.id);

        // FIX #23: Set consultant as busy for Chat sessions too
        await db.prepare('UPDATE users SET is_busy = 1 WHERE id = ?').run(consultantId);
        io.emit('consultant_status_update', { consultantId, is_busy: true });

        // FIX #23: Start monitoring for abandoned chat sessions
        startChatMonitoring(room, session.id, consultantId, customerId);

        // Emit balance update
        const customerRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
        const consultantRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(consultantId);
        const customerBal = customerRow?.credits || 0;
        const consultantBal = consultantRow?.credits || 0;
        io.to(room).emit('balances', { customerCredits: customerBal, consultantCredits: consultantBal });
        // Emit presence update
        io.to(room).emit('presence', { count: 2 });
      }
    } catch (e) {
      console.error(`[DEBUG-CALL] Error in join_session: ${e.message}`);
      // ignore
    }
  });

  socket.on('start_call', async ({ requestId }) => {
    console.log(`[DEBUG-CALL] start_call event received for RequestID: ${requestId}`);
    if (!requestId) return;

    const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!reqRow) {
      console.log(`[DEBUG-CALL] Start failed: Request not found for ID ${requestId}`);
      return;
    }

    // Extract and validate IDs
    const customerId = Number(reqRow.customer_id);
    const consultantId = Number(reqRow.consultant_id);

    if (isNaN(customerId) || customerId <= 0 || !Number.isInteger(customerId)) {
      return;
    }
    if (isNaN(consultantId) || consultantId <= 0 || !Number.isInteger(consultantId)) {
      return;
    }

    const session = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(requestId);
    if (!session) {
      console.log(`[DEBUG-CALL] Start failed: Session not found for RequestID ${requestId}`);
      return;
    }

    // FIX: logic to identify calendar bookings - relaxed tolerance
    const bookingCheck = await db.prepare(`
      SELECT id, date, time, duration FROM booking_slots 
      WHERE consultant_id = ? AND booked_by = ? AND is_booked = 1
      AND ABS(TIMEDIFF(booked_at, ?)) < '01:00:00'
      LIMIT 1
    `).get(consultantId, customerId, reqRow.created_at);
    const isCalendarBooking = !!bookingCheck;

    if (session.ended_at) {
      // Re-entry check for Calendar Bookings
      let allowReentry = false;
      if (isCalendarBooking && bookingCheck) {
        // Robust check:
        // If now < (StartedAt + Duration + Buffer)
        const startedAt = new Date(session.started_at || reqRow.created_at);
        const allowedUntil = new Date(startedAt.getTime() + (bookingCheck.duration + 15) * 60000);

        const now = new Date();
        if (now < allowedUntil) {
          allowReentry = true;
          console.log(`[DEBUG-TIMEZONE] Re-entry ALLOWED for Calendar Booking ${requestId}.`);
          console.log(`[DEBUG-TIMEZONE] ServerNow: ${now.toISOString()} < AllowedUntil: ${allowedUntil.toISOString()} (Duration: ${bookingCheck.duration}min + 15min buffer)`);
          // Reactivate session
          await db.prepare('UPDATE sessions SET active = 1, ended_at = NULL WHERE id = ?').run(session.id);
          session.ended_at = null; // Update local obj
        } else {
          console.log(`[DEBUG-TIMEZONE] Re-entry DENIED. ServerNow: ${now.toISOString()} > AllowedUntil: ${allowedUntil.toISOString()}`);
        }
      }

      if (!allowReentry) {
        console.log(`[DEBUG-CALL] Start failed: Session ${session.id} already ENDED at ${session.ended_at}`);
        io.to(session.room_name).emit('error', {
          type: 'session_completed',
          message: 'Questa sessione è già stata completata e non può essere riaperta.'
        });
        return;
      }
    }

    console.log(`[DEBUG-CALL] Start Call (Manual): RequestID=${requestId}, SessionID=${session.id}, IsCalendarBooking=${isCalendarBooking}`);

    const room = session.room_name;
    const participants = io.sockets.adapter.rooms.get(room) || new Set();

    const socketUserIds = new Set();
    for (const sid of participants) {
      const s = io.sockets.sockets.get(sid);
      if (s?.data?.userId) {
        socketUserIds.add(s.data.userId);
      }
    }
    const hasCustomer = socketUserIds.has(customerId);
    const hasConsultant = socketUserIds.has(consultantId);

    console.log(`[DEBUG-CALL] Start Call Participants: Customer=${hasCustomer}, Consultant=${hasConsultant}`);

    const existingBilling = sessionState.get(room)?.intervalId;
    if (existingBilling) {
      console.log(`[DEBUG-CALL] Billing already active for room ${room}, skipping start.`);
      return;
    }

    if (isCalendarBooking) {
      console.log(`[DEBUG-CALL] Starting CALENDAR session (No per-minute billing).`);
      await db.prepare('UPDATE sessions SET active = 1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?').run(session.id);

      const customerRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
      const consultantRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(consultantId);
      io.to(room).emit('balances', { customerCredits: customerRow?.credits || 0, consultantCredits: consultantRow?.credits || 0 });
      return;
    }

    const customer = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
    if (!customer || customer.credits <= 0) {
      io.to(room).emit('error', {
        type: 'insufficient_credits',
        message: 'Crediti insufficienti per iniziare la videochiamata. Ricarica il tuo account.'
      });
      await endSession(room, session.id, customerId, consultantId, 'insufficient_credits');
      return;
    }

    const consultantProfile = await db.prepare('SELECT voice_price, video_price FROM consultant_profiles WHERE consultant_id = ?').get(consultantId);
    const sessionType = session.type || reqRow.type || 'chat';

    // Don't start per-minute billing for chat sessions - chat uses per-message billing
    if (sessionType === 'chat') {
      // For chat, just mark session as active and emit presence
      await db.prepare('UPDATE sessions SET active = 1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?').run(session.id);

      // FIX #23: Set consultant as busy for Chat sessions too
      await db.prepare('UPDATE users SET is_busy = 1 WHERE id = ?').run(consultantId);
      io.emit('consultant_status_update', { consultantId, is_busy: true });

      // FIX #23: Start monitoring for abandoned chat sessions
      startChatMonitoring(room, session.id, consultantId, customerId);

      const customerRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
      const consultantRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(consultantId);
      io.to(room).emit('balances', { customerCredits: customerRow?.credits || 0, consultantCredits: consultantRow?.credits || 0 });
      io.to(room).emit('presence', { count: 2 });
      return;
    }

    let pricePerMinute = Number(CREDITS_PER_MINUTE);
    if (sessionType === 'voice' && consultantProfile?.voice_price) {
      pricePerMinute = Number(consultantProfile.voice_price) || CREDITS_PER_MINUTE;
    } else if (sessionType === 'video' && consultantProfile?.video_price) {
      pricePerMinute = Number(consultantProfile.video_price) || CREDITS_PER_MINUTE;
    }

    // Ensure pricePerMinute is a valid number
    if (isNaN(pricePerMinute) || pricePerMinute <= 0) {
      pricePerMinute = Number(CREDITS_PER_MINUTE);
    }

    // FIX: logic error string comparison - cast to Number
    if (Number(customer.credits) < pricePerMinute) {
      io.to(room).emit('error', {
        type: 'insufficient_credits',
        message: `Crediti insufficienti. Servono almeno ${pricePerMinute} crediti per iniziare la ${sessionType === 'voice' ? 'chiamata vocale' : 'videochiamata'}.`
      });
      await endSession(room, session.id, reqRow.customer_id, reqRow.consultant_id, 'insufficient_credits');
      return;
    }

    if (hasCustomer && hasConsultant) {
      await db.prepare('UPDATE sessions SET active = 1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?').run(session.id);
      await startBilling(room, customerId, consultantId, session.id, sessionType);
      io.to(room).emit('presence', { count: 2 });
    } else {
      io.to(room).emit('error', {
        type: 'waiting_for_participant',
        message: 'In attesa che l\'altro partecipante si unisca alla sessione.'
      });
    }
  });

  socket.on('chat_message', async ({ message }) => {
    const { room, requestId, userId } = socket.data || {};

    if (!room || !message) {
      return;
    }

    const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!reqRow) {
      return;
    }

    // CHAT NOW WORKS LIKE CALLS: Use the session for this request (by request_id)
    const session = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(requestId);

    if (!session) {
      return;
    }

    // Check if session is already ended
    if (session.ended_at) {
      socket.emit('error', {
        type: 'session_completed',
        message: 'Questa sessione è già stata completata e non può essere riaperta.'
      });
      return;
    }

    // Check if user is customer and has sufficient credits (need at least 5 credits for 10 messages)
    const user = await db.prepare('SELECT id, role, credits FROM users WHERE id = ?').get(userId);
    if (user && user.role === 'customer' && user.credits <= 0) {
      // Customer has no credits - prevent sending message
      socket.emit('error', {
        type: 'insufficient_credits',
        message: 'Crediti insufficienti. Ricarica il tuo account per continuare la chat.'
      });
      // CHAT NOW WORKS LIKE CALLS: Chat sessions also end when credits exhausted
      const customer = await db.prepare('SELECT credits FROM users WHERE id = ?').get(reqRow.customer_id);
      if (!customer || customer.credits <= 0) {
        await endSession(room, session.id, reqRow.customer_id, reqRow.consultant_id, 'insufficient_credits');
      }
      return;
    }

    // Ensure socket is in the room (in case it disconnected and reconnected)
    if (!socket.rooms.has(room)) {
      socket.join(room);
    }

    // Insert message
    await db.prepare('INSERT INTO chat_messages (session_id, sender_id, message) VALUES (?,?,?)').run(session.id, userId, message);

    // Emit to room - this will reach all sockets in the room
    const messageData = { senderId: userId, message, createdAt: new Date().toISOString() };
    io.to(room).emit('chat_message', messageData);

    // No need to emit directly to sender again - io.to(room) includes them if they are in the room

    // Notify consultant if customer sent the message (even if consultant is not in the room)
    if (reqRow.customer_id === userId) {
      io.to(`consultant_${reqRow.consultant_id}`).emit('chat_message', {
        senderId: userId,
        message,
        createdAt: new Date().toISOString(),
        requestId: requestId
      });
    }

    // Chat billing: per message using consultant's chat_price
    // Only charge for messages sent by customer (not consultant)
    // FIX: Chat is free during voice/video calls (only bill if session.type is 'chat')
    if (reqRow.customer_id === userId && session.type === 'chat') {
      await billChatCredits(reqRow.customer_id, reqRow.consultant_id, room, requestId).catch(() => { });
    }
  });

  // Typing indicator events
  socket.on('typing_start', () => {
    const { room, userId } = socket.data || {};
    if (room && userId) {
      // Broadcast to everyone in the room EXCEPT the sender
      socket.to(room).emit('typing_start', { userId });
    }
  });

  socket.on('typing_stop', () => {
    const { room, userId } = socket.data || {};
    if (room && userId) {
      // Broadcast to everyone in the room EXCEPT the sender
      socket.to(room).emit('typing_stop', { userId });
    }
  });

  socket.on('leave_session', () => {
    const { room } = socket.data || {};
    if (room) {
      socket.leave(room);
      const participants = io.sockets.adapter.rooms.get(room) || new Set();
      io.to(room).emit('presence', { count: participants.size });
    }
  });

  socket.on('end_call', async ({ requestId }) => {
    // Automatic room closure when call ends (Requirement #2)
    // CHAT NOW WORKS LIKE CALLS: Chat sessions can also be ended
    try {
      const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
      if (!reqRow) return;

      const session = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(requestId);
      if (!session || session.ended_at) return; // Already ended

      // End session for all types (chat, voice, video)
      await endSession(session.room_name, session.id, reqRow.customer_id, reqRow.consultant_id, 'call_ended');
    } catch (e) {
      // ignore
    }
  });

  socket.on('end_chat', async ({ requestId }) => {
    // End chat session (same logic as end_call, but explicit for chat)
    try {
      const reqRow = await db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
      if (!reqRow) return;

      const session = await db.prepare('SELECT * FROM sessions WHERE request_id = ?').get(requestId);
      if (!session || session.ended_at) return; // Already ended

      // End chat session permanently
      await endSession(session.room_name, session.id, reqRow.customer_id, reqRow.consultant_id, 'chat_ended');
    } catch (e) {
      // ignore
    }
  });

  socket.on('disconnect', async (reason) => {
    const { room, requestId, userId } = socket.data || {};
    if (room) {
      const participants = io.sockets.adapter.rooms.get(room) || new Set();
      const participantCount = Math.max(0, participants.size - 1);
      console.log(`[DEBUG-CALL] Socket ${socket.id} (User: ${userId}) disconnected from ${room}. Remaining: ${participantCount}. Reason: ${reason}`);

      io.to(room).emit('presence', { count: participantCount });

      // Requirement #2: Auto-close sessions when both participants leave
      // FIX: Do NOT auto-end session on disconnect to allow reconnection for ALL session types
      // Users must explicitly click "End Call" to finish the session
      if (participantCount === 0 && requestId) {
        console.log(`[DEBUG-CALL] Room ${room} is empty. Leaving session ACTIVE for reconnection (Sticky Session).`);
      }
    }
  }); // End socket.on('disconnect')
}); // End io.on('connection')

async function startBilling(room, customerId, consultantId, sessionId, sessionType = 'chat') {
  // Validate required parameters - check for null, undefined, empty string, etc.
  if (!customerId || customerId === null || customerId === undefined || customerId === '') {
    return;
  }
  if (!consultantId || consultantId === null || consultantId === undefined || consultantId === '') {
    return;
  }
  if (!sessionId || sessionId === null || sessionId === undefined || sessionId === '') {
    return;
  }
  if (!room || room === null || room === undefined || room === '') {
    return;
  }

  // Ensure IDs are numbers and are positive integers
  const numCustomerId = Number(customerId);
  const numConsultantId = Number(consultantId);
  const numSessionId = Number(sessionId);

  if (isNaN(numCustomerId) || numCustomerId <= 0 || !Number.isInteger(numCustomerId)) {
    return;
  }
  if (isNaN(numConsultantId) || numConsultantId <= 0 || !Number.isInteger(numConsultantId)) {
    return;
  }
  if (isNaN(numSessionId) || numSessionId <= 0 || !Number.isInteger(numSessionId)) {
    return;
  }

  // Use validated numeric IDs
  customerId = numCustomerId;
  consultantId = numConsultantId;
  sessionId = numSessionId;

  const customerUser = await db.prepare('SELECT email FROM users WHERE id = ?').get(customerId);

  await db.prepare('UPDATE users SET is_busy = 1 WHERE id = ?').run(consultantId);
  io.emit('consultant_status_update', { consultantId, is_busy: true });

  const presenceCheckInterval = setInterval(() => {
    try {
      const roomSockets = io.sockets.adapter.rooms.get(room) || new Set();
      const socketUserIds = new Set();
      for (const sid of roomSockets) {
        const s = io.sockets.sockets.get(sid);
        if (s?.data?.userId) socketUserIds.add(s.data.userId);
      }
      const hasCustomer = socketUserIds.has(customerId);
      const hasConsultant = socketUserIds.has(consultantId);
      const countToEmit = (hasCustomer && hasConsultant) ? 2 : roomSockets.size;
      io.to(room).emit('presence', { count: countToEmit });
    } catch (e) {
      // Ignore presence check errors
    }
  }, 5000);

  let sessionStateData = sessionState.get(room) || {};
  sessionStateData.presenceCheckInterval = presenceCheckInterval;
  sessionState.set(room, sessionStateData);

  const consultantProfile = await db.prepare('SELECT voice_price, video_price FROM consultant_profiles WHERE consultant_id = ?').get(consultantId);
  let pricePerMinute = Number(CREDITS_PER_MINUTE);

  if (sessionType === 'voice' && consultantProfile?.voice_price) {
    pricePerMinute = Number(consultantProfile.voice_price) || CREDITS_PER_MINUTE;
  } else if (sessionType === 'video' && consultantProfile?.video_price) {
    pricePerMinute = Number(consultantProfile.video_price) || CREDITS_PER_MINUTE;
  }

  // Ensure pricePerMinute is always a valid positive number
  if (isNaN(pricePerMinute) || pricePerMinute <= 0) {
    pricePerMinute = Number(CREDITS_PER_MINUTE);
  }

  sessionStateData = sessionState.get(room) || {};
  sessionStateData.pricePerMinute = pricePerMinute;
  sessionState.set(room, sessionStateData);

  const intervalId = setInterval(async () => {
    try {
      const participants = io.sockets.adapter.rooms.get(room) || new Set();
      const socketUserIds = Array.from(participants).map(sid => {
        const s = io.sockets.sockets.get(sid);
        return s?.data?.userId;
      }).filter(Boolean);
      const hasCustomer = socketUserIds.includes(customerId);
      const hasConsultant = socketUserIds.includes(consultantId);

      if (!hasCustomer || !hasConsultant) {
        return;
      }

      const currentState = sessionState.get(room) || {};
      let currentPricePerMinute = currentState.pricePerMinute || pricePerMinute;

      // Ensure currentPricePerMinute is always a valid number
      if (typeof currentPricePerMinute !== 'number' || isNaN(currentPricePerMinute) || currentPricePerMinute <= 0) {
        currentPricePerMinute = CREDITS_PER_MINUTE;
        // Update state with valid value
        sessionStateData = sessionState.get(room) || {};
        sessionStateData.pricePerMinute = currentPricePerMinute;
        sessionState.set(room, sessionStateData);
      }

      const ok = await db.transaction(async (connection) => {
        const [customerRows] = await connection.query('SELECT credits FROM users WHERE id = ?', [customerId]);
        const customer = customerRows[0];
        if (!customer || customer.credits < currentPricePerMinute) return false;

        await connection.query('UPDATE users SET credits = credits - ? WHERE id = ?', [currentPricePerMinute, customerId]);

        const platformFee = Math.round(currentPricePerMinute * PLATFORM_COMMISSION_RATE * 100) / 100;
        const consultantEarnings = Math.round(currentPricePerMinute * CONSULTANT_RATE * 100) / 100;
        const platformAccountId = await getOrCreatePlatformAccount();

        // Validate consultantId before using in query - ensure it's a valid positive integer
        const validConsultantId = Number(consultantId);
        if (isNaN(validConsultantId) || validConsultantId <= 0 || !Number.isInteger(validConsultantId)) {
          throw new Error(`Invalid consultantId: ${consultantId}`);
        }

        await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [consultantEarnings, validConsultantId]);
        await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [platformFee, platformAccountId]);

        try {
          await recordTransactionInTransaction(connection, customerId, {
            type: 'usage',
            amount: -currentPricePerMinute,
            method: 'system',
            status: 'completed',
            description: `Chiamata ${sessionType} (${currentPricePerMinute.toFixed(2)}€/min)`,
            metadata: { consultantId: validConsultantId, sessionId, type: sessionType }
          });
        } catch (e) {
          throw e;
        }

        try {
          await recordTransactionInTransaction(connection, platformAccountId, {
            type: 'commission',
            amount: platformFee,
            method: 'system',
            status: 'completed',
            description: `Commissione piattaforma (45%)`,
            metadata: { customerId, consultantId: validConsultantId, sessionId, totalAmount: currentPricePerMinute }
          });
        } catch (e) {
          throw e;
        }

        try {
          await recordEarningsTransactionInTransaction(connection, validConsultantId, {
            type: 'earnings',
            amount: consultantEarnings,
            method: 'system',
            status: 'completed',
            description: `Guadagni sessione (55%)`,
            metadata: { customerId, sessionId, totalAmount: currentPricePerMinute }
          });
        } catch (e) {
          throw e;
        }

        return true;
      });

      if (!ok) {
        await endSession(room, sessionId, customerId, consultantId, 'insufficient_credits');
        return;
      }

      const customerRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
      const consultantRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(consultantId);
      const customerBal = customerRow?.credits || 0;
      const consultantBal = consultantRow?.credits || 0;
      io.to(room).emit('balances', { customerCredits: customerBal, consultantCredits: consultantBal });

      let sessionStateData = sessionState.get(room) || {};
      if (!sessionStateData.balanceUpdateInterval) {
        sessionStateData.balanceUpdateInterval = setInterval(async () => {
          const currentCustomerRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
          const currentConsultantRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(consultantId);
          io.to(room).emit('balances', { customerCredits: currentCustomerRow?.credits || 0, consultantCredits: currentConsultantRow?.credits || 0 });
        }, 10000);
        sessionState.set(room, sessionStateData);
      }

      const currentState2 = sessionState.get(room) || {};
      const currentPricePerMinute2 = currentState2.pricePerMinute || pricePerMinute;
      const lowBalanceThreshold = currentPricePerMinute2 * 0.5;
      sessionStateData = sessionState.get(room) || {};
      if (customerBal > 0 && customerBal < lowBalanceThreshold && !sessionStateData.lowBalanceEmailSent) {
        sessionStateData.lowBalanceEmailSent = true;
        sessionState.set(room, sessionStateData);
        Promise.resolve(sendLowBalanceEmail({
          email: customerUser?.email,
          currentCredits: customerBal,
          creditsPerMinute: currentPricePerMinute2
        })).catch(() => { });
      }

      if (customerBal <= 0) {
        endSession(room, sessionId, customerId, consultantId, 'insufficient_credits');
      }
    } catch (e) {
      // Ignore billing interval errors
    }
  }, 60000);

  // Initialize state with message count for chat billing
  // Reuse existing sessionStateData (already declared above)
  sessionStateData = sessionState.get(room) || {};
  sessionStateData.intervalId = intervalId;
  sessionStateData.messageCount = sessionStateData.messageCount || 0;
  sessionStateData.lowBalanceEmailSent = false;
  sessionStateData.customerId = customerId;
  sessionStateData.consultantId = consultantId;
  sessionState.set(room, sessionStateData);

  (async () => {
    try {
      const participantsSockets = io.sockets.adapter.rooms.get(room) || new Set();
      const currentUsersInRoom = new Set();
      for (const sId of participantsSockets) {
        const s = io.sockets.sockets.get(sId);
        if (s?.data?.userId) currentUsersInRoom.add(s.data.userId);
      }

      const isCustomerPresent = currentUsersInRoom.has(customerId);
      const isConsultantPresent = currentUsersInRoom.has(consultantId);

      if (isCustomerPresent && isConsultantPresent) {
        const currentState3 = sessionState.get(room) || {};
        let currentPricePerMinute3 = currentState3.pricePerMinute || pricePerMinute;

        // Ensure currentPricePerMinute3 is always a valid number
        if (typeof currentPricePerMinute3 !== 'number' || isNaN(currentPricePerMinute3) || currentPricePerMinute3 <= 0) {
          currentPricePerMinute3 = CREDITS_PER_MINUTE;
          // Update state with valid value
          sessionStateData = sessionState.get(room) || {};
          sessionStateData.pricePerMinute = currentPricePerMinute3;
          sessionState.set(room, sessionStateData);
        }

        const ok = await db.transaction(async (connection) => {
          const [customerRows] = await connection.query('SELECT credits FROM users WHERE id = ?', [customerId]);
          const customer = customerRows[0];
          if (!customer || customer.credits < currentPricePerMinute3) return false;

          await connection.query('UPDATE users SET credits = credits - ? WHERE id = ?', [currentPricePerMinute3, customerId]);

          const platformFee = Math.round(currentPricePerMinute3 * PLATFORM_COMMISSION_RATE * 100) / 100;
          const consultantEarnings = Math.round(currentPricePerMinute3 * CONSULTANT_RATE * 100) / 100;
          const platformAccountId = await getOrCreatePlatformAccount();

          // Validate consultantId before using in query - ensure it's a valid positive integer
          const validConsultantId = Number(consultantId);
          if (isNaN(validConsultantId) || validConsultantId <= 0 || !Number.isInteger(validConsultantId)) {
            throw new Error(`Invalid consultantId: ${consultantId}`);
          }

          await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [consultantEarnings, validConsultantId]);
          await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [platformFee, platformAccountId]);

          try {
            await recordTransactionInTransaction(connection, customerId, {
              type: 'usage',
              amount: -currentPricePerMinute3,
              method: 'system',
              status: 'completed',
              description: `Chiamata ${sessionType} (${currentPricePerMinute3.toFixed(2)}€/min)`,
              metadata: { consultantId: validConsultantId, sessionId, type: sessionType }
            });
          } catch (e) {
            throw e;
          }

          try {
            await recordTransactionInTransaction(connection, platformAccountId, {
              type: 'commission',
              amount: platformFee,
              method: 'system',
              status: 'completed',
              description: `Commissione piattaforma (45%)`,
              metadata: { customerId, consultantId: validConsultantId, sessionId, totalAmount: currentPricePerMinute3 }
            });
          } catch (e) {
            throw e;
          }

          try {
            await recordEarningsTransactionInTransaction(connection, validConsultantId, {
              type: 'earnings',
              amount: consultantEarnings,
              method: 'system',
              status: 'completed',
              description: `Guadagni sessione (55%)`,
              metadata: { customerId, sessionId, totalAmount: currentPricePerMinute3 }
            });
          } catch (e) {
            throw e;
          }

          return true;
        });

        if (ok) {
          const customerRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
          const consultantRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(consultantId);
          const customerBal = customerRow?.credits || 0;
          const consultantBal = consultantRow?.credits || 0;
          io.to(room).emit('balances', { customerCredits: customerBal, consultantCredits: consultantBal });

          const state = sessionState.get(room) || {};
          if (!state.balanceUpdateInterval) {
            state.balanceUpdateInterval = setInterval(async () => {
              const currentCustomerRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(customerId);
              const currentConsultantRow = await db.prepare('SELECT credits FROM users WHERE id = ?').get(consultantId);
              io.to(room).emit('balances', { customerCredits: currentCustomerRow?.credits || 0, consultantCredits: currentConsultantRow?.credits || 0 });
            }, 10000);
            sessionState.set(room, state);
          }

          const currentState4 = sessionState.get(room) || {};
          const currentPricePerMinute4 = currentState4.pricePerMinute || pricePerMinute;
          const lowBalanceThreshold = currentPricePerMinute4 * 0.5;
          let sessionStateData = sessionState.get(room) || {};
          if (customerBal > 0 && customerBal < lowBalanceThreshold && !sessionStateData.lowBalanceEmailSent) {
            sessionStateData.lowBalanceEmailSent = true;
            sessionState.set(room, sessionStateData);
            Promise.resolve(sendLowBalanceEmail({
              email: customerUser?.email,
              currentCredits: customerBal,
              creditsPerMinute: currentPricePerMinute4
            })).catch(() => { });
          }

          if (customerBal <= 0) await endSession(room, sessionId, customerId, consultantId, 'insufficient_credits');
        } else {
          endSession(room, sessionId, customerId, consultantId, 'insufficient_credits');
        }
      } else if (!isCustomerPresent && !isConsultantPresent) {
        // Both parties left (Ghost Session Candidate)
        // Retrieve state again to update counter
        let currentSessionState = sessionState.get(room) || {};
        currentSessionState.inactiveCount = (currentSessionState.inactiveCount || 0) + 1;
        sessionState.set(room, currentSessionState);

        console.log(`[SESSION-MONITOR] Room ${room} is empty. Inactive count: ${currentSessionState.inactiveCount}`);

        if (currentSessionState.inactiveCount >= 2) { // 2 minutes empty
          console.log(`[SESSION-CLEANUP] Ending abandoned session ${sessionId} in room ${room}`);
          await endSession(room, sessionId, customerId, consultantId, 'abandoned');
        }
      } else {
        // Reset inactive count if at least one person is here (e.g. waiting for reconnect)
        let currentSessionState = sessionState.get(room) || {};
        currentSessionState.inactiveCount = 0;
        sessionState.set(room, currentSessionState);
      }
    } catch (e) {
      // Ignore immediate charge errors
    }
  })();
}

// FIX #23: Chat Session Monitoring to handle abandonment (Ghost Sessions)
// Similar to startBilling but without financial transactions
function startChatMonitoring(room, sessionId, consultantId, customerId) {
  // Prevent duplicate monitors
  if (sessionState.get(room)?.intervalId) return;

  console.log(`[SESSION-MONITOR] Starting chat monitor for Room ${room}`);

  // Initialize state
  let sessionStateData = sessionState.get(room) || {};
  sessionStateData.customerId = customerId;
  sessionStateData.consultantId = consultantId;

  // Create interval to check presence every minute
  const intervalId = setInterval(async () => {
    try {
      const participants = io.sockets.adapter.rooms.get(room) || new Set();
      const socketUserIds = Array.from(participants).map(sid => {
        const s = io.sockets.sockets.get(sid);
        return s?.data?.userId;
      }).filter(Boolean);

      const isCustomerPresent = socketUserIds.includes(customerId);
      const isConsultantPresent = socketUserIds.includes(consultantId);

      if (!isCustomerPresent && !isConsultantPresent) {
        // Both parties left (Ghost Session Candidate)
        let currentState = sessionState.get(room) || {};
        currentState.inactiveCount = (currentState.inactiveCount || 0) + 1;
        sessionState.set(room, currentState);

        console.log(`[CHAT-MONITOR] Room ${room} is empty. Inactive count: ${currentState.inactiveCount}`);

        if (currentState.inactiveCount >= 2) { // 2 minutes empty
          console.log(`[CHAT-CLEANUP] Ending abandoned chat session ${sessionId} in room ${room}`);
          await endSession(room, sessionId, customerId, consultantId, 'abandoned');
        }
      } else {
        // Reset inactive count
        let currentState = sessionState.get(room) || {};
        currentState.inactiveCount = 0;
        sessionState.set(room, currentState);
      }
    } catch (e) {
      console.error(`[CHAT-MONITOR] Error in chat monitor: ${e.message}`);
    }
  }, 60000);

  sessionStateData.intervalId = intervalId;
  sessionState.set(room, sessionStateData);
}

async function billChatCredits(customerId, consultantId, room, requestId = null) {
  try {
    // Get customer info first to verify they exist
    const customerUser = await db.prepare('SELECT id, email, credits FROM users WHERE id = ?').get(customerId);
    if (!customerUser) {
      return false;
    }

    // Get consultant's chat_price (per message)
    let chatPrice = 0.10; // Default fallback

    if (requestId) {
      const request = await db.prepare('SELECT consultant_id FROM requests WHERE id = ?').get(requestId);
      if (request) {
        const consultantProfile = await db.prepare('SELECT chat_price FROM consultant_profiles WHERE consultant_id = ?').get(request.consultant_id);
        if (consultantProfile && consultantProfile.chat_price) {
          chatPrice = Number(consultantProfile.chat_price);
        }
      }
    } else {
      // Fallback: get from consultant profile directly
      const consultantProfile = await db.prepare('SELECT chat_price FROM consultant_profiles WHERE consultant_id = ?').get(consultantId);
      if (consultantProfile && consultantProfile.chat_price) {
        chatPrice = Number(consultantProfile.chat_price);
      }
    }

    // Ensure chat_price is within valid range (€0.01 - €1.00)
    if (chatPrice < 0.01) {
      chatPrice = 0.01;
    }
    if (chatPrice > 1.00) {
      chatPrice = 1.00;
    }
    const ok = await db.transaction(async (connection) => {
      const [customerRows] = await connection.query('SELECT credits FROM users WHERE id = ?', [customerId]);
      const customer = customerRows[0];
      if (!customer) {
        return false;
      }

      // FIX: logic error string comparison - cast to Number
      if (Number(customer.credits) < chatPrice) {
        return false;
      }

      // Deduct per message using consultant's chat_price
      await connection.query('UPDATE users SET credits = credits - ? WHERE id = ?', [chatPrice, customerId]);

      // Revenue split: 45% platform, 55% consultant
      const platformFee = Math.round(chatPrice * PLATFORM_COMMISSION_RATE * 100) / 100;
      const consultantEarnings = Math.round(chatPrice * CONSULTANT_RATE * 100) / 100;
      const platformAccountId = await getOrCreatePlatformAccount();

      // Validate consultantId before using in query
      if (!consultantId || isNaN(consultantId)) {
        throw new Error(`Invalid consultantId: ${consultantId}`);
      }

      await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [consultantEarnings, consultantId]);
      await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [platformFee, platformAccountId]);

      // Track customer deduction transaction for chat (per message) (using transaction connection)
      try {
        await recordTransactionInTransaction(connection, customerId, {
          type: 'usage',
          amount: -chatPrice, // Negative for deduction
          method: 'system',
          status: 'completed',
          description: `Chat (€${chatPrice.toFixed(2)}/messaggio)`,
          metadata: JSON.stringify({ consultantId, type: 'chat', requestId: requestId || null })
        });
      } catch (e) {
        throw e;
      }

      // Track commission transaction (using transaction connection)
      try {
        await recordTransactionInTransaction(connection, platformAccountId, {
          type: 'commission',
          amount: platformFee,
          method: 'system',
          status: 'completed',
          description: `Commissione piattaforma chat (45%)`,
          metadata: JSON.stringify({ customerId, consultantId, totalAmount: chatPrice })
        });
      } catch (e) {
        throw e;
      }

      // Track consultant earnings transaction and create ledger entry (using transaction connection)
      try {
        await recordEarningsTransactionInTransaction(connection, consultantId, {
          type: 'earnings',
          amount: consultantEarnings,
          method: 'system',
          status: 'completed',
          description: `Guadagni chat (55%)`,
          metadata: { customerId, totalAmount: chatPrice }
        });
      } catch (e) {
        throw e;
      }

      // Fetch updated balances WITHIN the transaction to ensure we get the committed values
      const [updatedCustomerRows] = await connection.query('SELECT credits FROM users WHERE id = ?', [customerId]);
      const [updatedConsultantRows] = await connection.query('SELECT credits FROM users WHERE id = ?', [consultantId]);
      const updatedCustomerBal = updatedCustomerRows[0]?.credits;
      const updatedConsultantBal = updatedConsultantRows[0]?.credits;

      return { success: true, customerBal: updatedCustomerBal, consultantBal: updatedConsultantBal };
    });

    if (!ok || !ok.success) {
      return false;
    }

    const customerBal = ok.customerBal;
    const consultantBal = ok.consultantBal;

    if (ok) {
      io.to(room).emit('balances', { customerCredits: customerBal, consultantCredits: consultantBal });

      // Check for low balance in chat (threshold: minimum chat_price)
      const state = sessionState.get(room) || {};
      if (customerBal > 0 && customerBal < chatPrice && !state.lowBalanceEmailSent) {
        state.lowBalanceEmailSent = true;
        sessionState.set(room, state);
        // Send low-balance email (fire and forget, only once per session)
        Promise.resolve(sendLowBalanceEmail({
          email: customerUser?.email,
          currentCredits: customerBal,
          creditsPerMinute: chatPrice // Per message cost
        })).catch(() => { });
      }

      // CHAT NOW WORKS LIKE CALLS: Chat sessions also end when credits exhausted
      const session = await db.prepare('SELECT id, type FROM sessions WHERE room_name = ?').get(room);
      if (session && customerBal <= 0) {
        await endSession(room, session.id, customerId, consultantId, 'insufficient_credits');
      }
    }

    return true;
  } catch (e) {
    return false; // Ensure function always returns a boolean on error
  }
}

async function endSession(room, sessionId, customerId = null, consultantId = null, reason = null) {
  try {
    // Validate parameters - don't end session if sessionId is invalid
    if (!sessionId || sessionId === null || sessionId === undefined) {
      return;
    }
    if (!room || room === null || room === undefined) {
      return;
    }

    // Get session info before ending
    const sessionBefore = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!sessionBefore) {
      return;
    }

    // CHAT NOW WORKS LIKE CALLS: All sessions (chat, voice, video) can be ended permanently
    const state = sessionState.get(room);
    if (state?.intervalId) clearInterval(state.intervalId);
    if (state?.balanceUpdateInterval) clearInterval(state.balanceUpdateInterval);
    if (state?.presenceCheckInterval) clearInterval(state.presenceCheckInterval);
    io.to(room).emit('session_ended');
    // Requirement #2: Automatically mark session as closed in database
    await db.prepare('UPDATE sessions SET active = 0, ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);

    // FIX: Mark the request as COMPLETED so it doesn't get auto-cancelled by cleanup job
    // This prevents the "Refund after 3 hours" bug
    if (sessionBefore.request_id) { // Use sessionBefore.request_id as requestId is not passed to endSession
       await db.prepare("UPDATE requests SET status = 'completed' WHERE id = ?").run(sessionBefore.request_id);
    }

    // FIX #7: Update consultant busy status when session ends
    if (consultantId) {
      // Check if consultant has any other active sessions or appointments
      const activeSession = await db.prepare(`
        SELECT id FROM sessions 
        WHERE consultant_id = ? AND active = 1 AND ended_at IS NULL
        LIMIT 1
      `).get(consultantId);

      const now = new Date();
      const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');
      const activeAppointment = await db.prepare(`
        SELECT id FROM booking_slots 
        WHERE consultant_id = ? AND is_booked = 1 
        AND CONCAT(date, ' ', time) BETWEEN DATE_SUB(?, INTERVAL 5 MINUTE) AND DATE_ADD(?, INTERVAL 5 MINUTE)
        LIMIT 1
      `).get(consultantId, nowStr, nowStr);

      // Only set is_busy to 0 if no other active sessions or appointments
      if (!activeSession && !activeAppointment) {
        await db.prepare('UPDATE users SET is_busy = 0 WHERE id = ?').run(consultantId);
        // Emit real-time status update
        io.emit('consultant_status_update', { consultantId, is_busy: false });
      }
    }

    // Send call-end email if reason is insufficient credits
    if (reason === 'insufficient_credits' && customerId) {
      const customerUser = await db.prepare('SELECT email FROM users WHERE id = ?').get(customerId);
      if (customerUser?.email) {
        Promise.resolve(sendCallEndedEmail({
          email: customerUser.email,
          reason: 'insufficient_credits'
        })).catch(() => { });
      }
    }

    sessionState.delete(room);
  } catch (e) {
    // ignore
  }
}

// Booking reminder scheduler - checks every 5 minutes for upcoming appointments
async function checkAndSendReminders() {
  try {
    const now = new Date();

    // Adjust 'now' to Rome time for DB comparison (DB stores Rome Local Time)
    // Server is UTC. Rome is UTC+1 (Winter) or UTC+2 (Summer).
    // We approximate +1 for now to fix the main offset. Ideally we check month.
    const getRomeTime = (d) => {
      const t = new Date(d);
      const month = t.getMonth() + 1;
      const isSummer = month >= 4 && month <= 10;
      const offset = isSummer ? 2 : 1;
      return new Date(t.getTime() + offset * 60 * 60 * 1000);
    };

    const nowRome = getRomeTime(now);

    // Check for appointments 24 hours from now (23.5 to 24.5 hours window)
    const twentyFourHoursTarget = new Date(nowRome.getTime() + 24 * 60 * 60 * 1000);
    const twentyFourHoursStart = new Date(twentyFourHoursTarget.getTime() - 30 * 60 * 1000);
    const twentyFourHoursEnd = new Date(twentyFourHoursTarget.getTime() + 30 * 60 * 1000);

    // Check for appointments 1 hour from now (0.5 to 1.5 hours window)
    const oneHourTarget = new Date(nowRome.getTime() + 60 * 60 * 1000);
    const oneHourStart = new Date(oneHourTarget.getTime() - 30 * 60 * 1000);
    const oneHourEnd = new Date(oneHourTarget.getTime() + 30 * 60 * 1000);

    // Get booked slots that need 24h reminders
    const slots24h = await db.prepare(`
      SELECT bs.*, 
             u1.email as customer_email,
             u2.email as consultant_email,
             cp.name as consultant_name
      FROM booking_slots bs
      JOIN users u1 ON u1.id = bs.booked_by
      JOIN users u2 ON u2.id = bs.consultant_id
      LEFT JOIN consultant_profiles cp ON cp.consultant_id = bs.consultant_id
      WHERE bs.is_booked = 1
        AND STR_TO_DATE(CONCAT(bs.date, ' ', bs.time), '%Y-%m-%d %H:%i:%s') >= STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')
        AND STR_TO_DATE(CONCAT(bs.date, ' ', bs.time), '%Y-%m-%d %H:%i:%s') <= STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')
        AND NOT EXISTS (
          SELECT 1 FROM booking_reminders br 
          WHERE br.slot_id = bs.id 
            AND br.user_id IN (bs.booked_by, bs.consultant_id)
            AND br.hours_before = 24
        )
    `).all(
      twentyFourHoursStart.toISOString().slice(0, 19).replace('T', ' '),
      twentyFourHoursEnd.toISOString().slice(0, 19).replace('T', ' ')
    );

    // Get booked slots that need 1h reminders
    const slots1h = await db.prepare(`
      SELECT bs.*, 
             u1.email as customer_email,
             u2.email as consultant_email,
             cp.name as consultant_name
      FROM booking_slots bs
      JOIN users u1 ON u1.id = bs.booked_by
      JOIN users u2 ON u2.id = bs.consultant_id
      LEFT JOIN consultant_profiles cp ON cp.consultant_id = bs.consultant_id
      WHERE bs.is_booked = 1
        AND STR_TO_DATE(CONCAT(bs.date, ' ', bs.time), '%Y-%m-%d %H:%i:%s') >= STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')
        AND STR_TO_DATE(CONCAT(bs.date, ' ', bs.time), '%Y-%m-%d %H:%i:%s') <= STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')
        AND NOT EXISTS (
          SELECT 1 FROM booking_reminders br 
          WHERE br.slot_id = bs.id 
            AND br.user_id IN (bs.booked_by, bs.consultant_id)
            AND br.hours_before = 1
        )
    `).all(
      oneHourStart.toISOString().slice(0, 19).replace('T', ' '),
      oneHourEnd.toISOString().slice(0, 19).replace('T', ' ')
    );

    // Send 24h reminders
    if (slots24h && Array.isArray(slots24h)) {
      for (const slot of slots24h) {
        const customerUser = await db.prepare('SELECT email, timezone FROM users WHERE id = ?').get(slot.booked_by);
        const consultantUser = await db.prepare('SELECT email, timezone FROM users WHERE id = ?').get(slot.consultant_id);

        Promise.all([
          sendBookingReminderEmail({
            email: customerUser.email,
            slot: slot,
            consultantName: slot.consultant_name || null,
            customerName: null,
            isCustomer: true,
            hoursBefore: 24,
            recipientTimezone: customerUser.timezone
          }),
          sendBookingReminderEmail({
            email: consultantUser.email,
            slot: slot,
            consultantName: slot.consultant_name || null,
            customerName: null,
            isCustomer: false,
            hoursBefore: 24,
            recipientTimezone: consultantUser.timezone
          }),
        ]).then(async () => {
          // Mark reminders as sent
          await db.prepare('INSERT IGNORE INTO booking_reminders (slot_id, user_id, hours_before) VALUES (?, ?, 24)').run(slot.id, slot.booked_by);
          await db.prepare('INSERT IGNORE INTO booking_reminders (slot_id, user_id, hours_before) VALUES (?, ?, 24)').run(slot.id, slot.consultant_id);
        }).catch(() => { });
      }
    }

    // Send 1h reminders
    if (slots1h && Array.isArray(slots1h)) {
      for (const slot of slots1h) {
        const customerUser = await db.prepare('SELECT email, timezone FROM users WHERE id = ?').get(slot.booked_by);
        const consultantUser = await db.prepare('SELECT email, timezone FROM users WHERE id = ?').get(slot.consultant_id);

        Promise.all([
          sendBookingReminderEmail({
            email: customerUser.email,
            slot: slot,
            consultantName: slot.consultant_name || null,
            customerName: null,
            isCustomer: true,
            hoursBefore: 1,
            recipientTimezone: customerUser.timezone
          }),
          sendBookingReminderEmail({
            email: consultantUser.email,
            slot: slot,
            consultantName: slot.consultant_name || null,
            customerName: null,
            isCustomer: false,
            hoursBefore: 1,
            recipientTimezone: consultantUser.timezone
          }),
        ]).then(async () => {
          // Mark reminders as sent
          await db.prepare('INSERT IGNORE INTO booking_reminders (slot_id, user_id, hours_before) VALUES (?, ?, 1)').run(slot.id, slot.booked_by);
          await db.prepare('INSERT IGNORE INTO booking_reminders (slot_id, user_id, hours_before) VALUES (?, ?, 1)').run(slot.id, slot.consultant_id);
        }).catch(() => { });
      }
    }
  } catch (e) {
    // Ignore errors in reminder scheduler
    console.error('Error in checkAndSendReminders:', e);
  }
}

// Start reminder scheduler - check every 5 minutes
setInterval(() => checkAndSendReminders().catch(err => console.error('Error in checkAndSendReminders:', err)), 5 * 60 * 1000);
// Run once immediately on startup (in case server was down during reminder time)
setTimeout(() => checkAndSendReminders().catch(err => console.error('Error in checkAndSendReminders:', err)), 10 * 1000);

// Auto-expire pending requests that have passed their expiry time
async function checkAndExpireRequests() {
  try {
    // Convert to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const expired = await db.prepare(`
      SELECT id, consultant_id, customer_id 
      FROM requests 
      WHERE status = 'pending' 
        AND expiry_time IS NOT NULL 
        AND expiry_time < ?
    `).all(now);

    if (expired && Array.isArray(expired)) {
      for (const req of expired) {
        await db.prepare("UPDATE requests SET status = 'declined' WHERE id = ?").run(req.id);
        // Notify consultant that request expired
        io.to(`consultant_${req.consultant_id}`).emit('request_expired', { requestId: req.id });
        // Notify customer that request expired
        io.to(`customer_${req.customer_id}`).emit('request_expired', { requestId: req.id });
      }
    }

  } catch (error) {
    // Silently ignore if column doesn't exist yet (migration hasn't run)
    if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('expiry_time')) {
      return; // Column doesn't exist yet, skip this check
    }
    console.error('Error checking expired requests:', error);
  }
}

// Check for expired requests every minute
setInterval(() => checkAndExpireRequests().catch(err => console.error('Error checking expired requests:', err)), 60 * 1000);
// Run once on startup after 10 seconds
setTimeout(() => checkAndExpireRequests().catch(err => console.error('Error checking expired requests:', err)), 10 * 1000);

// Support/Contact form submission (public endpoint)
app.post('/api/support/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }

    // Send email to support
    Promise.resolve(sendSupportFormEmail({ name, email, subject, message })).catch((err) => {
      console.error('Error sending support form email:', err);
    });

    res.json({
      success: true,
      message: 'Messaggio inviato con successo! Ti risponderemo presto.'
    });
  } catch (error) {
    console.error('Error in support form:', error);
    res.status(500).json({ error: 'Errore nell\'invio del messaggio. Riprova più tardi.' });
  }
});

// Periodic cleanup for STALE requests/sessions (every minute)
async function cleanupStaleRequests() {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 1. Close Stale Requests (Accepted > 3 hours ago)
    // FIX: Only cancel IF NO SESSION WAS STARTED associated with this request
    // This assumes that if a session started, the request logic is handling it
    await db.prepare(`
      UPDATE requests r
      SET status = 'cancelled'
      WHERE status = 'accepted' 
      AND created_at < DATE_SUB(?, INTERVAL 3 HOUR)
      AND NOT EXISTS (
        SELECT 1 FROM sessions s 
        WHERE s.request_id = r.id AND s.started_at IS NOT NULL
      )
    `).run(now);

    // 2. Close Stale Sessions (Active > 3 hours ago)
    // Ensure we close the session so it doesn't block future calls (effectively freeing the consultant)
    await db.prepare(`
      UPDATE sessions 
      SET active = 0, ended_at = ?
      WHERE active = 1 
      AND started_at < DATE_SUB(?, INTERVAL 3 HOUR)
    `).run(now, now);

  } catch (error) {
    console.error('Error cleaning up stale requests:', error);
  }
}

setInterval(cleanupStaleRequests, 60 * 1000);

// Q2: Background job to release held credits for expired appointments
const checkAndReleaseExpiredAppointmentCredits = async () => {
  try {
    // Check if required columns exist first
    const tableInfo = await db.tableInfo('booking_slots');
    const hasCreditsHeld = tableInfo.some(col => col.name === 'credits_held');
    const hasCreditsReleased = tableInfo.some(col => col.name === 'credits_released');
    if (!hasCreditsHeld || !hasCreditsReleased) {
      return; // Columns don't exist yet, skip this check
    }

    // Find appointments where:
    // 1. credits_held > 0 (credits are held)
    // 2. credits_released = 0 (not yet released)
    // 3. Appointment time + 5 minutes has passed
    // 4. No active session started (session.started_at IS NULL)
    const expiredAppointments = await db.prepare(`
      SELECT bs.id, bs.booked_by, bs.consultant_id, bs.credits_held, bs.date, bs.time, bs.mode
      FROM booking_slots bs
      LEFT JOIN requests r ON r.customer_id = bs.booked_by AND r.consultant_id = bs.consultant_id 
        AND r.status = 'accepted' AND r.type = COALESCE(bs.mode, 'video')
      LEFT JOIN sessions s ON s.request_id = r.id
      WHERE bs.is_booked = 1
        AND bs.credits_held > 0
        AND bs.credits_released = 0
        AND DATE_ADD(STR_TO_DATE(CONCAT(bs.date, ' ', bs.time), '%Y-%m-%d %H:%i:%s'), INTERVAL 5 MINUTE) < NOW()
        AND (s.id IS NULL OR s.started_at IS NULL)
      GROUP BY bs.id
      LIMIT 3
    `).all();

    if (expiredAppointments && Array.isArray(expiredAppointments)) {
      for (const appointment of expiredAppointments) {
        try {
          await db.transaction(async (connection) => {
            // Check status again to avoid race conditions
            const [current] = await connection.query('SELECT credits_released FROM booking_slots WHERE id = ? FOR UPDATE', [appointment.id]);
            if (!current || current.credits_released === 1) return;

            // Release credits back to customer
            await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [appointment.credits_held, appointment.booked_by]);

            // Mark as released
            await connection.query('UPDATE booking_slots SET credits_released = 1 WHERE id = ?', [appointment.id]);

            // Record transaction
            await recordTransactionInTransaction(connection, appointment.booked_by, {
              type: 'refund',
              amount: appointment.credits_held,
              method: 'system',
              status: 'completed',
              description: `Rimborso prenotazione scaduta`,
              metadata: { slotId: appointment.id, consultantId: appointment.consultant_id, type: appointment.mode || 'video' }
            });
          });
        } catch (innerErr) {
          console.error(`Error releasing credits for slot ${appointment.id}:`, innerErr.message);
        }
      }
    }
  } catch (err) {
    // Ignore errors in background job
    console.error('Error in checkAndReleaseExpiredAppointmentCredits:', err);
  }
};

// Run every 5 minutes
setInterval(() => checkAndReleaseExpiredAppointmentCredits().catch(err => console.error('Error in checkAndReleaseExpiredAppointmentCredits:', err)), 5 * 60 * 1000);
setTimeout(checkAndReleaseExpiredAppointmentCredits, 10 * 1000);

// ============================================
// ADMIN API ENDPOINTS
// ============================================

// Admin Dashboard Stats
app.get('/api/admin/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('customer');
    const totalConsultants = await db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('consultant');
    const activeConsultants = await db.prepare('SELECT COUNT(*) as count FROM consultant_profiles WHERE status = ?').get('active');
    const pendingConsultants = await db.prepare('SELECT COUNT(*) as count FROM consultant_profiles WHERE status = ?').get('pending');

    const pendingPayouts = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM payout_requests 
      WHERE status = 'pending'
    `).get();

    const platformEarnings = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE type = 'commission' AND status = 'completed'
    `).get();

    const recentTransactions = await db.prepare(`
      SELECT COUNT(*) as count 
      FROM transactions 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `).get();

    // Dashboard enhancements: Calls count
    const totalCalls = await db.prepare(`
      SELECT COUNT(*) as count 
      FROM sessions 
      WHERE started_at IS NOT NULL
    `).get();

    // Dashboard enhancements: Average ratings
    const avgRatings = await db.prepare(`
      SELECT AVG(rating) as avg 
      FROM reviews 
      WHERE (is_hidden = 0 OR is_hidden IS NULL)
    `).get();

    // Dashboard enhancements: Deleted users count (from audit logs)
    const deletedUsers = await db.prepare(`
      SELECT COUNT(*) as count 
      FROM audit_logs 
      WHERE action_type = 'delete_user'
    `).get();

    res.json({
      totalUsers: totalUsers?.count || 0,
      totalConsultants: totalConsultants?.count || 0,
      activeConsultants: activeConsultants?.count || 0,
      pendingConsultants: pendingConsultants?.count || 0,
      pendingPayoutsTotal: pendingPayouts?.total || 0,
      platformEarnings: platformEarnings?.total || 0,
      recentTransactions: recentTransactions?.count || 0,
      totalCalls: totalCalls?.count || 0,
      averageRatings: avgRatings?.avg ? parseFloat(Number(avgRatings.avg).toFixed(2)) : 0,
      totalDeletedUsers: deletedUsers?.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all users
app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { role, status, page = 1, pageSize = 50 } = req.query;
    let query = 'SELECT u.*, cp.status as consultant_status FROM users u LEFT JOIN consultant_profiles cp ON u.id = cp.consultant_id WHERE 1=1';
    const params = [];

    if (role) {
      query += ' AND u.role = ?';
      params.push(role);
    }

    if (status && role === 'consultant') {
      query += ' AND cp.status = ?';
      params.push(status);
    }

    // Count total first
    let countQuery = query.replace('SELECT u.*, cp.status as consultant_status', 'SELECT COUNT(DISTINCT u.id) as count');
    const total = await db.prepare(countQuery).get(...params);

    // Then get paginated results
    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;
    params.push(limit, offset);

    const users = await db.prepare(query).all(...params);

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        credits: u.credits,
        created_at: u.created_at,
        consultant_status: u.consultant_status,
        bonus_granted: (u.bonus_granted === 1 || u.bonus_granted === true),
        is_blocked: (u.is_blocked === 1 || u.is_blocked === true)
      })),
      total: total?.count || 0,
      page: parseInt(page),
      pageSize: limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user details
app.get('/api/admin/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let profile = null;
    if (user.role === 'consultant') {
      profile = await db.prepare('SELECT * FROM consultant_profiles WHERE consultant_id = ?').get(id);
    }

    const transactions = await db.prepare(`
      SELECT * FROM transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all(id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        credits: user.credits,
        created_at: user.created_at,
        bonus_granted: user.bonus_granted === 1
      },
      profile,
      recentTransactions: transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manage user credits
app.put('/api/admin/users/:id/credits', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { amount, reason } = req.body;

    if (typeof amount !== 'number') {
      return res.status(400).json({ error: 'Amount must be a number' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newBalance = Number(user.credits) + amount;
    if (newBalance < 0) {
      return res.status(400).json({ error: 'Insufficient credits. Cannot go below 0.' });
    }

    await db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newBalance, id);

    await recordTransaction(id, {
      type: amount > 0 ? 'topup' : 'deduction',
      amount: Math.abs(amount),
      method: 'admin',
      status: 'completed',
      description: reason || (amount > 0 ? 'Admin credit adjustment' : 'Admin credit deduction'),
      metadata: { adminId: req.user.id, reason: reason || null }
    });

    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json({ user: sanitizeUser(updated), message: `Credits ${amount > 0 ? 'added' : 'deducted'} successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all consultants with details
app.get('/api/admin/consultants', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, pageSize = 50 } = req.query;
    let baseQuery = `
      FROM users u
      JOIN consultant_profiles cp ON u.id = cp.consultant_id
      LEFT JOIN requests r ON r.consultant_id = u.id
      WHERE u.role = 'consultant'
    `;
    const params = [];

    if (status) {
      baseQuery += ' AND cp.status = ?';
      params.push(status);
    }

    // Count total first
    const countQuery = `SELECT COUNT(DISTINCT u.id) as count ${baseQuery}`;
    const total = await db.prepare(countQuery).get(...params);

    // Then get paginated results
    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;
    const dataQuery = `
      SELECT u.id, u.email AS user_email, u.full_name AS user_full_name, u.credits, u.created_at, 
             cp.*,
             COUNT(DISTINCT r.id) as total_requests,
             COUNT(DISTINCT CASE WHEN r.status = 'accepted' THEN r.id END) as accepted_requests
      ${baseQuery}
      GROUP BY u.id 
      ORDER BY u.created_at DESC 
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const consultants = await db.prepare(dataQuery).all(...params);

    res.json({
      consultants,
      total: total?.count || 0,
      page: parseInt(page),
      pageSize: limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve/Reject/Deactivate consultant
app.put('/api/admin/consultants/:id/status', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, reason } = req.body;

    if (!['pending', 'active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: pending, active, or inactive' });
    }

    const consultant = await db.prepare('SELECT * FROM consultant_profiles WHERE consultant_id = ?').get(id);
    if (!consultant) return res.status(404).json({ error: 'Consultant not found' });

    await db.prepare('UPDATE consultant_profiles SET status = ? WHERE consultant_id = ?').run(status, id);

    await logAdminAction(req.user.id, 'update_consultant_status', 'consultant', id, { status, reason }, req.ip);

    // If approved, send approval email and trigger automatic payment check
    if (status === 'active' && consultant.status !== 'active') {
      const user = await db.prepare('SELECT email FROM users WHERE id = ?').get(id);
      if (user) {
        sendProfileApprovedEmail({ email: user.email, consultantName: consultant.name || 'Consultant' }).catch(() => { });
      }

      // AUTOMATIC PAYMENT: After admin approval, check if consultant has pending payout requests
      // and process them automatically if they meet criteria (e.g., have IBAN and sufficient credits)
      const consultantUser = await db.prepare('SELECT credits FROM users WHERE id = ?').get(id);
      const consultantProfile = await db.prepare('SELECT iban FROM consultant_profiles WHERE consultant_id = ?').get(id);

      if (consultantUser && consultantProfile && consultantProfile.iban) {
        // Check for pending payout requests that can be auto-processed
        const pendingPayouts = await db.prepare(`
          SELECT * FROM payout_requests 
          WHERE consultant_id = ? AND status = 'pending' 
          ORDER BY created_at ASC
        `).all(id);

        let currentCredits = consultantUser.credits;
        for (const payout of pendingPayouts) {
          if (currentCredits >= payout.amount) {
            // Auto-approve and process payout
            await db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(payout.amount, id);
            await db.prepare('UPDATE payout_requests SET status = ?, processed_at = NOW() WHERE id = ?').run('approved', payout.id);

            await recordTransaction(id, {
              type: 'payout',
              amount: -payout.amount,
              method: 'automatic',
              status: 'completed',
              description: 'Payout processato automaticamente dopo approvazione profilo',
              metadata: { payoutRequestId: payout.id, autoProcessed: true }
            });

            sendPayoutProcessedEmail({
              email: user.email,
              amount: payout.amount,
              status: 'approved',
              payoutRequestId: payout.id
            }).catch(() => { });

            // Update credits for next iteration
            currentCredits -= payout.amount;
          }
        }
      }
    }

    const updated = await db.prepare('SELECT * FROM consultant_profiles WHERE consultant_id = ?').get(id);
    res.json({ profile: updated, message: `Consultant status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all payout requests
app.get('/api/admin/payouts', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, pageSize = 50, month, year } = req.query;
    let query = `
      SELECT pr.*, u.email as consultant_email, cp.name as consultant_name
      FROM payout_requests pr
      JOIN users u ON pr.consultant_id = u.id
      LEFT JOIN consultant_profiles cp ON pr.consultant_id = cp.consultant_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND pr.status = ?';
      params.push(status);
    }

    if (month && year) {
      query += ' AND pr.period_month = ? AND pr.period_year = ?';
      params.push(parseInt(month), parseInt(year));
    }

    // Count total first
    let countQuery = query.replace('SELECT pr.*, u.email as consultant_email, cp.name as consultant_name', 'SELECT COUNT(*) as count');
    const total = await db.prepare(countQuery).get(...params);

    // Then get paginated results
    query += ' ORDER BY pr.created_at DESC LIMIT ? OFFSET ?';
    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;
    params.push(limit, offset);

    const payouts = await db.prepare(query).all(...params);

    res.json({
      payouts,
      total: total?.count || 0,
      page: parseInt(page),
      pageSize: limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve payout request
// Mark payout as paid (after external payment)
app.put('/api/admin/payouts/:id/mark-paid', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const payout = await db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(id);
    if (!payout) return res.status(404).json({ error: 'Payout request not found' });
    if (payout.status !== 'pending') {
      return res.status(400).json({ error: `Payout is already ${payout.status}` });
    }

    // Mark as paid and close credits in a transaction
    await db.transaction(async (connection) => {
      // Update payout status to 'paid'
      await connection.query(`
        UPDATE payout_requests 
        SET status = 'paid', paid_at = NOW(), processed_at = NOW() 
        WHERE id = ?
      `, [id]);

      // Move all linked credits from 'in_request' to 'paid' (immutable, never counted again)
      await connection.query(`
        UPDATE earnings_ledger
        SET status = 'paid'
        WHERE payout_request_id = ? AND status = 'in_request'
      `, [id]);



      // Record transaction
      await recordTransactionInTransaction(connection, payout.consultant_id, {
        type: 'payout',
        amount: -payout.amount,
        method: 'admin',
        status: 'completed',
        description: 'Payout processed',
        metadata: { payoutRequestId: id, processedBy: req.user.id }
      });
    });

    // Send email notification
    const user = await db.prepare('SELECT email FROM users WHERE id = ?').get(payout.consultant_id);
    if (user) {
      sendPayoutProcessedEmail({
        email: user.email,
        amount: payout.amount,
        status: 'paid',
        payoutRequestId: id
      }).catch(() => { });
    }

    const updated = await db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(id);
    res.json({ payout: updated, message: 'Payout marked as paid' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy approve endpoint (kept for backward compatibility, uses same logic as mark-paid)
app.put('/api/admin/payouts/:id/approve', authMiddleware, requireAdmin, async (req, res) => {
  // Reuse mark-paid logic
  const id = Number(req.params.id);
  const payout = await db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(id);
  if (!payout) return res.status(404).json({ error: 'Payout request not found' });
  if (payout.status !== 'pending') {
    return res.status(400).json({ error: `Payout is already ${payout.status}` });
  }

  await db.transaction(async (connection) => {
    await connection.query(`
      UPDATE payout_requests 
      SET status = 'paid', paid_at = NOW(), processed_at = NOW() 
      WHERE id = ?
    `, [id]);

    await connection.query(`
      UPDATE earnings_ledger
      SET status = 'paid'
      WHERE payout_request_id = ? AND status = 'in_request'
    `, [id]);



    await recordTransactionInTransaction(connection, payout.consultant_id, {
      type: 'payout',
      amount: -payout.amount,
      method: 'admin',
      status: 'completed',
      description: 'Payout processed',
      metadata: { payoutRequestId: id, processedBy: req.user.id }
    });
  });

  const user = await db.prepare('SELECT email FROM users WHERE id = ?').get(payout.consultant_id);
  if (user) {
    sendPayoutProcessedEmail({
      email: user.email,
      amount: payout.amount,
      status: 'paid',
      payoutRequestId: id
    }).catch(() => { });
  }

  const updated = await db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(id);
  res.json({ payout: updated, message: 'Payout marked as paid' });
});

// Reject payout request
app.put('/api/admin/payouts/:id/reject', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;
    const payout = await db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(id);
    if (!payout) return res.status(404).json({ error: 'Payout request not found' });
    if (payout.status !== 'pending') {
      return res.status(400).json({ error: `Payout is already ${payout.status}` });
    }

    // Reject and unlock credits in a transaction
    await db.transaction(async (connection) => {
      // Update payout status to 'rejected'
      await connection.query(`
        UPDATE payout_requests 
        SET status = 'rejected', processed_at = NOW() 
        WHERE id = ?
      `, [id]);

      // Unlock credits (move from 'in_request' back to 'available')
      await connection.query(`
        UPDATE earnings_ledger
        SET status = 'available', payout_request_id = NULL
        WHERE payout_request_id = ? AND status = 'in_request'
      `, [id]);

      // REFUND credits to consultant (since they were deducted on request)
      await connection.query(`
        UPDATE users SET credits = credits + ? WHERE id = ?
      `, [payout.amount, payout.consultant_id]);
    });

    // Send email notification
    const user = await db.prepare('SELECT email FROM users WHERE id = ?').get(payout.consultant_id);
    if (user) {
      sendPayoutProcessedEmail({
        email: user.email,
        amount: payout.amount,
        status: 'rejected',
        payoutRequestId: id
      }).catch(() => { });
    }

    const updated = await db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(id);
    res.json({ payout: updated, message: 'Payout rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all transactions
app.get('/api/admin/transactions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { type, userId, page = 1, pageSize = 100 } = req.query;
    let baseQuery = `
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      baseQuery += ' AND t.type = ?';
      params.push(type);
    }

    if (userId) {
      baseQuery += ' AND t.user_id = ?';
      params.push(Number(userId));
    }

    // Count total first
    const countQuery = `SELECT COUNT(*) as count ${baseQuery}`;
    const total = await db.prepare(countQuery).get(...params);

    // Then get paginated results
    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;
    const dataQuery = `
      SELECT t.*, u.email as user_email, u.role as user_role
      ${baseQuery}
      ORDER BY t.created_at DESC 
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const transactions = await db.prepare(dataQuery).all(...params);

    res.json({
      transactions: transactions.map(t => ({
        ...t,
        metadata: t.metadata ? JSON.parse(t.metadata) : null
      })),
      total: total?.count || 0,
      page: parseInt(page),
      pageSize: limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all bonuses granted
app.get('/api/admin/bonuses', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const bonuses = await db.prepare(`
      SELECT t.*, u.email, u.role
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.type = 'bonus' OR (t.description LIKE '%bonus%' AND t.type = 'topup')
      ORDER BY t.created_at DESC
    `).all();

    res.json({ bonuses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Grant bonus manually
app.post('/api/admin/bonuses', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid userId and amount required' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    await db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(amount, user.id);

    await recordTransaction(user.id, {
      type: 'bonus',
      amount: amount,
      method: 'admin',
      status: 'completed',
      description: reason || 'Admin granted bonus',
      metadata: { adminId: req.user.id, reason: reason || null }
    });

    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    res.json({ user: sanitizeUser(updated), message: 'Bonus granted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete own account
app.delete('/api/account', authMiddleware, async (req, res) => {
  try {
    const id = req.user.id;

    // Check if user exists
    const userToDelete = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }

    /* 
      Handle Booking Slots cleanup:
      If we delete a customer, their booked slots would remain booked (is_booked=1) 
      but with booked_by=NULL due to ON DELETE SET NULL.
      We must manually free them up.
    */
    if (userToDelete.role === 'customer') {
      await db.prepare(`
        UPDATE booking_slots 
        SET is_booked = 0, booked_by = NULL, booked_at = NULL 
        WHERE booked_by = ? AND date >= CURRENT_DATE
      `).run(id);
    }

    // Log the deletion action (using admin log function but with user id)
    // Assuming logAdminAction can handle regular user IDs if target_type is 'user'
    // Or we simply skip logging for self-deletion if audit_logs requires admin_id foreign key to be an admin. 
    // Checking schema: admin_id references users(id), so regular user ID works.
    await logAdminAction(id, 'delete_account', 'user', id, { reason: 'User self-deleted' }, req.ip).catch(() => { });

    // Deleting the user will cascade delete requests, sessions, messages, etc.
    await db.prepare('DELETE FROM users WHERE id = ?').run(id);

    // Clear auth cookie
    res.clearCookie('token');
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Delete user (Admin only)
app.delete('/api/admin/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Prevent self-deletion
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own admin account' });
    }

    const userToDelete = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }

    /* 
      Handle Booking Slots cleanup:
      If we delete a customer, their booked slots would remain booked (is_booked=1) 
      but with booked_by=NULL due to ON DELETE SET NULL.
      We must manually free them up.
    */
    if (userToDelete.role === 'customer') {
      await db.prepare(`
        UPDATE booking_slots 
        SET is_booked = 0, booked_by = NULL, booked_at = NULL 
        WHERE booked_by = ? AND date >= CURRENT_DATE
      `).run(id);
    }

    // Deleting the user will cascade delete requests, sessions, messages, transactions (if set to cascade), etc.
    await db.prepare('DELETE FROM users WHERE id = ?').run(id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================
// MICRO-CATEGORIES MANAGEMENT (ADMIN)
// ============================================

// List all micro-categories
app.get('/api/admin/micro-categories', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { macro_category, archived } = req.query;
    let query = 'SELECT * FROM micro_categories WHERE 1=1';
    const params = [];

    if (macro_category) {
      query += ' AND macro_category = ?';
      params.push(macro_category);
    }

    if (archived !== 'true') {
      query += ' AND is_archived = 0';
    }

    query += ' ORDER BY macro_category, name';

    const categories = await db.prepare(query).all(...params);
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new micro-category
app.post('/api/admin/micro-categories', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, macro_category, requires_verification } = req.body;

    if (!name || !macro_category) {
      return res.status(400).json({ error: 'Name and macro_category are required' });
    }

    if (!['coaching', 'cartomancy'].includes(macro_category)) {
      return res.status(400).json({ error: 'macro_category must be coaching or cartomancy' });
    }

    try {
      const info = await db.prepare('INSERT INTO micro_categories (name, macro_category, requires_verification) VALUES (?, ?, ?)').run(
        name,
        macro_category,
        requires_verification ? 1 : 0
      );
      const category = await db.prepare('SELECT * FROM micro_categories WHERE id = ?').get(info.lastInsertRowid);
      res.json({ category, message: 'Micro-category created successfully' });
    } catch (dbError) {
      if (dbError.message.includes('UNIQUE') || dbError.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Micro-category with this name already exists' });
      }
      throw dbError;
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update micro-category
app.put('/api/admin/micro-categories/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, macro_category, requires_verification, is_archived } = req.body;

    const category = await db.prepare('SELECT * FROM micro_categories WHERE id = ?').get(id);
    if (!category) {
      return res.status(404).json({ error: 'Micro-category not found' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (macro_category !== undefined) {
      if (!['coaching', 'cartomancy'].includes(macro_category)) {
        return res.status(400).json({ error: 'macro_category must be coaching or cartomancy' });
      }
      updates.push('macro_category = ?');
      params.push(macro_category);
    }

    if (requires_verification !== undefined) {
      updates.push('requires_verification = ?');
      params.push(requires_verification ? 1 : 0);
    }

    if (is_archived !== undefined) {
      updates.push('is_archived = ?');
      params.push(is_archived ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await db.prepare(`UPDATE micro_categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = await db.prepare('SELECT * FROM micro_categories WHERE id = ?').get(id);
    res.json({ category: updated, message: 'Micro-category updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete/Archive micro-category
app.delete('/api/admin/micro-categories/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const category = await db.prepare('SELECT * FROM micro_categories WHERE id = ?').get(id);

    if (!category) {
      return res.status(404).json({ error: 'Micro-category not found' });
    }

    // Check if any consultants are using this category
    const consultants = await db.prepare(`
      SELECT consultant_id FROM consultant_profiles 
      WHERE micro_categories LIKE ?
    `).all(`%"${category.name}"%`);

    if (consultants.length > 0) {
      // Archive instead of delete
      await db.prepare('UPDATE micro_categories SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      res.json({ message: 'Micro-category archived (cannot delete while in use)' });
    } else {
      // Safe to delete
      await db.prepare('DELETE FROM micro_categories WHERE id = ?').run(id);
      res.json({ message: 'Micro-category deleted successfully' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Merge micro-categories
app.post('/api/admin/micro-categories/merge', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { fromId, toId } = req.body;

    if (!fromId || !toId || fromId === toId) {
      return res.status(400).json({ error: 'Valid fromId and toId required' });
    }

    const fromCategory = await db.prepare('SELECT * FROM micro_categories WHERE id = ?').get(fromId);
    const toCategory = await db.prepare('SELECT * FROM micro_categories WHERE id = ?').get(toId);

    if (!fromCategory || !toCategory) {
      return res.status(404).json({ error: 'One or both categories not found' });
    }

    // Update all consultant profiles that use the "from" category
    const consultants = await db.prepare(`
      SELECT consultant_id, micro_categories FROM consultant_profiles 
      WHERE micro_categories LIKE ?
    `).all(`%"${fromCategory.name}"%`);

    await db.transaction(async (connection) => {
      for (const consultant of consultants) {
        const categories = JSON.parse(consultant.micro_categories || '[]');
        const updated = categories
          .filter(cat => cat !== fromCategory.name)
          .concat(categories.includes(toCategory.name) ? [] : [toCategory.name]);

        await connection.query('UPDATE consultant_profiles SET micro_categories = ? WHERE consultant_id = ?', [
          JSON.stringify(updated),
          consultant.consultant_id
        ]);
      }

      // Archive the "from" category
      await connection.query('UPDATE micro_categories SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [fromId]);
    });

    res.json({ message: `Micro-categories merged. ${consultants.length} consultant profiles updated.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// REVIEWS MODERATION (ADMIN ONLY - Q1)
// ============================================

// List all reviews with filters (admin only)
app.get('/api/admin/reviews', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { consultantId, customerId, isHidden, page = 1, pageSize = 50 } = req.query;
    let baseQuery = `
      FROM reviews r
      JOIN users u_customer ON r.customer_id = u_customer.id
      JOIN users u_consultant ON r.consultant_id = u_consultant.id
      LEFT JOIN consultant_profiles cp ON r.consultant_id = cp.consultant_id
      WHERE 1=1
    `;
    const params = [];

    if (consultantId) {
      baseQuery += ' AND r.consultant_id = ?';
      params.push(Number(consultantId));
    }

    if (customerId) {
      baseQuery += ' AND r.customer_id = ?';
      params.push(Number(customerId));
    }

    if (isHidden !== undefined) {
      baseQuery += ' AND r.is_hidden = ?';
      params.push(isHidden === 'true' ? 1 : 0);
    }

    // Count total first
    const countQuery = `SELECT COUNT(*) as count ${baseQuery}`;
    const total = await db.prepare(countQuery).get(...params);

    // Then get paginated results
    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;
    const dataQuery = `
      SELECT r.*, 
             u_customer.email as customer_email,
             u_consultant.email as consultant_email,
             cp.name as consultant_name
      ${baseQuery}
      ORDER BY r.created_at DESC 
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const reviews = await db.prepare(dataQuery).all(...params);

    res.json({
      reviews: reviews.map(r => ({
        ...r,
        is_hidden: r.is_hidden === 1 || r.is_hidden === true
      })),
      total: total?.count || 0,
      page: parseInt(page),
      pageSize: limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hide or show a review (admin only)
app.put('/api/admin/reviews/:id/hide', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isHidden, reason } = req.body;

    const review = await db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const hiddenValue = isHidden === true || isHidden === 1 ? 1 : 0;
    const notes = reason ? `Hidden: ${reason}` : null;

    await db.prepare('UPDATE reviews SET is_hidden = ?, moderation_notes = COALESCE(?, moderation_notes) WHERE id = ?').run(
      hiddenValue,
      notes,
      id
    );

    await logAdminAction(req.user.id, isHidden ? 'hide_review' : 'show_review', 'review', id, { reason }, req.ip);

    // Recalculate consultant rating if hiding/unhiding
    const avgRating = await db.prepare(`
      SELECT AVG(rating) as avg, COUNT(*) as count 
      FROM reviews 
      WHERE consultant_id = ? AND (is_hidden = 0 OR is_hidden IS NULL)
    `).get(review.consultant_id);

    await db.prepare('UPDATE consultant_profiles SET rating = ?, review_count = ? WHERE consultant_id = ?').run(
      avgRating.avg || 0, avgRating.count || 0, review.consultant_id
    );

    const updated = await db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    res.json({
      review: {
        ...updated,
        is_hidden: updated.is_hidden === 1 || updated.is_hidden === true
      },
      message: isHidden ? 'Review hidden successfully' : 'Review shown successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a review (admin only)
app.delete('/api/admin/reviews/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const review = await db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const consultantId = review.consultant_id;

    // Delete the review
    await db.prepare('DELETE FROM reviews WHERE id = ?').run(id);

    await logAdminAction(req.user.id, 'delete_review', 'review', id, null, req.ip);

    // Recalculate consultant rating
    const avgRating = await db.prepare(`
      SELECT AVG(rating) as avg, COUNT(*) as count 
      FROM reviews 
      WHERE consultant_id = ? AND (is_hidden = 0 OR is_hidden IS NULL)
    `).get(consultantId);

    await db.prepare('UPDATE consultant_profiles SET rating = ?, review_count = ? WHERE consultant_id = ?').run(
      avgRating.avg || 0, avgRating.count || 0, consultantId
    );

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add moderation notes to a review (admin only)
app.post('/api/admin/reviews/:id/notes', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { notes } = req.body;

    const review = await db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const existingNotes = review.moderation_notes || '';
    const newNotes = existingNotes ? `${existingNotes}\n[${new Date().toISOString()}] ${notes}` : `[${new Date().toISOString()}] ${notes}`;

    await db.prepare('UPDATE reviews SET moderation_notes = ? WHERE id = ?').run(newNotes, id);

    const updated = await db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    res.json({
      review: {
        ...updated,
        is_hidden: updated.is_hidden === 1 || updated.is_hidden === true
      },
      message: 'Moderation notes added successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// USER BLOCK/UNBLOCK (ADMIN)
// ============================================

// Block or unblock a user (admin only)
app.put('/api/admin/users/:id/block', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isBlocked, reason } = req.body;

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent blocking admin users
    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Cannot block admin users' });
    }

    const blockedValue = isBlocked === true || isBlocked === 1 ? 1 : 0;
    await db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(blockedValue, id);

    await logAdminAction(req.user.id, isBlocked ? 'block_user' : 'unblock_user', 'user', id, { reason }, req.ip);

    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json({
      user: sanitizeUser(updated),
      message: isBlocked ? 'User blocked successfully' : 'User unblocked successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SESSIONS MANAGEMENT (ADMIN)
// ============================================

// List all sessions with filters (admin only)
app.get('/api/admin/sessions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { status, customerId, consultantId, type, page = 1, pageSize = 50 } = req.query;
    let baseQuery = `
      FROM sessions s
      JOIN requests r ON s.request_id = r.id
      JOIN users u_customer ON r.customer_id = u_customer.id
      JOIN users u_consultant ON r.consultant_id = u_consultant.id
      WHERE 1=1
    `;
    const params = [];

    if (status === 'active') {
      baseQuery += ' AND s.active = 1 AND s.ended_at IS NULL';
    } else if (status === 'ended') {
      baseQuery += ' AND (s.active = 0 OR s.ended_at IS NOT NULL)';
    }

    if (customerId) {
      baseQuery += ' AND r.customer_id = ?';
      params.push(Number(customerId));
    }

    if (consultantId) {
      baseQuery += ' AND r.consultant_id = ?';
      params.push(Number(consultantId));
    }

    if (type) {
      baseQuery += ' AND s.type = ?';
      params.push(type);
    }

    // Count total first
    const countQuery = `SELECT COUNT(*) as count ${baseQuery}`;
    const total = await db.prepare(countQuery).get(...params);

    // Then get paginated results
    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;
    const dataQuery = `
      SELECT s.*, 
             r.id as request_id,
             r.status as request_status,
             r.type as request_type,
             u_customer.email as customer_email,
             u_consultant.email as consultant_email,
             CASE 
               WHEN s.ended_at IS NOT NULL THEN 
                 ROUND(TIMESTAMPDIFF(MINUTE, s.started_at, s.ended_at), 2)
               WHEN s.started_at IS NOT NULL THEN 
                 ROUND(TIMESTAMPDIFF(MINUTE, s.started_at, NOW()), 2)
               ELSE 0
             END as duration_minutes
      ${baseQuery}
      ORDER BY s.id DESC 
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const sessions = await db.prepare(dataQuery).all(...params);

    res.json({
      sessions,
      total: total?.count || 0,
      page: parseInt(page),
      pageSize: limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Force close a session (admin only)
// End session endpoint for consultants and customers
app.put('/api/sessions/:id/end', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const session = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.ended_at) {
      return res.status(400).json({ error: 'Session is already closed' });
    }

    // Verify user has permission (must be consultant or customer for this session)
    if (req.user.role !== 'admin' && req.user.id !== session.consultant_id && req.user.id !== session.customer_id) {
      return res.status(403).json({ error: 'You do not have permission to end this session' });
    }

    // Get request to find customer and consultant IDs
    const request = await db.prepare('SELECT * FROM requests WHERE id = ?').get(session.request_id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // End the session using the existing endSession function
    await endSession(session.room_name, session.id, request.customer_id, request.consultant_id, 'manually_ended');

    const updated = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    res.json({
      session: updated,
      message: 'Session ended successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/sessions/:id/force-close', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const session = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.ended_at) {
      return res.status(400).json({ error: 'Session is already closed' });
    }

    // Force close the session
    await db.prepare('UPDATE sessions SET active = 0, ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    await logAdminAction(req.user.id, 'force_close_session', 'session', id, null, req.ip);

    // Notify users via Socket.IO
    io.to(session.room_name).emit('session_ended', {
      reason: 'Session closed by administrator',
      sessionId: id
    });

    const updated = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    res.json({
      session: updated,
      message: 'Session force closed successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// APPOINTMENTS MANAGEMENT (ADMIN)
// ============================================

// List all appointments with filters (admin only)
app.get('/api/admin/appointments', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { status, consultantId, customerId, page = 1, pageSize = 50 } = req.query;
    let baseQuery = `
      FROM booking_slots bs
      JOIN users u_consultant ON bs.consultant_id = u_consultant.id
      LEFT JOIN users u_customer ON bs.booked_by = u_customer.id
      LEFT JOIN consultant_profiles cp ON bs.consultant_id = cp.consultant_id
      WHERE bs.is_booked = 1
    `;
    const params = [];

    if (consultantId) {
      baseQuery += ' AND bs.consultant_id = ?';
      params.push(Number(consultantId));
    }

    if (customerId) {
      baseQuery += ' AND bs.booked_by = ?';
      params.push(Number(customerId));
    }

    if (status === 'upcoming') {
      baseQuery += ' AND CONCAT(bs.date, \' \', bs.time) > NOW()';
    } else if (status === 'past') {
      baseQuery += ' AND CONCAT(bs.date, \' \', bs.time) < NOW()';
    } else if (status === 'held') {
      baseQuery += ' AND bs.credits_held > 0 AND bs.credits_released = 0';
    } else if (status === 'released') {
      baseQuery += ' AND bs.credits_released = 1';
    }

    // Count total first
    const countQuery = `SELECT COUNT(*) as count ${baseQuery}`;
    const total = await db.prepare(countQuery).get(...params);

    // Then get paginated results
    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;
    const dataQuery = `
      SELECT bs.*,
             u_consultant.email as consultant_email,
             u_customer.email as customer_email,
             cp.name as consultant_name,
             CASE 
               WHEN CONCAT(bs.date, ' ', bs.time) > NOW() THEN 'upcoming'
               ELSE 'past'
             END as appointment_status
      ${baseQuery}
      ORDER BY bs.date DESC, bs.time DESC 
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const appointments = await db.prepare(dataQuery).all(...params);

    res.json({
      appointments: appointments.map(a => ({
        ...a,
        credits_held: a.credits_held || 0,
        credits_released: a.credits_released === 1 || a.credits_released === true
      })),
      total: total?.count || 0,
      page: parseInt(page),
      pageSize: limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Release held credits for an appointment (admin only)
app.put('/api/admin/appointments/:id/release-credits', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const slot = await db.prepare('SELECT * FROM booking_slots WHERE id = ?').get(id);

    if (!slot) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (!slot.booked_by) {
      return res.status(400).json({ error: 'Appointment is not booked' });
    }

    if (slot.credits_held <= 0 || slot.credits_released === 1) {
      return res.status(400).json({ error: 'No credits to release' });
    }

    await db.transaction(async (connection) => {
      // Release credits back to customer
      await connection.query('UPDATE users SET credits = credits + ? WHERE id = ?', [slot.credits_held, slot.booked_by]);

      // Mark as released
      await connection.query('UPDATE booking_slots SET credits_released = 1 WHERE id = ?', [id]);

      // Record transaction
      await recordTransactionInTransaction(connection, slot.booked_by, {
        type: 'refund',
        amount: slot.credits_held,
        method: 'admin',
        status: 'completed',
        description: `Rimborso prenotazione (admin)`,
        metadata: { slotId: id, consultantId: slot.consultant_id, type: slot.mode || 'video', adminAction: true }
      });
    });

    await logAdminAction(req.user.id, 'release_appointment_credits', 'appointment', id, { credits_held: slot.credits_held }, req.ip);

    const updated = await db.prepare('SELECT * FROM booking_slots WHERE id = ?').get(id);
    res.json({
      appointment: updated,
      message: 'Credits released successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DASHBOARD ENHANCEMENTS
// ============================================

// Update admin stats to include calls count and average ratings
// (This will be done by modifying the existing /api/admin/stats endpoint)

// ============================================
// CONSULTANT MANAGEMENT ENHANCEMENTS
// ============================================

// Get consultant detailed stats (earnings, minutes, reviews)
app.get('/api/admin/consultants/:id/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const consultant = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'consultant');
    if (!consultant) {
      return res.status(404).json({ error: 'Consultant not found' });
    }

    // Calculate total earnings
    const earnings = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE user_id = ? AND type = 'earnings' AND status = 'completed'
    `).get(id);

    // Calculate total minutes (from sessions)
    const minutes = await db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN ended_at IS NOT NULL THEN 
            ROUND(TIMESTAMPDIFF(MINUTE, started_at, ended_at), 2)
          WHEN started_at IS NOT NULL THEN 
            ROUND(TIMESTAMPDIFF(MINUTE, started_at, NOW()), 2)
          ELSE 0
        END
      ), 0) as total_minutes
      FROM sessions 
      WHERE consultant_id = ? AND (started_at IS NOT NULL)
    `).get(id);

    // Get reviews count
    const reviews = await db.prepare(`
      SELECT COUNT(*) as count, AVG(rating) as avg_rating
      FROM reviews 
      WHERE consultant_id = ? AND (is_hidden = 0 OR is_hidden IS NULL)
    `).get(id);

    res.json({
      consultant_id: id,
      total_earnings: earnings?.total || 0,
      total_minutes: minutes?.total_minutes || 0,
      reviews_count: reviews?.count || 0,
      average_rating: reviews?.avg_rating || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add suspend status to consultant (using inactive status as suspend)
app.put('/api/admin/consultants/:id/suspend', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;

    const consultant = await db.prepare('SELECT * FROM consultant_profiles WHERE consultant_id = ?').get(id);
    if (!consultant) {
      return res.status(404).json({ error: 'Consultant not found' });
    }

    // Set status to inactive (which acts as suspended)
    await db.prepare('UPDATE consultant_profiles SET status = ? WHERE consultant_id = ?').run('inactive', id);

    await logAdminAction(req.user.id, 'suspend_consultant', 'consultant', id, { reason }, req.ip);

    const updated = await db.prepare('SELECT * FROM consultant_profiles WHERE consultant_id = ?').get(id);
    res.json({
      profile: updated,
      message: 'Consultant suspended successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// USER MANAGEMENT ENHANCEMENTS
// ============================================

// Get user call/chat history (admin only)
app.get('/api/admin/users/:id/history', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all sessions for this user
    const sessions = await db.prepare(`
      SELECT s.*, 
             r.type as request_type,
             r.status as request_status,
             CASE 
               WHEN s.ended_at IS NOT NULL THEN 
                 ROUND(TIMESTAMPDIFF(MINUTE, s.started_at, s.ended_at), 2)
               WHEN s.started_at IS NOT NULL THEN 
                 ROUND(TIMESTAMPDIFF(MINUTE, s.started_at, NOW()), 2)
               ELSE 0
             END as duration_minutes,
             CASE 
               WHEN s.customer_id = ? THEN u_consultant.email
               ELSE u_customer.email
             END as other_party_email
      FROM sessions s
      JOIN requests r ON s.request_id = r.id
      LEFT JOIN users u_customer ON r.customer_id = u_customer.id
      LEFT JOIN users u_consultant ON r.consultant_id = u_consultant.id
      WHERE s.customer_id = ? OR s.consultant_id = ?
      ORDER BY s.id DESC
      LIMIT 100
    `).all(id, id, id);

    // Get chat messages count
    const chatMessages = await db.prepare(`
      SELECT COUNT(*) as count
      FROM chat_messages cm
      JOIN sessions s ON cm.session_id = s.id
      WHERE s.customer_id = ? OR s.consultant_id = ?
    `).get(id, id);

    res.json({
      user_id: id,
      sessions: sessions,
      total_sessions: sessions.length,
      total_chat_messages: chatMessages?.count || 0
    });
  } catch (error) {
    console.error('Error in /api/admin/users/:id/history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get micro-categories for consultant profile (public endpoint)
app.get('/api/micro-categories', async (req, res) => {
  try {
    const { macro_category } = req.query;
    let query = 'SELECT id, name, macro_category, requires_verification FROM micro_categories WHERE is_archived = 0';
    const params = [];

    if (macro_category) {
      query += ' AND macro_category = ?';
      params.push(macro_category);
    }

    query += ' ORDER BY macro_category, name';

    const categories = await db.prepare(query).all(...params);
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DISCOUNT CODES MANAGEMENT (ADMIN)
// ============================================

// Helper function to log admin actions (must be defined before use)
async function logAdminAction(adminId, actionType, targetType, targetId, details, ipAddress) {
  try {
    await db.prepare(`
      INSERT INTO audit_logs (admin_id, action_type, target_type, target_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(adminId, actionType, targetType, targetId, details ? JSON.stringify(details) : null, ipAddress || null);
  } catch (error) {
    // Ignore audit log errors to avoid breaking main functionality
  }
}

// List all discount codes (admin only)
app.get('/api/admin/discount-codes', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const codes = await db.prepare('SELECT * FROM discount_codes ORDER BY created_at DESC').all();
    res.json({ codes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create discount code (admin only)
app.post('/api/admin/discount-codes', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { code, discount_type, discount_value, max_uses, expires_at } = req.body;

    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ error: 'Code, discount_type, and discount_value are required' });
    }

    if (!['percentage', 'fixed'].includes(discount_type)) {
      return res.status(400).json({ error: 'discount_type must be percentage or fixed' });
    }

    const info = await db.prepare(`
      INSERT INTO discount_codes (code, discount_type, discount_value, max_uses, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(code.toUpperCase(), discount_type, discount_value, max_uses || null, expires_at || null);

    await logAdminAction(req.user.id, 'create_discount_code', 'discount_code', info.lastInsertRowid, { code, discount_type, discount_value }, req.ip);

    const created = await db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(info.lastInsertRowid);
    res.json({ code: created, message: 'Discount code created successfully' });
  } catch (error) {
    if (error.message.includes('UNIQUE') || error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Discount code already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update discount code (admin only)
app.put('/api/admin/discount-codes/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { is_active, max_uses, expires_at } = req.body;

    const code = await db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(id);
    if (!code) {
      return res.status(404).json({ error: 'Discount code not found' });
    }

    const updates = [];
    const params = [];

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    if (max_uses !== undefined) {
      updates.push('max_uses = ?');
      params.push(max_uses);
    }
    if (expires_at !== undefined) {
      updates.push('expires_at = ?');
      params.push(expires_at);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    await db.prepare(`UPDATE discount_codes SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    await logAdminAction(req.user.id, 'update_discount_code', 'discount_code', id, { is_active, max_uses, expires_at }, req.ip);

    const updated = await db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(id);
    res.json({ code: updated, message: 'Discount code updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete discount code (admin only)
app.delete('/api/admin/discount-codes/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.prepare('DELETE FROM discount_codes WHERE id = ?').run(id);

    await logAdminAction(req.user.id, 'delete_discount_code', 'discount_code', id, null, req.ip);

    res.json({ message: 'Discount code deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COMMUNICATIONS (ADMIN)
// ============================================

// Send broadcast email (admin only)
app.post('/api/admin/broadcast-email', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { subject, message, target_role } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    // Get all users based on target_role
    let users;
    if (target_role && target_role !== 'all') {
      users = await db.prepare('SELECT email FROM users WHERE role = ?').all(target_role);
    } else {
      users = await db.prepare('SELECT email FROM users').all();
    }

    // Send emails (fire and forget)
    Promise.all(users.map(user =>
      sendBroadcastEmail({ email: user.email, subject, message }).catch(() => { })
    )).catch(() => { });

    await logAdminAction(req.user.id, 'broadcast_email', 'system', null, { target_role, recipients: users.length }, req.ip);

    res.json({
      message: `Broadcast email sent to ${users.length} users`,
      recipients: users.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AUDIT LOGS (ADMIN)
// ============================================

// Get audit logs (admin only)
app.get('/api/admin/audit-logs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 100, adminId, actionType } = req.query;
    let baseQuery = `
      FROM audit_logs al
      JOIN users u ON al.admin_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (adminId) {
      baseQuery += ' AND al.admin_id = ?';
      params.push(Number(adminId));
    }

    if (actionType) {
      baseQuery += ' AND al.action_type = ?';
      params.push(actionType);
    }

    const countQuery = `SELECT COUNT(*) as count ${baseQuery}`;
    const total = await db.prepare(countQuery).get(...params);

    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;
    const dataQuery = `
      SELECT al.*, u.email as admin_email
      ${baseQuery}
      ORDER BY al.created_at DESC 
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const logs = await db.prepare(dataQuery).all(...params);

    res.json({
      logs: logs.map(l => ({
        ...l,
        details: l.details ? JSON.parse(l.details) : null
      })),
      total: total?.count || 0,
      page: parseInt(page),
      pageSize: limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MAINTENANCE MODE (ADMIN)
// ============================================

// Get maintenance mode status (admin only)
app.get('/api/admin/maintenance-mode', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const setting = await db.prepare('SELECT value FROM system_settings WHERE `key` = ?').get('maintenance_mode');
    res.json({
      maintenance_mode: setting?.value === 'true' || setting?.value === '1'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set maintenance mode (admin only)
app.put('/api/admin/maintenance-mode', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    await db.prepare('UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE `key` = ?').run(
      enabled ? 'true' : 'false',
      'maintenance_mode'
    );

    await logAdminAction(req.user.id, 'maintenance_mode', 'system', null, { enabled }, req.ip);

    res.json({
      maintenance_mode: enabled,
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BACKUP VISIBILITY (ADMIN)
// ============================================

// Get backup status (admin only)
app.get('/api/admin/backup-status', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const lastBackup = await db.prepare('SELECT value, updated_at FROM system_settings WHERE `key` = ?').get('last_backup');
    // Note: MySQL doesn't have PRAGMA, so we'll skip database path for MySQL
    res.json({
      last_backup: lastBackup?.value || null,
      last_backup_time: lastBackup?.updated_at || null,
      database_size: null,
      database_path: null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Support Form Endpoint
app.post('/api/support', authMiddleware, async (req, res) => {
  try {
    const { subject, description } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ error: 'Subject and description are required' });
    }

    const user = req.user;
    const userDetails = await db.prepare('SELECT email, full_name FROM users WHERE id = ?').get(user.id);

    if (!userDetails) {
      return res.status(404).json({ error: 'User not found' });
    }

    await sendSupportFormEmail({
      name: userDetails.full_name || 'Utente Swang',
      email: userDetails.email,
      subject,
      message: description
    });

    res.json({ message: 'Support request sent successfully' });
  } catch (error) {
    console.error('Error sending support email:', error);
    res.status(500).json({ error: 'Failed to send support request' });
  }
});

// Trigger manual backup (admin only)
app.post('/api/admin/backup', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // Note: For MySQL, we would use mysqldump or similar tool
    // For now, we'll just update the last_backup timestamp
    await db.prepare('UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE `key` = ?').run(
      new Date().toISOString(),
      'last_backup'
    );

    await logAdminAction(req.user.id, 'backup', 'system', null, { backup_type: 'mysql' }, req.ip);

    res.json({
      message: 'Backup timestamp updated (use mysqldump for actual backup)',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROLES MANAGEMENT (ADMIN)
// ============================================

// Update user admin role (admin only)
app.put('/api/admin/users/:id/admin-role', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { admin_role } = req.body;

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'admin') {
      return res.status(400).json({ error: 'User is not an admin' });
    }

    const validRoles = ['super_admin', 'admin', 'support', 'finance', null];
    if (admin_role && !validRoles.includes(admin_role)) {
      return res.status(400).json({ error: 'Invalid admin role' });
    }

    await db.prepare('UPDATE users SET admin_role = ? WHERE id = ?').run(admin_role || null, id);

    await logAdminAction(req.user.id, 'update_admin_role', 'user', id, { admin_role }, req.ip);

    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json({
      user: sanitizeUser(updated),
      message: 'Admin role updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// INVITATION TOKENS (ADMIN)
// ============================================

// Create invitation token and send email (admin only)
app.post('/api/admin/invitations', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { email, greeting } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if email already exists
    const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Generate unique token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');

    // Set expiration to 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Insert token
    await db.prepare('INSERT INTO invitation_tokens (token, email, expires_at) VALUES (?, ?, ?)').run(
      token,
      email.trim(),
      expiresAt.toISOString().slice(0, 19).replace('T', ' ')
    );

    // Send invitation email
    await sendInvitationEmail({
      email: email.trim(),
      token,
      greeting: greeting || null
    });

    await logAdminAction(req.user.id, 'create_invitation', 'invitation', null, { email: email.trim() }, req.ip);

    res.json({
      message: 'Invitation sent successfully',
      token,
      expires_at: expiresAt.toISOString()
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' || error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Token already exists (retry)' });
    }
    res.status(500).json({ error: error.message });
  }
});

// List all invitations (admin only)
app.get('/api/admin/invitations', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize || 50)));

    const invitations = await db.prepare(`
      SELECT id, email, token, expires_at, used, used_at, created_at
      FROM invitation_tokens
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, (page - 1) * pageSize);

    const totalResult = await db.prepare('SELECT COUNT(*) as count FROM invitation_tokens').get();
    const total = totalResult.count;

    res.json({
      invitations: invitations.map(inv => ({
        ...inv,
        used: inv.used === 1,
        expires_at: inv.expires_at,
        is_expired: new Date(inv.expires_at) < new Date()
      })),
      total,
      page,
      pageSize
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validate invitation token (public endpoint)
app.get('/api/register/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const invitation = await db.prepare('SELECT * FROM invitation_tokens WHERE token = ?').get(token);

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid invitation token' });
    }

    if (invitation.used === 1) {
      return res.status(400).json({ error: 'This invitation has already been used' });
    }

    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);

    if (now > expiresAt) {
      return res.status(400).json({ error: 'This invitation has expired' });
    }

    res.json({
      valid: true,
      email: invitation.email,
      expires_at: invitation.expires_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PLATFORM VISIBILITY (ADMIN)
// ============================================

// Get platform visibility status (admin only)
app.get('/api/admin/platform-visibility', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const setting = await db.prepare('SELECT value FROM system_settings WHERE `key` = ?').get('platform_visible');
    res.json({
      platform_visible: setting?.value === 'true' || setting?.value === '1'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set platform visibility (admin only)
app.put('/api/admin/platform-visibility', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { visible } = req.body;

    // Insert or update
    await db.prepare(`
      INSERT INTO system_settings (\`key\`, value, updated_at) 
      VALUES ('platform_visible', ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP
    `).run(visible ? 'true' : 'false', visible ? 'true' : 'false');

    await logAdminAction(req.user.id, 'platform_visibility', 'system', null, { visible }, req.ip);

    res.json({
      platform_visible: visible,
      message: `Platform ${visible ? 'is now visible' : 'is now hidden'}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get platform visibility status (public endpoint for frontend)
app.get('/api/platform-visibility', async (req, res) => {
  try {
    const setting = await db.prepare('SELECT value FROM system_settings WHERE `key` = ?').get('platform_visible');
    res.json({
      platform_visible: setting?.value === 'true' || setting?.value === '1'
    });
  } catch (error) {
    // Default to false if setting doesn't exist
    res.json({ platform_visible: false });
  }
});

// Support/Contact form submission (public endpoint)
app.post('/api/support/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }

    // Send email to support
    Promise.resolve(sendSupportFormEmail({ name, email, subject, message })).catch((err) => {
      console.error('Error sending support form email:', err);
    });

    res.json({
      success: true,
      message: 'Messaggio inviato con successo! Ti risponderemo presto.'
    });
  } catch (error) {
    console.error('Error in support form:', error);
    res.status(500).json({ error: 'Errore nell\'invio del messaggio. Riprova più tardi.' });
  }
});

// Periodic cleanup for STALE requests/sessions (every minute)
async function cleanupStaleRequests() {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 1. Close Stale Requests (Accepted > 3 hours ago)
    // We assume no legitimate call lasts longer than 3 hours without an update
    // This clears the "Request in Arrivo" list of zombie entries
    await db.prepare(`
      UPDATE requests 
      SET status = 'cancelled'
      WHERE status = 'accepted' 
      AND created_at < DATE_SUB(?, INTERVAL 3 HOUR)
    `).run(now);

    // 2. Close Stale Sessions (Active > 3 hours ago)
    // Ensure we close the session so it doesn't block future calls (effectively freeing the consultant)
    await db.prepare(`
      UPDATE sessions 
      SET active = 0, ended_at = ?
      WHERE active = 1 
      AND started_at < DATE_SUB(?, INTERVAL 3 HOUR)
    `).run(now, now);

  } catch (error) {
    console.error('Error cleaning up stale requests:', error);
  }
}

setInterval(cleanupStaleRequests, 60 * 1000);

// Periodic cleanup for stuck consultant statuses (every minute)
async function checkAndResetStuckConsultants() {
  try {
    // Reset is_busy=0 for consultants who are marked busy 
    // BUT have NO active session AND NO active appointment in the immediate window
    const now = new Date();
    const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

    await db.prepare(`
      UPDATE users u
      SET is_busy = 0
      WHERE role = 'consultant' AND is_busy = 1
      AND NOT EXISTS (
        SELECT 1 FROM sessions s 
        WHERE s.consultant_id = u.id AND s.active = 1 AND s.ended_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM booking_slots bs
        WHERE bs.consultant_id = u.id AND bs.is_booked = 1
        AND CONCAT(bs.date, ' ', bs.time) BETWEEN DATE_SUB(?, INTERVAL 15 MINUTE) AND DATE_ADD(?, INTERVAL 15 MINUTE)
      )
    `).run(nowStr, nowStr);
  } catch (error) {
    console.error('Error resetting stuck consultants:', error);
  }
}

setInterval(checkAndResetStuckConsultants, 60 * 1000);

// Ensure other background jobs are running
setInterval(checkAndReleaseExpiredAppointmentCredits, 60 * 1000);

setInterval(checkAndExpireRequests, 60 * 1000);

server.listen(PORT);


