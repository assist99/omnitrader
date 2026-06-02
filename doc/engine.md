Please check @doc/req.md  , @doc/architecture.md for require and architecture

Let create Engine with nodejs under @src\engine folder.
Please check guide from @engine.mq

Engine Logic
- Trigger engine with 15-min scheduling that triggers at exact 15-min time 
   It must trigger actually 00:00, 00:15,00:30,00:45 , because of we query 15 min candles at this time from bybit.
- Query Trading from DB for pending, triggered, active status
- for pending, triggered
   check tf it is trigger time
   query candles of selected tf for entry in entry condition.
   check hit price for ignore box, or trigger price. trigger price check by direction of entry. if buy, last low of candle is lower that this trigger price. if sell vice verisa. if ignore box low is zero then we will ignore to check low, same in uppoer.  
   if pending and hit ignore box, set trading to cancelled and do next trading
   if pending and hit active price, set trading to triggered and do active process step. if active price is zero, we will set trade status to 'triggered', no check active price.
   if triggered, check indicator condition, if meet place order and set status activated, update db for orders, be price  and do next trading.
- for activated , 
  check position is live by symbol, is not, set closed and do next trading
  
  check tf it is trigger time of exit condition
  query candles of selected tf in exit condition. 
  if meet exit condition, close position and cancel every positions.

  check tf it is trigger time of entry condition
  query candles of selected tf in exit condition. 
  check monitor condition for BE and adjust stoploss order to be
  check tp order/sl orders and update order's status
- when query candles, we must use only closed bars, so remove last candle always.
- if status updated send message to telegram by bot id and user id, 
  message must well formatted production ready.