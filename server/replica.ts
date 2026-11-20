/**
 * Dauerhafte Speicherung in Turso (gehostetes SQLite, kostenloser Plan).
 *
 * Prinzip "Write-behind":
 *  1. Beim Start werden alle Daten aus Turso in die lokale (In-Memory-)SQLite geladen.
 *  2. Das Spiel arbeitet wie gewohnt synchron und blitzschnell mit der lokalen Datenbank.
 *  3. Jede Änderung wird zusätzlich in eine Warteschlange gelegt und alle ~0,4 s gesammelt
 *     (in derselben Reihenfolge, als Transaktion) an Turso geschickt.
 * Fällt die Verbindung kurz aus, wird später erneut gesendet – nichts geht verloren,
 * solange der Server läuft. Beim Herunterfahren wird die Warteschlange zuerst geleert.
 */
import type { Client, InStatement } from '@libsql/client';
import { PLAYER_COLUMN_MIGRATIONS, SCHEMA, TABLES, type Database, type SqlArg } from './db';

export interface Replica {
  push(sql: string, args: SqlArg[]): void;
  flush(): Promise<void>;
  close(): Promise<void>;
  readonly pending: number;
}

async function createLibsqlClient(url: string, authToken?: string): Promise<Client> {
  // Für entfernte Datenbanken den reinen JS-Client nutzen (keine nativen Module nötig),
  // für lokale "file:"-Datenbanken (Tests) den Node-Client.
  const mod = url.startsWith('file:') ? await import('@libsql/client') : await import('@libsql/client/web');
  return mod.createClient({ url, authToken });
}

export async function connectReplica(
  url: string,
  authToken: string | undefined,
  db: Database,
  log: (msg: string) => void = console.log,
): Promise<Replica> {
  const client = await createLibsqlClient(url, authToken);

  // 1) Schema in Turso sicherstellen (inkl. später hinzugekommener Spalten)
  await client.executeMultiple(SCHEMA);
  const info = await client.execute('PRAGMA table_info(players)');
  const remoteCols = info.rows.map((r) => String(r.name));
  for (const [col, sql] of PLAYER_COLUMN_MIGRATIONS) if (!remoteCols.includes(col)) await client.execute(sql);

  // 2) Alle Daten in die lokale Datenbank laden
  let total = 0;
  db.db.exec('BEGIN');
  try {
    for (const table of TABLES) {
      const rs = await client.execute(`SELECT * FROM ${table}`);
      if (!rs.rows.length) continue;
      const cols = rs.columns;
      const insert = db.db.prepare(
        `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      );
      for (const row of rs.rows) {
        insert.run(...cols.map((c) => normalize(row[c])));
        total++;
      }
    }
    db.db.exec('COMMIT');
  } catch (e) {
    db.db.exec('ROLLBACK');
    throw e;
  }
  log(`  ➜  Turso:   ${total} Datensätze geladen – Daten werden dauerhaft gespeichert`);

  // 3) Warteschlange für neue Schreibbefehle
  let queue: InStatement[] = [];
  let timer: NodeJS.Timeout | null = null;
  let flushing: Promise<void> | null = null;
  let failures = 0;

  const schedule = (ms: number) => {
    if (!timer) timer = setTimeout(() => void flush(), ms);
  };

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (flushing) {
      await flushing;
      if (queue.length) return flush();
      return;
    }
    if (!queue.length) return;
    const batch = queue;
    queue = [];
    flushing = (async () => {
      try {
        await client.batch(batch, 'write');
        failures = 0;
      } catch (e) {
        // Später erneut versuchen, Reihenfolge beibehalten
        queue = batch.concat(queue);
        failures++;
        log(`  ⚠  Turso nicht erreichbar (${failures}. Versuch, ${queue.length} wartend): ${(e as Error).message}`);
        schedule(Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
      } finally {
        flushing = null;
      }
    })();
    await flushing;
  }

  return {
    push(sql, args) {
      queue.push({ sql, args });
      schedule(400);
    },
    flush,
    async close() {
      for (let i = 0; i < 5 && (queue.length || flushing); i++) await flush();
      client.close();
    },
    get pending() {
      return queue.length;
    },
  };
}

function normalize(v: unknown): SqlArg {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof ArrayBuffer) return Buffer.from(v).toString('utf8');
  return String(v);
}
