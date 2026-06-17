#!/usr/bin/env node

const { getDatabaseManager } = require('./src/engine/db');

async function testDatabaseMethods() {
  console.log('Testing database methods...');
  
  const db = getDatabaseManager();
  
  try {
    await db.connect();
    console.log('Connected to database');
    
    // Test getSetupsByStatus
    console.log('\nTesting getSetupsByStatus...');
    const setupsByStatus = await db.getSetupsByStatus(['pending', 'triggered', 'active']);
    console.log(`Found ${setupsByStatus.length} setups by status`);
    
    // Test getPendingSetupsBySymbolTimeframe
    console.log('\nTesting getPendingSetupsBySymbolTimeframe...');
    const pendingSymbols = await db.getPendingSetupsBySymbolTimeframe();
    console.log(`Found ${pendingSymbols.length} pending symbol/timeframe pairs`);
    
    // Test getTriggeredSetupsBySymbolTimeframe  
    console.log('\nTesting getTriggeredSetupsBySymbolTimeframe...');
    const triggeredSymbols = await db.getTriggeredSetupsBySymbolTimeframe();
    console.log(`Found ${triggeredSymbols.length} triggered symbol/timeframe pairs`);
    
    // Test getActiveSetups
    console.log('\nTesting getActiveSetups...');
    const activeSetups = await db.getActiveSetups();
    console.log(`Found ${activeSetups.length} active setups`);
    
    // Test getPendingSetupsForSymbolTimeframe
    if (pendingSymbols.length > 0) {
      const firstSymbol = pendingSymbols[0];
      console.log(`\nTesting getPendingSetupsForSymbolTimeframe for ${firstSymbol.symbol} ${firstSymbol.timeframe}...`);
      const specificPending = await db.getPendingSetupsForSymbolTimeframe(firstSymbol.symbol, firstSymbol.timeframe);
      console.log(`Found ${specificPending.length} pending setups for specific symbol/timeframe`);
    }
    
    // Test getTriggeredSetupsForSymbolTimeframe
    if (triggeredSymbols.length > 0) {
      const firstSymbol = triggeredSymbols[0];
      console.log(`\nTesting getTriggeredSetupsForSymbolTimeframe for ${firstSymbol.symbol} ${firstSymbol.timeframe}...`);
      const specificTriggered = await db.getTriggeredSetupsForSymbolTimeframe(firstSymbol.symbol, firstSymbol.timeframe);
      console.log(`Found ${specificTriggered.length} triggered setups for specific symbol/timeframe`);
    }
    
    console.log('\nAll database methods tested successfully!');
    
  } catch (error) {
    console.error('Error testing database methods:', error);
    console.error(error.stack);
  } finally {
    await db.disconnect();
    console.log('Disconnected from database');
  }
}

testDatabaseMethods();