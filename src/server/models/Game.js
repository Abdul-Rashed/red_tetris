const Player = require('./Player.js');
const Piece = require('./Piece.js');
const {
  PIECES,
  addGarbageLines,
  canPlace,
  clearLines,
  dropDistance,
  lockPiece,
  movePiece,
  rotatePiece,
  scoreForLines
} = require('../../shared/tetris.js');

const MODES = Object.freeze(['classic', 'fast', 'invisible']);
const PIECE_TYPES = Object.keys(PIECES);

class Game {
  constructor(room, { random = Math.random, now = Date.now } = {}) {
    this.room = room;
    this.random = random;
    this.now = now;
    this.players = new Map();
    this.hostId = null;
    this.status = 'lobby';
    this.mode = 'classic';
    this.winnerId = null;
    this.sequence = [];
    this.bag = [];
    this.round = 0;
    this.roundPlayerCount = 0;
  }

  addPlayer(id, name) {
    if (this.status === 'playing') throw new Error('This game is already in progress.');
    if (this.players.has(id)) return this.players.get(id);
    if (this.players.size >= 8) throw new Error('This room is full (8 players maximum).');
    const normalizedName = name.trim();
    if ([...this.players.values()].some(player => player.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error('That name is already being used in this room.');
    }
    const player = new Player(id, normalizedName);
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    return player;
  }

  removePlayer(id) {
    const removed = this.players.delete(id);
    if (!removed) return false;
    if (this.hostId === id) this.hostId = this.players.keys().next().value || null;
    if (this.status === 'playing') this.checkGameOver();
    return true;
  }

  start(mode = this.mode) {
    if (!MODES.includes(mode)) throw new Error('Choose a valid game mode.');
    if (this.players.size === 0) throw new Error('At least one player must join before starting.');
    this.mode = mode;
    this.status = 'playing';
    this.winnerId = null;
    this.sequence = [];
    this.bag = [];
    this.round += 1;
    this.roundPlayerCount = this.players.size;
    const startedAt = this.now();
    this.players.forEach(player => {
      player.reset();
      player.lastFallAt = startedAt;
      this.spawn(player, startedAt);
    });
    return this.snapshot();
  }

  nextType(index) {
    while (this.sequence.length <= index) {
      if (this.bag.length === 0) {
        this.bag = PIECE_TYPES.slice();
        for (let i = this.bag.length - 1; i > 0; i -= 1) {
          const j = Math.floor(this.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.sequence.push(this.bag.pop());
    }
    return this.sequence[index];
  }

  spawn(player, at = this.now()) {
    const piece = new Piece(this.nextType(player.sequenceIndex), player.sequenceIndex);
    player.sequenceIndex += 1;
    player.piece = piece;
    player.lastFallAt = at;
    if (!canPlace(player.board, piece)) {
      player.alive = false;
      player.piece = null;
    }
  }

  applyInput(id, input) {
    const player = this.players.get(id);
    if (this.status !== 'playing' || !player || !player.alive || !player.piece) return false;
    if (input === 'left') player.piece = movePiece(player.board, player.piece, -1, 0);
    else if (input === 'right') player.piece = movePiece(player.board, player.piece, 1, 0);
    else if (input === 'down') {
      const moved = movePiece(player.board, player.piece, 0, 1);
      if (moved !== player.piece) {
        player.piece = moved;
        player.score += 1;
      }
    } else if (input === 'rotate') player.piece = rotatePiece(player.board, player.piece);
    else if (input === 'hardDrop') {
      const distance = dropDistance(player.board, player.piece);
      player.piece = { ...player.piece, y: player.piece.y + distance };
      player.score += distance * 2;
      this.lock(player);
    } else return false;
    return true;
  }

  tick(at = this.now()) {
    if (this.status !== 'playing') return false;
    const gravity = this.mode === 'fast' ? 180 : 650;
    let changed = false;
    this.players.forEach(player => {
      if (!player.alive || !player.piece) return;
      if (!canPlace(player.board, { ...player.piece, y: player.piece.y + 1 })) {
        this.lock(player);
        changed = true;
        return;
      }
      if (at - player.lastFallAt < gravity) return;
      player.lastFallAt = at;
      player.piece = movePiece(player.board, player.piece, 0, 1);
      changed = true;
    });
    if (this.checkGameOver()) changed = true;
    return changed;
  }

  lock(player) {
    const locked = lockPiece(player.board, player.piece);
    player.board = locked.board;
    player.piece = null;
    if (locked.topOut) {
      player.alive = false;
      return;
    }
    const result = clearLines(player.board);
    player.board = result.board;
    if (result.linesCleared > 0) {
      player.lines += result.linesCleared;
      player.score += scoreForLines(result.linesCleared);
      this.sendGarbage(player.id, result.linesCleared - 1);
    }
    if (player.alive) this.spawn(player);
  }

  sendGarbage(fromId, amount) {
    if (amount <= 0) return;
    this.players.forEach(player => {
      if (player.id === fromId || !player.alive) return;
      const holes = Array.from({ length: amount }, () => Math.floor(this.random() * 10));
      const result = addGarbageLines(player.board, holes);
      player.board = result.board;
      if (result.overflow) {
        player.alive = false;
        player.piece = null;
      } else if (player.piece && !canPlace(player.board, player.piece)) {
        player.alive = false;
        player.piece = null;
      }
    });
  }

  checkGameOver() {
    if (this.status !== 'playing') return false;
    const alive = [...this.players.values()].filter(player => player.alive);
    if (alive.length > 1 || (this.roundPlayerCount === 1 && alive.length === 1)) return false;
    this.status = 'finished';
    this.winnerId = alive[0]?.id || null;
    return true;
  }

  snapshot(viewerId = null) {
    return {
      room: this.room,
      status: this.status,
      hostId: this.hostId,
      viewerId,
      mode: this.mode,
      winnerId: this.winnerId,
      round: this.round,
      players: [...this.players.values()].map(player => ({
        id: player.id,
        name: player.name,
        alive: player.alive,
        score: player.score,
        lines: player.lines,
        board: player.board,
        spectrum: player.spectrum,
        piece: player.piece,
        sequenceIndex: player.sequenceIndex
      }))
    };
  }
}

module.exports = { Game, MODES };
