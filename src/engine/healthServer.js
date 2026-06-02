const express = require('express');
const Scheduler = require('./scheduler');
const Config = require('./config');
const logger = require('./logger');

class HealthServer {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.scheduler = null;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.url}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'trading-engine',
        version: '1.0.0'
      };
      
      if (this.scheduler) {
        const status = this.scheduler.getStatus();
        health.scheduler = {
          isRunning: status.isRunning,
          isTaskRunning: status.isTaskRunning,
          nextRunTime: status.nextRunTime,
          lockHeld: status.lockHeld
        };
        
        health.engine = status.engineStatus;
      }
      
      res.json(health);
    });

    // Manual trigger endpoint (for testing)
    this.app.post('/trigger', async (req, res) => {
      try {
        if (!this.scheduler) {
          return res.status(503).json({ error: 'Scheduler not available' });
        }
        
        logger.info('Manual trigger requested via HTTP');
        await this.scheduler.runScheduledTask();
        
        res.json({ success: true, message: 'Manual trigger executed' });
      } catch (error) {
        logger.error('Error in manual trigger:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Status endpoint with detailed information
    this.app.get('/status', (req, res) => {
      if (!this.scheduler) {
        return res.status(503).json({ error: 'Scheduler not available' });
      }
      
      const status = this.scheduler.getStatus();
      res.json(status);
    });

    // Configuration endpoint (read-only)
    this.app.get('/config', (req, res) => {
      const config = {
        databasePath: Config.getDatabasePath(),
        schedulePattern: Config.getSchedulePattern(),
        bybitTestnetUrl: Config.getBybitApiUrl(true),
        bybitMainnetUrl: Config.getBybitApiUrl(false),
        maxConcurrentRequests: Config.getMaxConcurrentRequests(),
        requestTimeoutMs: Config.getRequestTimeoutMs(),
        telegramAvailable: !!Config.getTelegramBotToken()
      };
      
      // Mask sensitive information
      Object.keys(config).forEach(key => {
        if (typeof config[key] === 'string' && config[key].includes('key')) {
          config[key] = '***MASKED***';
        }
      });
      
      res.json(config);
    });

    // Metrics endpoint (for monitoring)
    this.app.get('/metrics', (req, res) => {
      if (!this.scheduler || !this.scheduler.getStatus().engineStatus) {
        return res.status(503).json({ error: 'Metrics not available' });
      }
      
      const stats = this.scheduler.getStatus().engineStatus.stats;
      const metrics = {
        totalSetupsProcessed: stats.totalSetupsProcessed || 0,
        setupsActivated: stats.setupsActivated || 0,
        setupsCancelled: stats.setupsCancelled || 0,
        ordersPlaced: stats.ordersPlaced || 0,
        errors: stats.errors || 0,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        lastRun: stats.lastRun
      };
      
      res.json(metrics);
    });
  }

  setScheduler(scheduler) {
    this.scheduler = scheduler;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        logger.info(`Health server listening on port ${this.port}`);
        resolve();
      });
      
      this.server.on('error', (error) => {
        logger.error(`Health server error:`, error);
        reject(error);
      });
    });
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      
      this.server.close((error) => {
        if (error) {
          logger.error('Error stopping health server:', error);
          reject(error);
        } else {
          logger.info('Health server stopped');
          resolve();
        }
      });
    });
  }
}

module.exports = HealthServer;