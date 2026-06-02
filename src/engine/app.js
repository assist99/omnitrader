#!/usr/bin/env node
/**
 * OmniTrader Trading Engine - Main Application
 * 
 * Two modes:
 * 1. Scheduled mode: Runs on 15-minute schedule with health server
 * 2. Once mode: Runs once and exits (for testing/debugging)
 */

const Scheduler = require('./scheduler');
const HealthServer = require('./healthServer');
const Config = require('./config');
const logger = require('./logger');

class TradingEngineApp {
  constructor() {
    this.scheduler = null;
    this.healthServer = null;
    this.isShuttingDown = false;
    
    // Handle process signals
    this.setupSignalHandlers();
  }

  setupSignalHandlers() {
    process.on('SIGINT', async () => {
      await this.shutdown('SIGINT');
    });

    process.on('SIGTERM', async () => {
      await this.shutdown('SIGTERM');
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      this.shutdown('uncaughtException').finally(() => {
        process.exit(1);
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection:', reason);
    });
  }

  async start() {
    try {
      logger.info('🚀 Starting OmniTrader Trading Engine...');
      
      // Validate configuration
      Config.validate();
      
      // Start health server
      this.healthServer = new HealthServer(process.env.HEALTH_PORT || 3001);
      await this.healthServer.start();
      
      // Create and start scheduler
      this.scheduler = new Scheduler();
      await this.scheduler.start();
      
      // Link scheduler to health server
      this.healthServer.setScheduler(this.scheduler);
      
      logger.info('✅ Trading Engine started successfully');
      logger.info(`📅 Next scheduled run: ${this.scheduler.getNextRunTime()}`);
      logger.info(`🏥 Health server: http://localhost:${process.env.HEALTH_PORT || 3001}/health`);
      
      // Keep the process running
      this.keepAlive();
      
    } catch (error) {
      logger.error('❌ Failed to start Trading Engine:', error);
      
      // Try to clean up on startup failure
      try {
        await this.shutdown('startup_failure');
      } catch (cleanupError) {
        logger.error('Error during cleanup:', cleanupError);
      }
      
      process.exit(1);
    }
  }

  keepAlive() {
    // Simple heartbeat logging
    setInterval(() => {
      if (this.scheduler && !this.isShuttingDown) {
        const status = this.scheduler.getStatus();
        logger.debug('💓 Engine heartbeat', {
          isRunning: status.isRunning,
          nextRunTime: status.nextRunTime,
          setupsProcessed: status.engineStatus?.stats?.totalSetupsProcessed || 0
        });
      }
    }, 60000); // Every minute
  }

  async shutdown(reason) {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    logger.info(`🛑 Shutting down Trading Engine (${reason})...`);
    
    const shutdownPromises = [];
    
    // Stop health server
    if (this.healthServer) {
      shutdownPromises.push(
        this.healthServer.stop().catch(error => {
          logger.error('Error stopping health server:', error);
        })
      );
    }
    
    // Stop scheduler
    if (this.scheduler) {
      shutdownPromises.push(
        this.scheduler.stop().catch(error => {
          logger.error('Error stopping scheduler:', error);
        })
      );
    }
    
    // Wait for all shutdown operations
    try {
      await Promise.allSettled(shutdownPromises);
      logger.info('✅ Trading Engine shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  async runOnce() {
    // Alternative mode: run once and exit (for testing/debugging)
    try {
      logger.info('⚡ Running Trading Engine once...');
      
      const TradingEngine = require('./tradingEngine');
      const engine = new TradingEngine();
      
      await engine.initialize();
      const stats = await engine.processAllSetups();
      await engine.cleanup();
      
      logger.info('✅ Single run completed', { stats });
      return stats;
    } catch (error) {
      logger.error('❌ Error in single run:', error);
      throw error;
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] || 'scheduled';

const app = new TradingEngineApp();

if (mode === 'once') {
  app.runOnce()
    .then(() => {
      logger.info('👋 Exiting after single run');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 Single run failed:', error);
      process.exit(1);
    });
} else if (mode === 'scheduled') {
  app.start();
} else {
  console.log('Usage: node app.js [mode]');
  console.log('');
  console.log('Modes:');
  console.log('  scheduled - Run on 15-minute schedule with health server (default)');
  console.log('  once      - Run once and exit (for testing)');
  console.log('');
  console.log('Environment variables:');
  console.log('  HEALTH_PORT      - Port for health server (default: 3001)');
  console.log('  ENCRYPTION_KEY   - Required: Key for encrypting API credentials');
  console.log('  DATABASE_PATH    - Path to SQLite database (default: db/trading.db)');
  console.log('  TELEGRAM_BOT_TOKEN - Optional: Telegram bot token for notifications');
  console.log('');
  process.exit(1);
}