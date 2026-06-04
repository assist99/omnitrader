import sqlite3
import sys

DB='db/trading.db'
try:
    conn=sqlite3.connect(DB)
    cur=conn.cursor()
    cols=[r[1] for r in cur.execute("PRAGMA table_info('trading_setups')").fetchall()]
    print('trading_setups cols:', cols)
    if 'reason' not in cols:
        print('Adding reason column...')
        cur.execute("ALTER TABLE trading_setups ADD COLUMN reason TEXT")
        cur.execute("UPDATE trading_setups SET reason = '' WHERE reason IS NULL")
        conn.commit()
        print('Added reason and backfilled')
    else:
        print('reason column already present')
except Exception as e:
    print('ERROR', e)
    sys.exit(1)
finally:
    try:
        conn.close()
    except:
        pass
