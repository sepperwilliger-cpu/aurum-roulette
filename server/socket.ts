/** Socket.IO-Ereignisse: Authentifizierung, Räume, Einsätze, Chat. */
import type { Server, Socket } from 'socket.io';
import type { Ack, Role } from '../src/lib/protocol';
import type { Database } from './db';
import { RoomManager, sanitizeAvatar, sanitizeColor, sanitizeName } from './manager';
import { GameError, type Room } from './room';
import { validateAvatarInput } from './avatar';

interface SocketData {
  playerId?: string;
  roomCode?: string;
  rate: { windowStart: number; count: number; lastChat: number };
}

type GameSocket = Socket<Record<string, (...args: any[]) => void>, Record<string, (...args: any[]) => void>, Record<string, never>, SocketData>;

export function attachGame(io: Server, db: Database) {
  const pendingEmit = new Set<string>();
  const manager = new RoomManager(db, {
    onChange(room) {
      // Mehrere Änderungen im selben Tick zu einem Broadcast zusammenfassen.
      if (pendingEmit.has(room.code)) return;
      pendingEmit.add(room.code);
      setImmediate(() => {
        pendingEmit.delete(room.code);
        io.to(room.code).emit('room:state', room.snapshot());
      });
    },
    onChat(room, msg) {
      io.to(room.code).emit('chat:message', msg);
    },
  });

  io.use((socket, next) => {
    const s = socket as GameSocket;
    s.data.rate = { windowStart: Date.now(), count: 0, lastChat: 0 };
    const auth = socket.handshake.auth ?? {};
    const player = db.authenticate(auth.playerId, auth.token);
    if (player) s.data.playerId = player.id;
    next();
  });

  io.on('connection', (raw) => {
    const socket = raw as GameSocket;

    /** Wrapper: Rate-Limit, Fehlerbehandlung und einheitliche Antworten. */
    const on = <A extends unknown[]>(
      event: string,
      handler: (...args: [...A, Ack<any>]) => unknown,
      opts: { auth?: boolean } = { auth: true },
    ) => {
      socket.on(event, (...args: unknown[]) => {
        const last = args[args.length - 1];
        const ack: Ack<any> = typeof last === 'function' ? (last as Ack<any>) : () => {};
        const params = (typeof last === 'function' ? args.slice(0, -1) : args) as A;
        const rate = socket.data.rate;
        const now = Date.now();
        if (now - rate.windowStart > 1000) {
          rate.windowStart = now;
          rate.count = 0;
        }
        if (++rate.count > 25) return ack({ ok: false, error: 'Zu viele Aktionen – kurz warten.' });
        if (opts.auth !== false && !socket.data.playerId) return ack({ ok: false, error: 'Kein Profil – bitte neu anmelden.' });
        try {
          const res = handler(...params, ack);
          if (res !== undefined) ack({ ok: true, ...(res as object) });
        } catch (e) {
          if (e instanceof GameError || (e instanceof Error && e.message === 'Nicht genügend Guthaben')) {
            ack({ ok: false, error: e.message });
          } else {
            console.error(`[${event}]`, e);
            ack({ ok: false, error: 'Interner Fehler' });
          }
        }
      });
    };

    const currentRoom = (): Room => {
      const room = socket.data.roomCode ? manager.get(socket.data.roomCode) : null;
      if (!room) throw new GameError('Du bist in keinem Raum.');
      return room;
    };
    const pid = () => socket.data.playerId!;

    const leaveCurrent = (explicit: boolean) => {
      const code = socket.data.roomCode;
      if (!code) return;
      const room = manager.rooms.get(code);
      socket.leave(code);
      socket.data.roomCode = undefined;
      if (!room || !socket.data.playerId) return;
      if (explicit) room.leave(socket.data.playerId);
      else room.disconnect(socket.data.playerId, socket.id);
    };

    on('time:sync', () => ({ serverNow: Date.now() }), { auth: false });

    on('profile:get', () => ({ profile: socket.data.playerId ? db.ownProfile(socket.data.playerId) : null }), {
      auth: false,
    });

    type ProfileInput = { name: unknown; avatar: unknown; color: unknown; image?: unknown };

    on<[ProfileInput]>(
      'profile:create',
      (input) => {
        const name = sanitizeName(input?.name);
        const image = validateAvatarInput(input?.image); // vor dem Anlegen prüfen
        const { player, token } = db.createPlayer(name, sanitizeAvatar(input?.avatar), sanitizeColor(input?.color));
        if (image) db.setAvatarImage(player.id, image);
        socket.data.playerId = player.id;
        return { playerId: player.id, token, profile: db.ownProfile(player.id) };
      },
      { auth: false },
    );

    on<[ProfileInput]>('profile:update', (input) => {
      const name = sanitizeName(input?.name);
      const image = validateAvatarInput(input?.image);
      db.updateProfile(pid(), name, sanitizeAvatar(input?.avatar), sanitizeColor(input?.color));
      if (image !== undefined) db.setAvatarImage(pid(), image);
      for (const r of manager.roomsOf(pid())) io.to(r.code).emit('room:state', r.snapshot());
      return { profile: db.ownProfile(pid()) };
    });

    on<[{ code?: unknown } | undefined]>('room:create', (input) => {
      const room = manager.createRoom(pid(), input?.code);
      return { code: room.code };
    });

    on('rooms:mine', () => ({
      rooms: db.myRooms(pid()).map((r) => ({ ...r, online: manager.onlineCount(r.code), ...db.roomMembers(r.code) })),
    }));

    on<[{ code: unknown; spectator?: unknown }]>('room:join', (input) => {
      const room = manager.get(input?.code);
      if (!room) throw new GameError('Raum nicht gefunden. Code prüfen?');
      if (socket.data.roomCode && socket.data.roomCode !== room.code) leaveCurrent(false);
      const { role, notice } = room.join(pid(), socket.id, input?.spectator === true);
      socket.join(room.code);
      socket.data.roomCode = room.code;
      return { role, notice, code: room.code, chat: room.chat, state: room.snapshot() };
    });

    on('room:leave', () => {
      leaveCurrent(true);
      return {};
    });

    on<[{ spot: unknown; amount: unknown }]>('bet:place', (input) => {
      const amount = currentRoom().placeBet(pid(), input?.spot, input?.amount);
      return { amount };
    });
    on('bet:undo', () => (currentRoom().undo(pid()), {}));
    on('bet:clear', () => (currentRoom().clear(pid()), {}));
    on('bet:repeat', () => (currentRoom().repeat(pid()), {}));
    on('bet:double', () => (currentRoom().double(pid()), {}));

    on<[{ role: unknown }]>('role:switch', (input) => {
      const to: Role = input?.role === 'spectator' ? 'spectator' : 'player';
      currentRoom().switchRole(pid(), to);
      return {};
    });

    on('balance:reset', () => {
      manager.resetBalance(pid());
      for (const r of manager.roomsOf(pid())) io.to(r.code).emit('room:state', r.snapshot());
      return { profile: db.ownProfile(pid()) };
    });

    on<[{ text: unknown }]>('chat:send', (input) => {
      const now = Date.now();
      if (now - socket.data.rate.lastChat < 600) throw new GameError('Nicht so schnell 🙂');
      socket.data.rate.lastChat = now;
      currentRoom().addChat(pid(), input?.text);
      return {};
    });

    on('stats:get', () => ({ stats: db.stats(pid()), history: db.history(pid(), 50), profile: db.ownProfile(pid()) }));

    socket.on('disconnect', () => leaveCurrent(false));
  });

  return manager;
}
