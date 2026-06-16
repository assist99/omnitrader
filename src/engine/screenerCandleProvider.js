#!/usr/bin/env node
/**
 * Screener CandleProvider - Standalone service for screener candle updates
 * 
 * This service runs independently from the TradingEngine and handles
 * real-time candle updates for screener items only.
 */

const Database = require('./db/database');
const CandleProvider = require('./services/candleProvider');
const ScreenerService = require('./services/screenerService');
const SupplyDemandService = require('./services/supplyDemandService');
const TelegramService = require('./services/telegramService');
const logger = require('./logger');
const Config = require('./config');
const fs = require('fs');
const path = require('path');

class ScreenerCandleProvider {
  constructor() {
    this.db = new Database();
    this.telegramService = new TelegramService(this.db);
    this.candleProvider = null;
    this.isRunning = false;
  }

  loadSymbols() {
    const configPath = path.resolve(Config.getProjectRoot(), 'config/symbols/bybit.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    return config.symbols.map(s => s.symbol);
  }

  loadTimeframes() {
    const configPath = path.resolve(Config.getProjectRoot(), 'config/symbols/bybit.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    return config.intervals;
  }

  async start() {
    try {
      logger.info('Starting Screener CandleProvider service...');
      
      // Connect to database
      await this.db.connect();
      logger.info('Database connected');
      
      // Initialize ScreenerService dependencies
      ScreenerService.setDeps(this.db, this.telegramService);
      
      // Initialize SupplyDemandService dependencies
      SupplyDemandService.setDeps(this.db, this.telegramService);
      
      // Load ALL symbols and timeframes from config
      const symbols = this.loadSymbols();
      const timeframes = this.loadTimeframes();
      
      logger.info(`Loaded ${symbols.length} symbols and ${timeframes.length} timeframes from config`);
      
      // Create and start CandleProvider
      this.candleProvider = new CandleProvider({
        exchange: 'bybit',
        symbols,
        timeframes,
        limit: 100,
        onUpdate: (symbol, timeframe, candle) => {
          // Optional: log candle updates
          //logger.debug(`Candle closed for screener: ${symbol} ${timeframe}`);
        },
        onScreenerUpdate: (symbol, timeframe, closedBars) => {
          // Query database for screener items matching this symbol/timeframe
          // This happens on each candle close, so we always get fresh data
          //ScreenerService.processItemFromCandle(symbol, timeframe, closedBars);
          // Also process supply/demand items
          //SupplyDemandService.processItemFromCandle(symbol, timeframe, closedBars);
        },
        isTestnet: false
      });
      
      await this.candleProvider.start();
      this.isRunning = true;
      
      logger.info('✅ Screener CandleProvider service started successfully');
      logger.info(`📊 Monitoring ALL ${symbols.length} symbols from config`);
      logger.info(`⏱️  All timeframes: ${timeframes.join(', ')}`);
      logger.info(`ℹ️  New screener items added via UI will be processed on next candle close`);
      
    } catch (error) {
      logger.error('Failed to start Screener CandleProvider:', error);
      await this.stop();
      throw error;
    }
  }

  async stop() {
    logger.info('Stopping Screener CandleProvider service...');
    this.isRunning = false;
    
    if (this.candleProvider) {
      try {
        await this.candleProvider.stop();
        logger.info('CandleProvider stopped');
      } catch (error) {
        logger.error('Error stopping CandleProvider:', error);
      }
    }
    
    try {
      await this.db.disconnect();
      logger.info('Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
    }
    
    logger.info('Screener CandleProvider service stopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      symbols: this.candleProvider ? this.candleProvider.symbols : [],
      timeframes: this.candleProvider ? this.candleProvider.timeframes : [],
      storeSize: this.candleProvider ? this.candleProvider.store.size : 0
    };
  }
}

// CLI entry point
if (require.main === module) {
  const app = new ScreenerCandleProvider();
  
  // Handle process signals
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down...`);
    await app.stop();
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    app.stop().finally(() => process.exit(1));
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection:', reason);
  });
  
  // Start the service
  app.start().catch((error) => {
    logger.error('Failed to start Screener CandleProvider:', error);
    process.exit(1);
  });
}

module.exports = ScreenerCandleProvider;