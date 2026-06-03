const TelegramBot = require('node-telegram-bot-api');
const Config = require('../config');
const logger = require('../logger');

class TelegramService {
  constructor(db) {
    this.botToken = Config.getTelegramBotToken();
    this.bot = null;
    this.defaultChatId = Config.getTelegramUserId();
    this.db = db || null;

    if (this.botToken) {
      this.initializeBot();
    } else {
      logger.warn('Telegram bot token not configured. Notifications will be disabled.');
    }
  }

  initializeBot() {
    try {
      this.bot = new TelegramBot(this.botToken, { polling: false });
      logger.info('Telegram bot initialized');

    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
      this.bot = null;
    }
  }

  async sendNotification(userId, messageType, data) {
    if (!this.bot) {
      logger.warn('Telegram bot not available. Skipping notification.');
      return false;
    }

    try {
      const chatId = await this.getUserChatId(userId);
      if (!chatId) {
        logger.warn('TELEGRAM_USER_ID not set. Skipping notification.');
        return false;
      }

      const message = this.formatMessage(messageType, data);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });

      logger.info(`Telegram notification sent: ${messageType}`);
      return true;
    } catch (error) {
      logger.error('Failed to send Telegram notification:', error);
      return false;
    }
  }

  async sendDirectNotification(chatId, message) {
    if (!this.bot || !chatId) {
      return false;
    }

    try {
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });

      return true;
    } catch (error) {
      logger.error('Failed to send direct Telegram notification:', error);
      return false;
    }
  }

  formatMessage(messageType, data) {
    const emoji = this.getEmojiForMessageType(messageType);
    const timestamp = new Date().toUTCString().substring(0, 22);
    const subtitle = this.getMessageSubtitle(messageType, data);

    let message = `${emoji} <b>${this.getMessageTitle(messageType)}</b>`;
    if (subtitle) message += `\n${subtitle}`;
    message += `\n⏰ ${timestamp}\n\n`;
    
    switch (messageType) {
      case 'setup_created':
        message += this.formatSetupCreated(data);
        break;
      case 'setup_activated':
        message += this.formatSetupActivated(data);
        break;
      case 'setup_cancelled':
        message += this.formatSetupCancelled(data);
        break;
      case 'order_placed':
        message += this.formatOrderPlaced(data);
        break;
      case 'order_filled':
        message += this.formatOrderFilled(data);
        break;
      case 'tp_hit':
        message += this.formatTpHit(data);
        break;
      case 'sl_hit':
        message += this.formatSlHit(data);
        break;
      case 'be_activated':
        message += this.formatBeActivated(data);
        break;
      case 'exit_triggered':
        message += this.formatExitTriggered(data);
        break;
      case 'error':
        message += this.formatError(data);
        break;
      default:
        message += JSON.stringify(data, null, 2);
    }
    
    return message;
  }

  getMessageSubtitle(messageType, data) {
    try {
      switch (messageType) {
        case 'setup_created':
        case 'setup_activated':
        case 'setup_cancelled':
        case 'order_placed':
        case 'order_filled':
        case 'tp_hit':
        case 'sl_hit':
        case 'be_activated':
        case 'exit_triggered':
          if (data && data.setupId && data.symbol) {
            const side = data.side ? ` • ${data.side.toUpperCase()}` : '';
            return `Setup #${data.setupId} • ${data.symbol}${side}`;
          }
          if (data && data.symbol) {
            return `${data.symbol}${data.side ? ` • ${data.side.toUpperCase()}` : ''}`;
          }
          return '';
        case 'error':
          return data && data.component ? `Component: ${data.component}` : '';
        default:
          return '';
      }
    } catch (e) {
      return '';
    }
  }

  formatSetupCreated(data) {
    return `🎯 Activation: $${data.activationPrice}
📊 Entry: ${data.entryIndicatorType} (${data.entryIndicatorTf})
⚖️ Risk: ${data.riskValue} ${data.riskType}

📝 ${data.memo || 'No memo'}
`;
  }

  formatSetupActivated(data) {
    return `💰 Price: $${data.price}

📊 Checking entry conditions...
`;
  }

  formatSetupCancelled(data) {
    return `📝 Reason: ${data.reason}
`;
  }

  formatOrderPlaced(data) {
    const orderTypeMap = {
      'entry': 'Entry',
      'tp1': 'TP1',
      'tp2': 'TP2',
      'tp3': 'TP3',
      'tp4': 'TP4',
      'sl': 'SL'
    };
    
    return `💰 Price: $${data.price}
  📊 Quantity: ${data.quantity}

  📈 Side: ${data.side.toUpperCase()}
  🎯 Type: ${data.orderType.toUpperCase()}
  `;
  }

  formatOrderFilled(data) {
    const orderTypeMap = {
      'entry': 'Entry',
      'tp1': 'TP1',
      'tp2': 'TP2',
      'tp3': 'TP3',
      'tp4': 'TP4',
      'sl': 'SL'
    };
    
    const pnlInfo = data.pnl ? `\n💰 P&L: $${data.pnl.netPnl.toFixed(2)} (${data.pnl.pnlPercent.toFixed(2)}%)` : '';

    return `💰 Price: $${data.price}
  📊 Quantity: ${data.quantity}${pnlInfo}
  `;
  }

  formatTpHit(data) {
    return `💰 Price: $${data.price}
📊 Quantity: ${data.quantity}

💰 P&L: $${data.pnl.netPnl.toFixed(2)} (${data.pnl.pnlPercent.toFixed(2)}%)
📈 RR: ${data.tpLevel}:1
`;
  }

  formatSlHit(data) {
    return `💰 Price: $${data.price}
📊 Quantity: ${data.quantity}

💰 P&L: $${data.pnl.netPnl.toFixed(2)} (${data.pnl.pnlPercent.toFixed(2)}%)
`;
  }

  formatBeActivated(data) {
    return `🎯 SL moved to entry price: $${data.entryPrice}

📊 Position now risk-free!
`;
  }

  formatExitTriggered(data) {
    return `📊 Exit: ${data.exitIndicatorType} (${data.exitIndicatorTf})
💰 Price: $${data.price}

💰 P&L: $${data.pnl.netPnl.toFixed(2)} (${data.pnl.pnlPercent.toFixed(2)}%)
`;
  }

  formatError(data) {
    return `❌ Error: ${data.error}

📝 Details: ${data.details || 'No additional details'}
`;
  }

  getEmojiForMessageType(messageType) {
    const emojiMap = {
      'setup_created': '📊',
      'setup_activated': '🚀',
      'setup_cancelled': '❌',
      'order_placed': '🔄',
      'order_filled': '✅',
      'tp_hit': '🎯',
      'sl_hit': '🛑',
      'be_activated': '🛡️',
      'exit_triggered': '🚪',
      'error': '⚠️'
    };
    
    return emojiMap[messageType] || '📨';
  }

  getMessageTitle(messageType) {
    const titleMap = {
      'setup_created': 'Setup Created',
      'setup_activated': 'Setup Activated',
      'setup_cancelled': 'Setup Cancelled',
      'order_placed': 'Order Placed',
      'order_filled': 'Order Filled',
      'tp_hit': 'Take Profit Hit',
      'sl_hit': 'Stop Loss Hit',
      'be_activated': 'Break-Even Activated',
      'exit_triggered': 'Exit Triggered',
      'error': 'Error Alert'
    };
    
    return titleMap[messageType] || 'Notification';
  }

  async getUserChatId(userId) {
    if (this.db && userId) {
      try {
        const chatId = await this.db.getUserTelegramChatId(userId);
        if (chatId) return chatId;
      } catch (err) {
        logger.warn('Failed to query user telegram chat id:', err.message);
      }
    }
    return this.defaultChatId || null;
  }

  isAvailable() {
    return this.bot !== null;
  }
}

module.exports = TelegramService;