#!/usr/bin/env node
/**
 * Script to start the Screener CandleProvider service
 */

const path = require('path');

// Add the engine directory to the path
const enginePath = path.join(__dirname, 'src', 'engine');
console.log('Changing directory to:', enginePath);
process.chdir(enginePath);

// Load environment variables
const envPath = path.join(__dirname, '.env');
console.log('Loading env from:', envPath);
require('dotenv').config({ path: envPath });

console.log('Current directory:', process.cwd());
console.log('__dirname:', __dirname);

// Import and start the service
const ScreenerCandleProvider = require('./screenerCandleProvider');

const service = new ScreenerCandleProvider();

// Handle process signals
const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}, shutting down...`);
  await service.stop();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  service.stop().finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason);
});

// Start the service
service.start().catch((error) => {
  console.error('Failed to start Screener CandleProvider:', error);
  process.exit(1);
});

// Log status every minute
setInterval(() => {
  const status = service.getStatus();
  console.log(`Service status: ${status.isRunning ? 'running' : 'stopped'}, monitoring ${status.symbols.length} symbols`);
}, 60000);