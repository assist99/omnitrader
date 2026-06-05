const logger = require('../logger');

class PriceUtils {
  static calculatePositionSize(riskValue, accountBalance, entryPrice, slPrice, side, riskType = 'percent') {
    try {
      // Calculate risk amount in USD
      const riskAmount = riskType === 'fixed' ? riskValue : accountBalance * (riskValue / 100);
      
      // Calculate price difference for risk calculation
      const priceDifference = Math.abs(entryPrice - slPrice);
      
      if (priceDifference <= 0) {
        throw new Error('Invalid price difference for position size calculation');
      }
      
      // Calculate position size
      const positionSize = riskAmount / priceDifference;
      
      logger.info(`Position size calc: risk=${riskValue}${riskType === 'percent' ? '%' : '$'}, balance=$${accountBalance}, entry=$${entryPrice}, sl=$${slPrice}, size=${positionSize}`);
      
      return positionSize;
    } catch (error) {
      logger.error('Error calculating position size:', error);
      throw error;
    }
  }

  static calculateTPPrices(entryPrice, slPrice, rrRatios = [1, 2, 3, 4]) {
    try {
      const priceDifference = entryPrice - slPrice;
      const tpPrices = rrRatios.map(rr => {
        if (priceDifference > 0) {
          // Long position: entryPrice > slPrice
          return entryPrice + (Math.abs(priceDifference) * rr);
        } else {
          // Short position: entryPrice < slPrice
          return entryPrice - (Math.abs(priceDifference) * rr);
        }
      });
      
      logger.info(`TP prices calc: entry=$${entryPrice}, sl=$${slPrice}, TPs=${tpPrices.map(p => `$${p.toFixed(2)}`).join(', ')}`);
      
      return tpPrices;
    } catch (error) {
      logger.error('Error calculating TP prices:', error);
      throw error;
    }
  }

  static calculateSLPrice(entryPrice, ignoreBoxLower, ignoreBoxUpper, side, indicatorType = null, candles = null, indicatorParams = {}) {
    try {
      const IndicatorService = require('../services/indicatorService');
      
      if (side === 'long') {
        // For long positions, SL is typically below entry
        if (ignoreBoxLower > 0) {
          logger.info(`SL using ignoreBoxLower: $${ignoreBoxLower}`);
          return ignoreBoxLower;
        }
        
        // Try swing detection if indicator and candles provided
        if (indicatorType && candles && candles.length >= 50) {
          const swingResult = IndicatorService.getSwingPrice(indicatorType, candles, side, indicatorParams);
          if (swingResult.price && swingResult.price < entryPrice) {
            logger.info(`SL using ${indicatorType} swing price: $${swingResult.price}`);
            return swingResult.price;
          } else if (swingResult.error) {
            logger.warn(`Swing detection failed for ${indicatorType}: ${swingResult.error}`);
          }
        }
        
        // Default to 1% below entry if no ignore box or swing detection
        const defaultSL = entryPrice * 0.95;
        logger.info(`SL using default (1% below): $${defaultSL}`);
        return defaultSL;
      } else if (side === 'short') {
        // For short positions, SL is typically above entry
        if (ignoreBoxUpper > 0) {
          logger.info(`SL using ignoreBoxUpper: $${ignoreBoxUpper}`);
          return ignoreBoxUpper;
        }
        
        // Try swing detection if indicator and candles provided
        if (indicatorType && candles && candles.length >= 50) {
          const swingResult = IndicatorService.getSwingPrice(indicatorType, candles, side, indicatorParams);
          if (swingResult.price && swingResult.price > entryPrice) {
            logger.info(`SL using ${indicatorType} swing price: $${swingResult.price}`);
            return swingResult.price;
          } else if (swingResult.error) {
            logger.warn(`Swing detection failed for ${indicatorType}: ${swingResult.error}`);
          }
        }
        
        // Default to 1% above entry if no ignore box or swing detection
        const defaultSL = entryPrice * 1.05;
        logger.info(`SL using default (1% above): $${defaultSL}`);
        return defaultSL;
      }
      
      throw new Error(`Invalid side for SL calculation: ${side}`);
    } catch (error) {
      logger.error('Error calculating SL price:', error);
      throw error;
    }
  }

