#!/usr/bin/env node

/**
 * Debug Billing Issue Script
 * Checks consultant profile and request/session data for specific users
 * Usage: node debug-billing.js <customer_email> <consultant_email>
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'vcapp.sqlite');

const customerEmail = process.argv[2] || 'conx@gmail.com';
const consultantEmail = process.argv[3] || 'clix@gmail.com';

console.log(`\n🔍 Debugging billing issue for:`);
console.log(`   Customer: ${customerEmail}`);
console.log(`   Consultant: ${consultantEmail}\n`);

try {
  const db = new Database(dbPath);
  
  // Get users
  const customer = db.prepare('SELECT * FROM users WHERE email = ?').get(customerEmail);
  const consultant = db.prepare('SELECT * FROM users WHERE email = ?').get(consultantEmail);
  
  if (!customer) {
    console.error(`❌ Customer not found: ${customerEmail}`);
    process.exit(1);
  }
  
  if (!consultant) {
    console.error(`❌ Consultant not found: ${consultantEmail}`);
    process.exit(1);
  }
  
  console.log('✅ Users found:');
  console.log(`   Customer ID: ${customer.id}, Credits: ${customer.credits}, Role: ${customer.role}`);
  console.log(`   Consultant ID: ${consultant.id}, Credits: ${consultant.credits}, Role: ${consultant.role}\n`);
  
  // Check consultant profile
  const profile = db.prepare('SELECT * FROM consultant_profiles WHERE consultant_id = ?').get(consultant.id);
  
  if (!profile) {
    console.log('⚠️  WARNING: Consultant profile does NOT exist!');
    console.log('   This means video_price will default to CREDITS_PER_MINUTE (5 credits)\n');
  } else {
    console.log('✅ Consultant profile found:');
    console.log(`   chat_price: ${profile.chat_price || 'NULL'}`);
    console.log(`   voice_price: ${profile.voice_price || 'NULL'}`);
    console.log(`   video_price: ${profile.video_price || 'NULL'}`);
    console.log(`   status: ${profile.status || 'NULL'}\n`);
  }
  
  // Find recent requests between these users
  const requests = db.prepare(`
    SELECT * FROM requests 
    WHERE customer_id = ? AND consultant_id = ? 
    ORDER BY id DESC 
    LIMIT 5
  `).all(customer.id, consultant.id);
  
  console.log(`📋 Recent requests (${requests.length}):`);
  if (requests.length === 0) {
    console.log('   No requests found\n');
  } else {
    requests.forEach(req => {
      console.log(`   Request ID: ${req.id}, Type: ${req.type || 'NULL'}, Status: ${req.status}, Created: ${req.created_at}`);
    });
    console.log('');
  }
  
  // Find sessions for the most recent request
  if (requests.length > 0) {
    const latestRequest = requests[0];
    const sessions = db.prepare(`
      SELECT * FROM sessions 
      WHERE request_id = ? 
      ORDER BY id DESC
    `).all(latestRequest.id);
    
    console.log(`📹 Sessions for Request ID ${latestRequest.id} (${sessions.length}):`);
    if (sessions.length === 0) {
      console.log('   No sessions found\n');
    } else {
      sessions.forEach(session => {
        console.log(`   Session ID: ${session.id}`);
        console.log(`   Room: ${session.room_name}`);
        console.log(`   Type: ${session.type || 'NULL'}`);
        console.log(`   Active: ${session.active}`);
        console.log(`   Started: ${session.started_at || 'NULL'}`);
        console.log(`   Ended: ${session.ended_at || 'NULL'}`);
        console.log(`   Customer ID: ${session.customer_id || 'NULL'}`);
        console.log(`   Consultant ID: ${session.consultant_id || 'NULL'}`);
        console.log('');
      });
    }
  }
  
  // Check for platform account
  const platformAccount = db.prepare('SELECT * FROM users WHERE email = ?').get('platform@swang.it');
  if (platformAccount) {
    console.log(`✅ Platform account found: ID ${platformAccount.id}, Credits: ${platformAccount.credits}\n`);
  } else {
    console.log('⚠️  Platform account not found (will be created automatically)\n');
  }
  
  console.log('💡 Possible issues:');
  console.log('   1. Consultant profile missing → video_price defaults to 5 credits');
  console.log('   2. start_call event not emitted from client → check browser console');
  console.log('   3. Participants count < 2 → both users must join the room');
  console.log('   4. Session already ended → check ended_at field');
  console.log('   5. Billing interval already exists → check sessionState\n');
  
  db.close();
  
} catch (error) {
  console.error('ERROR:', error.message);
  process.exit(1);
}

