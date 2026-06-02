const cron = require('node-cron');
const Config = require('./config');
const logger = require('./logger');
const TradingEngine = require('./tradingEngine');

class Scheduler {
  constructor() {
    this.schedulePattern = Config.getSchedulePattern();
    this.tradingEngine = new TradingEngine();
    this.isRunning = false;
    this.currentJob = null;
    this.lockFile = null;
  }

  async start() {
    try {
      logger.engineStarted();
      
      // Validate configuration
      Config.validate();
      
      // Initialize trading engine
      await this.tradingEngine.initialize();
      
      // Schedule the job
      this.scheduleJob();
      
// Run immediately on startup
      
      logger.info(`Scheduler started with pattern: ${this.schedulePattern}`);
      this.isRunning = true;
      
      return true;
    } catch (error) {
      logger.error('Failed to start scheduler:', error);
      throw error;
    }
  }

  scheduleJob() {
    this.currentJob = cron.schedule(this.schedulePattern, async () => {
      await this.runScheduledTask();
    }, {
      scheduled: true,
      timezone: 'UTC' // Critical: Use UTC to avoid DST issues
    });
    
    logger.info(`Cron job scheduled with pattern: ${this.schedulePattern}`);
  }

  async runScheduledTask() {
    if (this.isTaskRunning) {
      logger.warn('Previous task still running. Skipping this execution.');
      return;
    }
    
    this.isTaskRunning = true;
    
    try {
      logger.schedulerRun();
      
      // Check if we should run (e.g., maintenance window, market closed, etc.)
      if (!this.shouldRun()) {
        logger.info('Scheduler skipping execution based on run conditions');
        return;
      }
      
      // Acquire lock to prevent concurrent execution
      if (!await this.acquireLock()) {
        logger.warn('Could not acquire lock. Another instance may be running.');
        return;
      }
      
      // Execute trading engine
      await this.tradingEngine.processAllSetups();
      
      // Release lock
      await this.releaseLock();
      
      logger.info('Scheduled task completed successfully');
    } catch (error) {
      logger.error('Error in scheduled task:', error);
      
      // Ensure lock is released even on error
      try {
        await this.releaseLock();
      } catch (lockError) {
        logger.error('Error releasing lock:', lockError);
      }
    } finally {
      this.isTaskRunning = false;
    }
  }

  async acquireLock() {
    // Simple file-based locking mechanism
    // In production, consider using database-based locks or Redis
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const lockDir = path.join(process.cwd(), 'temp');
      const lockFile = path.join(lockDir, 'trading-engine.lock');
      
      // Create temp directory if it doesn't exist
      await fs.mkdir(lockDir, { recursive: true });
      
      // Check if lock file exists and is recent (within 5 minutes)
      try {
        const stats = await fs.stat(lockFile);
        const lockAge = Date.now() - stats.mtimeMs;
        
        if (lockAge < 5 * 60 * 1000) { // 5 minutes
          logger.warn(`Lock file exists and is ${Math.round(lockAge / 1000)}s old`);
          return false;
        }
        
        // Lock is stale, remove it
        logger.warn('Removing stale lock file');
        await fs.unlink(lockFile);
      } catch (error) {
        // Lock file doesn't exist, that's fine
      }
      
      // Create lock file
      await fs.writeFile(lockFile, `${process.pid}:${new Date().toISOString()}`);
      this.lockFile = lockFile;
      
      return true;
    } catch (error) {
      logger.error('Error acquiring lock:', error);
      return false;
    }
  }

  async releaseLock() {
    if (!this.lockFile) {
      return;
    }
    
    const fs = require('fs').promises;
    
    try {
      await fs.unlink(this.lockFile);
      this.lockFile = null;
    } catch (error) {
      logger.error('Error releasing lock:', error);
    }
  }

  shouldRun() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    
    // Example: Don't run during Bybit maintenance (typically 10:00-10:10 UTC)
    if (utcHour === 10 && now.getUTCMinutes() < 10) {
      logger.info('Skipping execution during Bybit maintenance window');
      return false;
    }
    
    // Could add more conditions here:
    // - Market holidays
    // - System maintenance windows
    // - Emergency stop conditions
    
    return true;
  }

  async stop() {
    try {
      if (this.currentJob) {
        this.currentJob.stop();
        logger.info('Cron job stopped');
      }
      
      // Release lock if held
      await this.releaseLock();
      
      // Cleanup trading engine
      await this.tradingEngine.cleanup();
      
      logger.engineStopped();
      this.isRunning = false;
      
      return true;
    } catch (error) {
      logger.error('Error stopping scheduler:', error);
      throw error;
    }
  }

  getNextRunTime() {
    if (!this.currentJob) {
      return null;
    }
    
    // node-cron doesn't expose next run time directly
    // This is a simplified calculation
    const now = new Date();
    const currentMinute = now.getUTCMinutes();
    
    const minutesToNext = 5 - (currentMinute % 5);
    const nextTime = new Date(now);
    nextTime.setUTCMinutes(now.getUTCMinutes() + minutesToNext);
    nextTime.setUTCSeconds(0);
    nextTime.setUTCMilliseconds(0);
    
    return nextTime;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isTaskRunning: this.isTaskRunning || false,
      schedulePattern: this.schedulePattern,
      nextRunTime: this.getNextRunTime(),
      lockHeld: !!this.lockFile,
      engineStatus: this.tradingEngine.getStatus()
    };
  }
}

module.exports = Scheduler;