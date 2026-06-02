const TelegramBot = require('node-telegram-bot-api');
const Config = require('../config');
const logger = require('../logger');

class TelegramService {
  constructor() {
    this.botToken = Config.getTelegramBotToken();
    this.bot = null;
    this.defaultChatId = Config.getTelegramUserId();

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
      const chatId = this.getUserChatId();
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
    
    let message = `${emoji} <b>${this.getMessageTitle(messageType)}</b>\n`;
    message += `⏰ ${timestamp}\n\n`;
    
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

  formatSetupCreated(data) {
    return `
📈 <b>Setup #${data.setupId}</b>
${data.symbol} • ${data.side.toUpperCase()}

🎯 Activation: $${data.activationPrice}
📊 Entry: ${data.entryIndicatorType} (${data.entryIndicatorTf})
⚖️ Risk: ${data.riskValue} ${data.riskType}

📝 ${data.memo || 'No memo'}
`;
  }

  formatSetupActivated(data) {
    return `
🚀 <b>Setup #${data.setupId} Activated</b>
${data.symbol} • ${data.side.toUpperCase()}

💰 Price: $${data.price}
⏰ Time: ${new Date(data.timestamp).toUTCString().substring(0, 22)}

📊 Checking entry conditions...
`;
  }

  formatSetupCancelled(data) {
    return `
❌ <b>Setup #${data.setupId} Cancelled</b>
${data.symbol} • ${data.side.toUpperCase()}

📝 Reason: ${data.reason}

⏰ Time: ${new Date(data.timestamp).toUTCString().substring(0, 22)}
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
    
    return `
🔄 <b>${orderTypeMap[data.orderType]} Order Placed</b>
Setup #${data.setupId} • ${data.symbol}

💰 Price: $${data.price}
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
    
    return `
✅ <b>${orderTypeMap[data.orderType]} Order Filled</b>
Setup #${data.setupId} • ${data.symbol}

💰 Price: $${data.price}
📊 Quantity: ${data.quantity}${pnlInfo}

⏰ Time: ${new Date(data.timestamp).toUTCString().substring(0, 22)}
`;
  }

  formatTpHit(data) {
    return `
🎯 <b>TP${data.tpLevel} Hit!</b>
Setup #${data.setupId} • ${data.symbol}

💰 Price: $${data.price}
📊 Quantity: ${data.quantity}

💰 P&L: $${data.pnl.netPnl.toFixed(2)} (${data.pnl.pnlPercent.toFixed(2)}%)
📈 RR: ${data.tpLevel}:1

⏰ Time: ${new Date(data.timestamp).toUTCString().substring(0, 22)}
`;
  }

  formatSlHit(data) {
    return `
🛑 <b>Stop Loss Hit</b>
Setup #${data.setupId} • ${data.symbol}

💰 Price: $${data.price}
📊 Quantity: ${data.quantity}

💰 P&L: $${data.pnl.netPnl.toFixed(2)} (${data.pnl.pnlPercent.toFixed(2)}%)

⏰ Time: ${new Date(data.timestamp).toUTCString().substring(0, 22)}
`;
  }

  formatBeActivated(data) {
    return `
🛡️ <b>Break-Even Activated</b>
Setup #${data.setupId} • ${data.symbol}

🎯 SL moved to entry price: $${data.entryPrice}

📊 Position now risk-free!
⏰ Time: ${new Date(data.timestamp).toUTCString().substring(0, 22)}
`;
  }

  formatExitTriggered(data) {
    return `
🚪 <b>Exit Condition Triggered</b>
Setup #${data.setupId} • ${data.symbol}

📊 Exit: ${data.exitIndicatorType} (${data.exitIndicatorTf})
💰 Price: $${data.price}

💰 P&L: $${data.pnl.netPnl.toFixed(2)} (${data.pnl.pnlPercent.toFixed(2)}%)

⏰ Time: ${new Date(data.timestamp).toUTCString().substring(0, 22)}
`;
  }

  formatError(data) {
    return `
⚠️ <b>Error Alert</b>

🔧 Component: ${data.component}
❌ Error: ${data.error}

📝 Details: ${data.details || 'No additional details'}

⏰ Time: ${new Date(data.timestamp).toUTCString().substring(0, 22)}
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

  getUserChatId() {
    return this.defaultChatId || null;
  }

  isAvailable() {
    return this.bot !== null;
  }
}

module.exports = TelegramService;