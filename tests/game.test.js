import { describe, expect, it } from 'vitest';
const Player = require('../src/server/models/Player.js');
const Piece = require('../src/server/models/Piece.js');
const { Game } = require('../src/server/models/Game.js');
const { createBoard } = require('../src/shared/tetris.js');

describe('server game models', () => {
  it('validates and resets player and piece state', () => {
    const player = new Player('p1', 'Ada');
    player.board[19][0] = 'T';
    player.score = 30;
    expect(player.spectrum[0]).toBe(1);
    player.reset();
    expect(player).toMatchObject({ score: 0, lines: 0, alive: true, sequenceIndex: 0, piece: null });
    expect(player.board).toEqual(createBoard());
    expect(new Piece('T', 2)).toMatchObject({ type: 'T', sequenceIndex: 2, x: 3, y: 0, rotation: 0 });
    expect(() => new Piece('X', 0)).toThrow('Unknown piece type');
  });

  it('enforces room membership rules and reassigns the host', () => {
    const game = new Game('room');
    expect(() => game.addPlayer('p1', ' Ada ')).not.toThrow();
    expect(game.players.get('p1').name).toBe('Ada');
    expect(game.addPlayer('p1', 'Ada')).toBe(game.players.get('p1'));
    expect(() => game.addPlayer('p2', 'ada')).toThrow('already being used');
    game.addPlayer('p2', 'Lin');
    expect(() => game.start('unknown')).toThrow('valid game mode');
    expect(game.removePlayer('p1')).toBe(true);
    expect(game.hostId).toBe('p2');
    expect(game.removePlayer('missing')).toBe(false);
  });

  it('shares a seven-bag piece sequence and supports game inputs', () => {
    let time = 1000;
    const game = new Game('room', { random: () => 0, now: () => time });
    game.addPlayer('p1', 'Ada');
    game.addPlayer('p2', 'Lin');
    game.start('fast');
    const [first, second] = [...game.players.values()];
    expect(first.piece.type).toBe(second.piece.type);
    expect(first.piece).toMatchObject({ x: 3, y: 0 });
    expect(new Set(Array.from({ length: 7 }, (_, index) => game.nextType(index))).size).toBe(7);
    expect(game.applyInput('p1', 'left')).toBe(true);
    expect(game.applyInput('p1', 'right')).toBe(true);
    expect(game.applyInput('p1', 'rotate')).toBe(true);
    expect(game.applyInput('p1', 'down')).toBe(true);
    expect(first.score).toBe(1);
    expect(game.applyInput('p1', 'not-a-move')).toBe(false);
    expect(game.applyInput('unknown', 'left')).toBe(false);
    expect(game.tick(1179)).toBe(false);
    time = 1180;
    expect(game.tick(time)).toBe(true);
    expect(game.applyInput('p1', 'hardDrop')).toBe(true);
    expect(first.score).toBeGreaterThan(1);
    expect(first.piece.sequenceIndex).toBe(1);
  });

  it('clears multiple lines, awards score, and sends opponent garbage', () => {
    const game = new Game('room', { random: () => 0 });
    game.addPlayer('p1', 'Ada');
    game.addPlayer('p2', 'Lin');
    game.start();
    const player = game.players.get('p1');
    const opponent = game.players.get('p2');
    player.board[18].fill('J');
    player.board[19].fill('J');
    player.board[18][4] = null;
    player.board[18][5] = null;
    player.board[19][4] = null;
    player.board[19][5] = null;
    player.piece = new Piece('O', player.sequenceIndex);
    player.piece.x = 4;
    player.piece.y = 18;
    game.lock(player);
    expect(player.lines).toBe(2);
    expect(player.score).toBe(300);
    expect(opponent.board[19].filter(cell => cell === 'garbage')).toHaveLength(9);
    expect(player.piece).not.toBeNull();
    expect(game.snapshot('p1')).toMatchObject({ room: 'room', viewerId: 'p1', status: 'playing', round: 1 });
  });

  it('locks a piece on the simulation frame after it lands', () => {
    let time = 1000;
    const game = new Game('room', { now: () => time });
    game.addPlayer('p1', 'Ada');
    game.start('fast');
    const player = game.players.get('p1');
    player.piece = new Piece('O', player.sequenceIndex);
    player.piece.y = 17;
    player.lastFallAt = time;
    expect(game.tick(time + 180)).toBe(true);
    expect(player.piece.y).toBe(18);
    time += 220;
    expect(game.tick(time)).toBe(true);
    expect(player.sequenceIndex).toBe(2);
  });

  it('handles top-outs, garbage overflow, solo endings, and winner detection', () => {
    const solo = new Game('solo');
    solo.addPlayer('p1', 'Ada');
    solo.start();
    expect(solo.checkGameOver()).toBe(false);
    expect(solo.status).toBe('playing');
    const player = solo.players.get('p1');
    expect(solo.tick(player.lastFallAt + 650)).toBe(true);
    expect(solo.status).toBe('playing');
    player.piece.y = -1;
    solo.lock(player);
    expect(player.alive).toBe(false);
    expect(solo.checkGameOver()).toBe(true);
    expect(solo.snapshot().winnerId).toBeNull();
    expect(solo.checkGameOver()).toBe(false);

    const game = new Game('duo', { random: () => 0 });
    game.addPlayer('p1', 'Ada');
    game.addPlayer('p2', 'Lin');
    game.start();
    const attacker = game.players.get('p1');
    const defender = game.players.get('p2');
    defender.board[0][0] = 'T';
    game.sendGarbage('p1', 1);
    expect(defender.alive).toBe(false);
    expect(game.checkGameOver()).toBe(true);
    expect(game.snapshot().winnerId).toBe('p1');
  });

  it('rejects empty starts, enforces room capacity, and resets completed rounds', () => {
    const game = new Game('room');
    expect(() => game.start()).toThrow('At least one player');
    for (let index = 0; index < 8; index += 1) game.addPlayer(`p${index}`, `Player ${index}`);
    expect(() => game.addPlayer('p8', 'Player 8')).toThrow('room is full');
    game.start();
    game.players.forEach((player, id) => {
      player.alive = id === 'p0';
    });
    game.checkGameOver();
    expect(game.status).toBe('finished');
    expect(game.start('invisible').round).toBe(2);
    expect(game.status).toBe('playing');
    expect([...game.players.values()].every(player => player.alive && player.score === 0)).toBe(true);
  });
});
