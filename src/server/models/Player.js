const { createBoard, getSpectrum } = require('../../shared/tetris.js');

class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.board = createBoard();
    this.piece = null;
    this.alive = true;
    this.score = 0;
    this.lines = 0;
    this.sequenceIndex = 0;
    this.lastFallAt = 0;
  }

  reset() {
    this.board = createBoard();
    this.piece = null;
    this.alive = true;
    this.score = 0;
    this.lines = 0;
    this.sequenceIndex = 0;
    this.lastFallAt = 0;
  }

  get spectrum() {
    return getSpectrum(this.board);
  }
}

module.exports = Player;
