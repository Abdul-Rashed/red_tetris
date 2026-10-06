const { PIECES } = require('../../shared/tetris.js');

class Piece {
  constructor(type, sequenceIndex, x = 3, y = 0) {
    if (!PIECES[type]) throw new Error(`Unknown piece type: ${type}`);
    this.type = type;
    this.sequenceIndex = sequenceIndex;
    this.x = x;
    this.y = y;
    this.rotation = 0;
    this.matrix = PIECES[type].map(row => row.slice());
  }
}

module.exports = Piece;
