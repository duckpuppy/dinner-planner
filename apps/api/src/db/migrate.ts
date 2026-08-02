import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from './index.js';

console.log('Running migrations...');

// SQLite only allows toggling `foreign_keys` outside of a transaction. Several
// migrations (e.g. 0026, 0028) rebuild a table to tighten a column to NOT
// NULL and include an in-file `PRAGMA foreign_keys=OFF/ON` toggle around the
// rebuild -- but drizzle's migrate() wraps each migration file's statements
// in its own transaction, which makes that in-file pragma toggle a no-op
// (SQLite silently ignores foreign_keys changes requested inside a
// transaction). Without disabling it here, at the connection level, before
// migrate() opens any transaction, DROP TABLE on a rebuilt parent table
// (users/dishes/restaurants/...) fails with "FOREIGN KEY constraint failed"
// on any database that actually has dependent rows (i.e. any real install).
sqlite.pragma('foreign_keys = OFF');
migrate(db, { migrationsFolder: './drizzle' });
sqlite.pragma('foreign_keys = ON');

console.log('Migrations complete!');

process.exit(0);