  static calculateBreakEvenTriggerPrice(entryPrice, tp1Price) {
    // BE trigger is typically when price moves halfway to TP1
    const difference = Math.abs(tp1Price - entryPrice);
    if (entryPrice < tp1Price) {
      // Long position
      return entryPrice + (difference * 0.5);
    } else {
      // Short position
      return entryPrice - (difference * 0.5);
    }
  }

  static parseTpPricesJson(tpPricesJson) {
    try {
      if (!tpPricesJson) {
        return [1, 2, 3, 4]; // Default RR ratios
      }
      
      const parsed = JSON.parse(tpPricesJson);
      if (!Array.isArray(parsed)) {
        throw new Error('TP prices must be an array');
      }
      
      // Validate RR ratios are positive numbers
      if (!parsed.every(ratio => typeof ratio === 'number' && ratio > 0)) {
        throw new Error('All RR ratios must be positive numbers');
      }
      
      return parsed;
    } catch (error) {
      logger.error('Error parsing TP prices JSON:', error);
      return [1, 2, 3, 4]; // Default on error
    }
  }

  static calculatePnl(entryPrice, exitPrice, quantity, side, fees = 0.001) {
    try {
      const tradeValue = entryPrice * quantity;
      const exitValue = exitPrice * quantity;
      
      let pnl;
      if (side === 'long') {
        pnl = exitValue - tradeValue;
      } else if (side === 'short') {
        pnl = tradeValue - exitValue;
      } else {
        throw new Error(`Invalid side for P&L calculation: ${side}`);
      }
      
      // Apply fees (0.1% each way = 0.2% total)
      const totalFees = (tradeValue + exitValue) * fees;
      const netPnl = pnl - totalFees;
      const pnlPercent = (netPnl / tradeValue) * 100;
      
      return {
        grossPnl: pnl,
        fees: totalFees,
        netPnl: netPnl,
        pnlPercent: pnlPercent
      };
    } catch (error) {
      logger.error('Error calculating P&L:', error);
      throw error;
    }
  }

  static getDecimalPlaces(value) {
    const valueString = value.toString();
    if (valueString.includes('e-')) {
      const [, exponent] = valueString.split('e-');
      return parseInt(exponent, 10);
    }
    if (!valueString.includes('.')) {
      return 0;
    }
    return valueString.split('.')[1].length;
  }

  static normalizeValue(value, decimals) {
    return parseFloat(value.toFixed(decimals));
  }

  static roundToTickSize(price, tickSize = 0.01) {
    if (!this.isValidPrice(price) || !this.isValidPrice(tickSize)) {
      throw new Error('Invalid price or tick size for rounding');
    }
    
    const precision = this.getDecimalPlaces(tickSize);
    const multiplier = 1 / tickSize;
    const rounded = Math.round(price * multiplier) / multiplier;
    return this.normalizeValue(rounded, precision);
  }

  static roundQuantity(quantity, stepSize = 0.001) {

    const precision = this.getDecimalPlaces(stepSize);
    const multiplier = 1 / stepSize;
    const rounded = Math.floor(quantity * multiplier) / multiplier;
    return this.normalizeValue(rounded, precision);
  }

  static splitQuantity(quantity, parts, stepSize = 0.001) {
    try{
      if (parts <= 0) {
        return [];
      }

      const roundedQuantity = this.roundQuantity(quantity, stepSize);
      const baseQty = this.roundQuantity(roundedQuantity / parts, stepSize);
      const quantities = Array(parts).fill(baseQty);
      let remaining = this.roundQuantity(roundedQuantity - baseQty * parts, stepSize);
      for (let i = 0; i < parts && remaining >= stepSize; i++) {
        quantities[i] = this.roundQuantity(quantities[i] + stepSize, stepSize);
        remaining = this.roundQuantity(remaining - stepSize, stepSize);
      }

      return quantities;
    }catch(e){
      console.error('Error splitting quantity:', e);  
      throw e;
    }

  }

  static isValidPrice(price) {
    return typeof price === 'number' && price > 0 && !isNaN(price) && isFinite(price);
  }
}

module.exports = PriceUtils;