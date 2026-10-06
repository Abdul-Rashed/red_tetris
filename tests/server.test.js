// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
const { io: createClient } = require('socket.io-client');
const { createServer, normalizeName, normalizeRoom } = require('../src/server/index.js');

const waitForEvent = (socket, event) => new Promise(resolve => socket.once(event, resolve));
const join = (socket, room, name) => new Promise(resolve =>
  socket.emit('room:join', { room, name }, resolve)
);
const start = (socket, mode) => new Promise(resolve =>
  socket.emit('game:start', { mode }, resolve)
);

describe('HTTP and Socket.IO server', () => {
  let application;
  let clients;

  beforeEach(async () => {
    application = createServer({ port: 0, autoTick: false });
    const address = await application.listen();
    application.url = `http://127.0.0.1:${address.port}`;
    clients = [];
  });

  afterEach(async () => {
    clients.forEach(client => client.disconnect());
    await application.close();
  });

  const connect = async () => {
    const client = createClient(application.url, { transports: ['websocket'] });
    clients.push(client);
    await waitForEvent(client, 'connect');
    return client;
  };

  it('validates room and player names', () => {
    expect(normalizeRoom('Room_01')).toBe('room_01');
    expect(normalizeRoom('bad room')).toBeNull();
    expect(normalizeName('  Ada  ')).toBe('Ada');
    expect(normalizeName('')).toBeNull();
    expect(normalizeName('A'.repeat(19))).toBeNull();
  });

  it('serves the SPA and health endpoint', async () => {
    const health = await fetch(`${application.url}/health`);
    expect(await health.json()).toEqual({ status: 'ok' });
    const page = await fetch(`${application.url}/red-room/Ada`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root"></div>');
  });

  it('joins rooms, enforces host control and locks out late players', async () => {
    const host = await connect();
    const guest = await connect();
    const late = await connect();
    const parallel = await connect();
    expect((await join(host, 'arcade', 'Ada')).ok).toBe(true);
    expect((await join(guest, 'arcade', 'Lin')).ok).toBe(true);
    expect((await join(parallel, 'other-room', 'Sol')).ok).toBe(true);
    expect(application.games.has('other-room')).toBe(true);
    expect((await start(guest, 'classic')).error).toContain('Only the host');
    expect((await start(host, 'invalid-mode')).error).toContain('valid game mode');
    const startResult = await start(host, 'fast');
    expect(startResult).toMatchObject({ ok: true, state: { status: 'playing', mode: 'fast' } });
    expect((await join(late, 'arcade', 'Sol')).error).toContain('already in progress');
    const rejected = await new Promise(resolve => host.emit('game:start', { mode: 'classic' }, resolve));
    expect(rejected.error).toContain('already in progress');
    const inputState = waitForEvent(guest, 'room:state');
    host.emit('player:input', 'hardDrop');
    expect((await inputState).players[0].sequenceIndex).toBe(2);
    expect(application.games.get('arcade').players.size).toBe(2);
  });

  it('reports invalid joins and promotes a new host on disconnect', async () => {
    const first = await connect();
    const second = await connect();
    expect((await join(first, 'bad room', 'Ada')).ok).toBe(false);
    const malformed = await new Promise(resolve => first.emit('room:join', null, resolve));
    expect(malformed.error).toContain('required');
    await join(first, 'room', 'Ada');
    await join(second, 'room', 'Lin');
    const invalidStart = await new Promise(resolve => first.emit('game:start', null, resolve));
    expect(invalidStart.error).toContain('valid game mode');
    await start(first, 'classic');
    const update = new Promise(resolve => {
      const onState = state => {
        if (state.hostId !== second.id) return;
        second.off('room:state', onState);
        resolve(state);
      };
      second.on('room:state', onState);
    });
    first.disconnect();
    const state = await update;
    expect(state.hostId).toBe(second.id);
    expect(state.status).toBe('finished');
    expect(state.winnerId).toBe(second.id);
  });
});
