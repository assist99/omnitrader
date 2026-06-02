#!/usr/bin/env node
/**
 * OmniTrader Trading Engine - Entry Point
 * 
 * Simple wrapper that loads the main application.
 * Use app.js directly for more control.
 */

console.log('🚀 OmniTrader Trading Engine');
console.log('=============================');

// Check for required environment variables
const requiredEnvVars = ['ENCRYPTION_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease set these variables in your .env file or environment.');
  console.error('See .env.example for reference.');
  process.exit(1);
}

// Load the main application
try {
  require('./app');
} catch (error) {
  console.error('❌ Failed to start Trading Engine:', error.message);
  console.error(error.stack);
  process.exit(1);
}