import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import {
  MAX_PLAYERS,
  applyAction,
  createRoom,
  getPrivateView,
  joinRoom,
  startRound
} from '../shared/gameEngine.js';

const PORT = Number(process.env.PORT || 3001);
const rooms = new Map();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

const app = express();
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'cabo-online-server' });
});
app.use(express.static(distDir));
app.use((_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*'
  }
});

io.on('connection', socket => {
  socket.on('room:create', ({ name, playerLimit = 3 } = {}, reply) => {
    try {
      const roomId = createRoomCode();
      const room = createRoom({
        roomId,
        hostId: socket.id,
        hostName: name || '房主',
        playerLimit
      });
      rooms.set(roomId, room);
      socket.join(roomId);
      emitRoom(room);
      reply?.({ ok: true, roomId, playerId: socket.id });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on('room:join', ({ roomId, name } = {}, reply) => {
    try {
      const room = requireRoom(roomId);
      joinRoom(room, { playerId: socket.id, name: name || '玩家' });
      socket.join(room.id);
      emitRoom(room);
      reply?.({ ok: true, roomId: room.id, playerId: socket.id });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on('room:add-ai', ({ roomId } = {}, reply) => {
    try {
      const room = requireRoom(roomId);
      if (room.players.length >= Math.min(MAX_PLAYERS, room.playerLimit)) {
        throw new Error('ROOM_FULL');
      }
      const aiNumber = room.players.filter(player => player.isAI).length + 1;
      joinRoom(room, {
        playerId: `ai-${Date.now()}-${aiNumber}`,
        name: `AI 玩家 ${aiNumber}`,
        isAI: true
      });
      emitRoom(room);
      reply?.({ ok: true });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on('room:start', ({ roomId } = {}, reply) => {
    try {
      const room = requireRoom(roomId);
      ensureHost(room, socket.id);
      startRound(room);
      emitRoom(room);
      reply?.({ ok: true });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on('game:action', ({ roomId, action } = {}, reply) => {
    try {
      const room = requireRoom(roomId);
      applyAction(room, socket.id, action);
      emitRoom(room);
      reply?.({ ok: true });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on('disconnect', () => {
    rooms.forEach(room => {
      const player = room.players.find(nextPlayer => nextPlayer.id === socket.id);
      if (!player) return;
      player.connected = false;
      emitRoom(room);
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`CABO online server listening on http://127.0.0.1:${PORT}`);
});

const emitRoom = room => {
  room.players.forEach(player => {
    if (player.isAI) return;
    io.to(player.id).emit('room:update', getPrivateView(room, player.id));
  });
};

const requireRoom = roomId => {
  const room = rooms.get(String(roomId || '').toUpperCase());
  if (!room) throw new Error('ROOM_NOT_FOUND');
  return room;
};

const ensureHost = (room, playerId) => {
  if (room.hostId !== playerId) throw new Error('ONLY_HOST_CAN_START');
};

const createRoomCode = () => {
  let code = '';
  do {
    code = Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
};
