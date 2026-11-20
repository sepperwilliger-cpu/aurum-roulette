/**
 * Ein einziger Node-Prozess: Next.js (Frontend) + Socket.IO (Echtzeit) auf demselben Port.
 * Dadurch genügt für Freunde EIN Link (lokal, im LAN oder über einen Tunnel).
 *
 *   npm run dev            → Entwicklungsmodus
 *   npm run build && npm start → Produktionsmodus
 */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import next from 'next';
import { Server } from 'socket.io';
import { Database } from './db';
import { attachGame } from './socket';
import { parseAvatarDataUrl } from './avatar';
import { connectReplica, type Replica } from './replica';

const prod = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');

async function main() {
  const app = next({ dev: !prod, hostname: 'localhost', port });
  const handle = app.getRequestHandler();
  await app.prepare();

  // Mit TURSO_DATABASE_URL (Online-Hosting): Turso ist der dauerhafte Speicher, lokal nur ein schneller
  // Arbeitsspeicher. Ohne (eigener PC): normale SQLite-Datei im Ordner data/.
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const db = new Database(tursoUrl ? ':memory:' : path.join(dataDir, 'aurum.db'));
  let replica: Replica | null = null;
  if (tursoUrl) {
    // Häufige Kopierfehler entschärfen: Leerzeichen, Zeilenumbrüche, Anführungszeichen
    const clean = (v?: string) => v?.replace(/\s+/g, '').replace(/^["']+|["']+$/g, '');
    replica = await connectReplica(clean(tursoUrl)!, clean(process.env.TURSO_AUTH_TOKEN), db);
    db.setWriteListener((sql, args) => replica!.push(sql, args));
  }
  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    // Profilbilder: /avatar/<spieler-id>?v=<version>
    const av = /^\/avatar\/([0-9a-f-]{36})(?:\?.*)?$/.exec(req.url ?? '');
    if (av && req.method === 'GET') {
      const img = db.avatarImage(av[1]);
      const parsed = img ? parseAvatarDataUrl(img) : null;
      if (!parsed) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': parsed.mime,
        'content-length': parsed.bytes.length,
        // URL enthält die Version → darf lange gecacht werden
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
      });
      res.end(parsed.bytes);
      return;
    }
    handle(req, res);
  });

  const io = new Server(server, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    // Next.js (HMR im Dev-Modus) nutzt ebenfalls WebSocket-Upgrades – diese nicht abwürgen.
    destroyUpgrade: false,
  });
  const manager = attachGame(io, db);

  server.listen(port, '0.0.0.0', () => {
    const lan = Object.values(networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => `http://${i!.address}:${port}`);
    console.log(`\n  🎰  AURUM Roulette läuft (${prod ? 'Produktion' : 'Entwicklung'})`);
    console.log(`  ➜  Lokal:   http://localhost:${port}`);
    if (!process.env.RENDER) for (const url of lan) console.log(`  ➜  Im WLAN: ${url}`);
    console.log(`  ➜  Daten:   ${tursoUrl ? 'Turso (online, dauerhaft)' : dataDir}\n`);
  });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\nFahre herunter …');
    setTimeout(() => process.exit(0), 10_000).unref(); // Notbremse
    manager.dispose();
    io.close();
    server.close();
    try {
      await replica?.close(); // offene Änderungen noch zu Turso schicken
    } catch (e) {
      console.error('Turso-Abschluss fehlgeschlagen:', e);
    }
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
