# Engine (trading engine) - README

This service provides the backend API and core trading engine logic. It owns the database and secrets.

Quick start

```powershell
cd src/engine
npm install
cp .env.example .env
# Edit .env: set JWT_SECRET, API_PORT, DB file path, TELEGRAM_TOKEN, ENCRYPTION_KEY, etc.
npm start
```

Health check

Request `GET /api/system/health` to confirm the service is up.

API overview

See `doc/engine-api.md` for a summary of routes and required auth.

Notes for developers

- The engine uses `src/engine/db/database.js` for DB access — add methods there if you need new endpoints.
- Authentication uses JWTs signed with `JWT_SECRET`.
- Sensitive fields (account API keys) are encrypted with `src/engine/utils/encryption.js` before storing in the DB.
# OmniTrader Trading Engine

A Node.js trading engine that runs on a 15-minute schedule to monitor and execute trading setups according to specified logic.

## Features

- **15-minute scheduler** - Runs at exact quarter-hours (00:00, 00:15, 00:30, 00:45 UTC)
- **Multi-account support** - Supports multiple Bybit accounts with encrypted API credentials
- **Technical indicators** - SuperTrend, MACD, EMA, and candlestick pattern detection
- **Risk management** - Position sizing, stop-loss, multiple take-profit levels
- **Break-even logic** - Automatically moves SL to entry price when TP1 hits
- **Telegram notifications** - Real-time alerts for all trading events
- **Health monitoring** - Built-in health server with metrics endpoint
- **Error resilience** - Graceful error handling and recovery
 
## Prerequisites

- Node.js 18+ 
- SQLite database (shared with UI application)
- Bybit API credentials (mainnet or testnet)
- Telegram bot token (optional, for notifications)

## Quick Start

1. **Install dependencies:**
   ```bash
   cd src/engine
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Run in scheduled mode:**
   ```bash
   npm start
   ```

4. **Run once (for testing):**
   ```bash
   npm run once
   ```

## Configuration

### Required Environment Variables

```env
ENCRYPTION_KEY=your_encryption_key_here
DATABASE_PATH=../db/trading.db
```

### Optional Environment Variables

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
BYBIT_TESTNET_API_URL=https://api-testnet.bybit.com
BYBIT_MAINNET_API_URL=https://api.bybit.com
HEALTH_PORT=3001
LOG_LEVEL=info
```

### Database Schema

The engine uses the same SQLite database as the UI. Ensure the following tables exist:

- `users` - User accounts
- `bybit_accounts` - Encrypted Bybit API credentials
- `trading_setups` - Trading setups with all parameters
- `orders` - Order tracking with Bybit order IDs

See `src/ui/src/db/schema.ts` for the complete schema.

## Architecture

```
src/engine/
├── index.js              # Entry point
├── app.js               # Main application
├── scheduler.js         # 15-minute scheduler
├── tradingEngine.js     # Core orchestration logic
├── config.js           # Configuration management
├── logger.js           # Structured logging
├── healthServer.js     # HTTP health server
├── db/
│   └── database.js     # Database operations
├── services/
│   ├── bybitService.js     # Bybit API integration
│   ├── telegramService.js  # Telegram notifications
│   └── indicatorService.js # Technical indicators
└── utils/
    ├── encryption.js   # Encryption/decryption
    ├── timeUtils.js    # Time and schedule utilities
    ├── priceUtils.js   # Price calculations
    └── candleUtils.js  # Candle data processing
```

## Processing Flow

1. **Scheduler** triggers every 15 minutes
2. **Trading Engine** fetches all setups (pending, triggered, active)
3. For each setup:
   - **Pending**: Check ignore box, activation price, trigger if conditions met
   - **Triggered**: Check entry indicator, place orders if conditions met
   - **Active**: Monitor position, check exit conditions, update order statuses
4. **Notifications** sent via Telegram for all significant events
5. **Statistics** logged for monitoring

## API Endpoints (Health Server)

- `GET /health` - Basic health check
- `GET /status` - Detailed system status
- `GET /metrics` - Performance metrics
- `GET /config` - Configuration overview (masked)
- `POST /trigger` - Manual trigger (for testing)

## Development

### Running Tests
```bash
npm test
```

### Development Mode
```bash
npm run dev
```

### Manual Testing
```bash
# Run engine once
npm run once

# Check health server
curl http://localhost:3001/health

# Trigger manually
curl -X POST http://localhost:3001/trigger
```

## Deployment

### PM2 (Recommended)
```bash
npm install -g pm2
pm2 start npm --name "trading-engine" -- start
pm2 save
pm2 startup
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["npm", "start"]
```

### Systemd Service
Create `/etc/systemd/system/trading-engine.service`:
```ini
[Unit]
Description=OmniTrader Trading Engine
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/opt/omnitrader/src/engine
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Monitoring

### Logs
- Console output with colored logging
- File logging to `logs/trading-engine.log`
- Log rotation (5 files, 5MB each)

### Metrics
- Total setups processed
- Setups activated/cancelled
- Orders placed/filled
- Error count
- Uptime and memory usage

### Alerts
- Telegram notifications for critical events
- Health check failures
- Schedule misses
- API errors

## Troubleshooting

### Common Issues

1. **"ENCRYPTION_KEY not set"**
   - Ensure `.env` file exists with correct key
   - Key must match the UI's encryption key

2. **"Database not found"**
   - Check `DATABASE_PATH` in `.env`
   - Ensure SQLite database exists and is accessible

3. **"Telegram bot not initialized"**
   - Check `TELEGRAM_BOT_TOKEN` in `.env`
   - Verify bot token is valid

4. **"Bybit API authentication failed"**
   - Verify API credentials in database
   - Check if account is testnet/mainnet
   - Ensure sufficient permissions

### Debug Mode
```bash
LOG_LEVEL=debug npm start
```

## Security Considerations

- API credentials stored encrypted in database
- Environment variables for sensitive configuration
- File-based locking to prevent concurrent execution
- Input validation for all external data
- Rate limiting for Bybit API calls
- Secure logging (no sensitive data in logs)

## Performance

- Processes setups in parallel (configurable)
- Database connection pooling
- Cached Bybit service instances
- Efficient indicator calculations
- Graceful degradation under load

## License

MIT

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review logs in `logs/trading-engine.log`
3. Check health server endpoints
4. Contact development team