export type Side = 'long' | 'short';
export type SetupStatus = 'pending' | 'triggered' | 'active' | 'closed' | 'cancelled';
export type EntryIndicatorType = 'superTrend' | 'macd' | 'ema';
export type ScreenerIndicatorType = 'supertrend' | 'macd' | 'ema';
export type Timeframe = 'm1' | 'm5' | 'm15' | 'm30' | 'h1' | 'h2' | 'h4' | 'd1';
export type RiskType = 'percent' | 'fixed';
export type OrderType = 'entry' | 'tp1' | 'tp2' | 'tp3' | 'tp4' | 'sl';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  telegram_chat_id: string | null;
  created_at: string;
}

export interface ExchangeAccount {
  id: number;
  user_id: number;
  exchange: string;  // bybit, hyperliquid, etc.
  label: string;
  api_key_enc: string;
  api_secret_enc: string;
  is_testnet: number;
  created_at: string;
}

export interface TradingSetup {
  id: number;
  user_id: number;
  exchange_account_id: number;
  symbol: string;
  side: Side;
  status: SetupStatus;
  memo: string | null;
  activation_price: number;
  ignore_box_upper: number;
  ignore_box_lower: number;
  entry_indicator_type: EntryIndicatorType;
  entry_indicator_tf: Timeframe;
  risk_type: RiskType;
  risk_value: number;
  sl_price: number;
  tp_prices: string;
  be_enabled: number;
  be_trigger_price: number;
  entry_price: number | null;
  entry_qty: number | null;
  profit: number;
  activated_at: string | null;
  exit_indicator_type: EntryIndicatorType | null;
  exit_indicator_tf: Timeframe | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  setup_id: number;
  order_type: OrderType;
  side: OrderSide;
  price: number;
  qty: number;
  status: OrderStatus;
  exchange_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetupFormData {
  exchange_account_id: number;
  symbol: string;
  side: Side;
  memo?: string;
  activation_price: number;
  ignore_box_upper: number;
  ignore_box_lower: number;
  entry_indicator_type: EntryIndicatorType;
  entry_indicator_tf: Timeframe;
  risk_type: RiskType;
  risk_value: number;
  sl_price: number;
  tp_prices: number[];
  be_enabled: boolean;
  be_trigger_price?: number;
  exit_indicator_type?: EntryIndicatorType;
  exit_indicator_tf?: Timeframe;
}

export interface ScreenerItem {
  id: number;
  user_id: number;
  exchange_account_id: number;
  exchange: string;
  exchange_account_label?: string;
  symbol: string;
  timeframe: string;
  indicator_type: 'supertrend' | 'macd' | 'ema';
  indicator_params?: Record<string, unknown>;
  enabled: number;
  last_signal: 'bullish_crossover' | 'bearish_crossover' | null;
  last_checked_at: string | null;
  last_alerted_at: string | null;
  created_at: string;
  updated_at: string;
  is_testnet?: number;
}

export interface ScreenerFormData {
  exchange_account_id: number;
  symbol: string;
  timeframe: Timeframe;
  indicator_type: ScreenerIndicatorType;
  indicator_params?: Record<string, unknown>;
  enabled?: boolean;
}

export interface SupplyDemandIndicatorParams {
  bodyTolerance?: number;
  minWickOverlapRate?: number;
  checkCandle0Dir?: boolean;
}

export interface SupplyDemandItem {
  id: number;
  user_id: number;
  exchange_account_id: number;
  exchange: string;
  exchange_account_label?: string;
  symbol: string;
  timeframe: string;
  indicator_type: 'supply_demand';
  indicator_params?: SupplyDemandIndicatorParams;
  enabled: number;
  last_signal: 'supply' | 'demand' | null;
  last_zone_price: number | null;
  last_zone_top: number | null;
  last_zone_bottom: number | null;
  last_zone_timeframe: string | null;
  last_checked_at: string | null;
  last_alerted_at: string | null;
  created_at: string;
  updated_at: string;
  is_testnet?: number;
}

export interface SupplyDemandFormData {
  exchange_account_id: number;
  symbol: string;
  timeframe: Timeframe;
  indicator_params?: SupplyDemandIndicatorParams;
  enabled?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}