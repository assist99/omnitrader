import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { CREATE_TABLES_SQL, MIGRATIONS_SQL, MIGRATION_2_SQL, MIGRATION_3_SQL, MIGRATION_4_SQL } from './schema';

const projectRoot = path.resolve(process.cwd(), '..', '..');
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(projectRoot, process.env.DATABASE_PATH)
  : path.join(projectRoot, 'db', 'trading.db');

let db: sqlite3.Database | null = null;
let initializing: Promise<sqlite3.Database> | null = null;

function ensureDbDir(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getDb(): Promise<sqlite3.Database> {
  if (db) return Promise.resolve(db);
  if (initializing) return initializing;

  initializing = new Promise<sqlite3.Database>((resolve, reject) => {
    ensureDbDir();
    const instance = new sqlite3.Database(DB_PATH, (err) => {
      if (err) { reject(err); return; }

      instance.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;', (pragmaErr) => {
        if (pragmaErr) { reject(pragmaErr); return; }

        instance.exec(CREATE_TABLES_SQL, (execErr) => {
          if (execErr) { reject(execErr); return; }

          instance.exec(MIGRATIONS_SQL, (migErr) => {
            if (migErr) { reject(migErr); return; }

            instance.get('SELECT version FROM _migrations WHERE version = 2', (checkErr, row) => {
              if (checkErr) { reject(checkErr); return; }
              if (!row) {
                instance.exec(MIGRATION_2_SQL, (mig2Err) => {
                  if (mig2Err) { reject(mig2Err); return; }
                  instance.run('INSERT INTO _migrations (version) VALUES (2)', () => {});
                  runMigration3(instance, resolve, reject);
                });
              } else {
                runMigration3(instance, resolve, reject);
              }
            });

function runMigration3(instance: sqlite3.Database, resolve: (db: sqlite3.Database) => void, reject: (err: Error) => void) {
  instance.get('SELECT version FROM _migrations WHERE version = 3', (checkErr, row) => {
    if (checkErr) { reject(checkErr); return; }
    if (!row) {
      instance.exec(MIGRATION_3_SQL, (mig3Err) => {
        if (mig3Err) { reject(mig3Err); return; }
        instance.run('INSERT INTO _migrations (version) VALUES (3)', () => {});
        runMigration4(instance, resolve, reject);
      });
    } else {
      runMigration4(instance, resolve, reject);
    }
  });
}

function runMigration4(instance: sqlite3.Database, resolve: (db: sqlite3.Database) => void, reject: (err: Error) => void) {
  instance.get('SELECT version FROM _migrations WHERE version = 4', (checkErr, row) => {
    if (checkErr) { reject(checkErr); return; }
    if (!row) {
      instance.exec(MIGRATION_4_SQL, (mig4Err) => {
        if (mig4Err) { reject(mig4Err); return; }
        instance.run('INSERT INTO _migrations (version) VALUES (4)', () => {});
        db = instance;
        initializing = null;
        resolve(instance);
      });
    } else {
      db = instance;
      initializing = null;
      resolve(instance);
    }
  });
}
          });
        });
      });
    });
  });

  return initializing;
}

export function queryAll<T>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    const d = await getDb();
    d.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

export function queryOne<T>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise(async (resolve, reject) => {
    const d = await getDb();
    d.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

export function execute(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise(async (resolve, reject) => {
    const d = await getDb();
    d.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function closeDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) { resolve(); return; }
    db.close((err) => {
      if (err) reject(err);
      else {
        db = null;
        resolve();
      }
    });
  });
}