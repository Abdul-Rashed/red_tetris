const path = require('node:path');
const express = require('express');
const { createServer: createHttpServer } = require('node:http');
const { Server } = require('socket.io');
const { Game, MODES } = require('./models/Game.js');

const normalizeRoom = value =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value)
    ? value.toLowerCase()
    : null;

const normalizeName = value => {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 18 && /^[\p{L}\p{N} _-]+$/u.test(name)
    ? name
    : null;
};

const createServer = ({ port = Number(process.env.PORT) || 3000, autoTick = true } = {}) => {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer);
  const games = new Map();
  const publicDirectory = path.resolve(__dirname, '../../public');
  const indexFile = path.resolve(__dirname, '../../index.html');

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.use(express.static(publicDirectory));
  app.get(/.*/, (_request, response) => response.sendFile(indexFile));

  const broadcast = game => io.to(game.room).emit('room:state', game.snapshot());
  const acknowledge = (callback, result) => {
    if (typeof callback === 'function') callback(result);
  };

  io.on('connection', socket => {
    socket.on('room:join', (payload = {}, callback) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        acknowledge(callback, { ok: false, error: 'Room and player name are required.' });
        return;
      }
      const room = normalizeRoom(payload.room);
      const name = normalizeName(payload.name);
      if (!room || !name) {
        acknowledge(callback, { ok: false, error: 'Use a room name (1–32 letters, numbers, _ or -) and player name (1–18 characters).' });
        return;
      }

      let game = games.get(room);
      if (!game) {
        game = new Game(room);
        games.set(room, game);
      }
      try {
        game.addPlayer(socket.id, name);
      } catch (error) {
        acknowledge(callback, { ok: false, error: error.message });
        if (game.players.size === 0) games.delete(room);
        return;
      }
      socket.join(room);
      socket.data.room = room;
      acknowledge(callback, { ok: true, state: game.snapshot(socket.id) });
      broadcast(game);
    });

    socket.on('game:start', (payload = {}, callback) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        acknowledge(callback, { ok: false, error: 'Choose a valid game mode.' });
        return;
      }
      const game = games.get(socket.data.room);
      if (!game) {
        acknowledge(callback, { ok: false, error: 'Join a room before starting a game.' });
        return;
      }
      if (game.hostId !== socket.id) {
        acknowledge(callback, { ok: false, error: 'Only the host can start or restart this game.' });
        return;
      }
      if (game.status === 'playing') {
        acknowledge(callback, { ok: false, error: 'The game is already in progress.' });
        return;
      }
      const mode = payload.mode === undefined ? game.mode : payload.mode;
      try {
        game.start(mode);
      } catch (error) {
        acknowledge(callback, { ok: false, error: error.message });
        return;
      }
      acknowledge(callback, { ok: true, state: game.snapshot(socket.id) });
      broadcast(game);
    });

    socket.on('player:input', (input, callback) => {
      const game = games.get(socket.data.room);
      const changed = game?.applyInput(socket.id, input) || false;
      acknowledge(callback, { ok: changed });
      if (changed) {
        game.checkGameOver();
        broadcast(game);
      }
    });

    socket.on('disconnect', () => {
      const room = socket.data.room;
      const game = room && games.get(room);
      if (!game) return;
      game.removePlayer(socket.id);
      if (game.players.size === 0) games.delete(room);
      else broadcast(game);
    });
  });

  const timer = autoTick
    ? setInterval(() => {
      games.forEach(game => {
        if (game.tick()) broadcast(game);
      });
    }, 40)
    : null;
  timer?.unref();

  return {
    app,
    httpServer,
    io,
    games,
    listen: () => new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, () => {
        httpServer.removeListener('error', reject);
        resolve(httpServer.address());
      });
    }),
    close: async () => {
      if (timer) clearInterval(timer);
      await new Promise(resolve => io.close(resolve));
      if (httpServer.listening) {
        await new Promise((resolve, reject) =>
          httpServer.close(error => error ? reject(error) : resolve())
        );
      }
    }
  };
};

if (require.main === module) {
  const application = createServer();
  application.listen().then(address => {
    console.log(`Red Tetris server listening on http://localhost:${address.port}`);
  }).catch(error => {
    console.error('Unable to start Red Tetris:', error);
    process.exitCode = 1;
  });
}

module.exports = { createServer, normalizeName, normalizeRoom };
