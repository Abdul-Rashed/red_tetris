const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;

const PIECES = Object.freeze({
  I: Object.freeze([[1, 1, 1, 1]]),
  O: Object.freeze([[1, 1], [1, 1]]),
  T: Object.freeze([[0, 1, 0], [1, 1, 1]]),
  S: Object.freeze([[0, 1, 1], [1, 1, 0]]),
  Z: Object.freeze([[1, 1, 0], [0, 1, 1]]),
  J: Object.freeze([[1, 0, 0], [1, 1, 1]]),
  L: Object.freeze([[0, 0, 1], [1, 1, 1]])
});

const PIECE_COLORS = Object.freeze({
  I: '#57d8e8',
  O: '#f5cb56',
  T: '#b584fa',
  S: '#70dc91',
  Z: '#fa7181',
  J: '#709aff',
  L: '#ffa65c',
  garbage: '#777783'
});

const createBoard = () =>
  Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));

const rotateMatrix = (matrix, direction = 1) => {
  if (direction >= 0) {
    return matrix[0].map((_, column) =>
      matrix.map(row => row[column]).reverse()
    );
  }
  return matrix[0].map((_, column) => matrix.map(row => row[column])).reverse();
}

const pieceCells = piece => {
  const matrix = piece.matrix || PIECES[piece.type];
  const cells = [];
  matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) cells.push({ x: piece.x + x, y: piece.y + y });
  }));
  return cells;
};

const canPlace = (board, piece) =>
  pieceCells(piece).every(({ x, y }) =>
    x >= 0 &&
    x < BOARD_WIDTH &&
    y < BOARD_HEIGHT &&
    (y < 0 || board[y][x] === null)
  );

const movePiece = (board, piece, dx, dy) => {
  const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return canPlace(board, moved) ? moved : piece;
};

const rotatePiece = (board, piece, direction = 1) => {
  const matrix = rotateMatrix(piece.matrix || PIECES[piece.type], direction);
  for (const offset of [0, -1, 1, -2, 2]) {
    const rotated = { ...piece, matrix, rotation: (piece.rotation + direction + 4) % 4, x: piece.x + offset };
    if (canPlace(board, rotated)) return rotated;
  }
  return piece;
};

const lockPiece = (board, piece) => {
  const nextBoard = board.map(row => row.slice());
  let topOut = false;
  pieceCells(piece).forEach(({ x, y }) => {
    if (y < 0) topOut = true;
    else nextBoard[y][x] = piece.type;
  });
  return { board: nextBoard, topOut };
};

const clearLines = board => {
  const remaining = board.filter(row => !row.every(cell => cell !== null));
  const linesCleared = BOARD_HEIGHT - remaining.length;
  return {
    board: [
      ...Array.from({ length: linesCleared }, () => Array(BOARD_WIDTH).fill(null)),
      ...remaining
    ],
    linesCleared
  };
};

const addGarbageLines = (board, holes) => {
  const lines = holes.map(hole =>
    Array.from({ length: BOARD_WIDTH }, (_, column) =>
      column === hole ? null : 'garbage'
    )
  );
  const overflow = board.slice(0, lines.length).some(row => row.some(Boolean));
  return {
    board: [...board.slice(lines.length), ...lines],
    overflow
  };
};

const dropDistance = (board, piece) => {
  let distance = 0;
  while (canPlace(board, { ...piece, y: piece.y + distance + 1 })) distance += 1;
  return distance;
};

const getSpectrum = board =>
  Array.from({ length: BOARD_WIDTH }, (_, x) => {
    const row = board.findIndex(cells => cells[x] !== null);
    return row === -1 ? 0 : BOARD_HEIGHT - row;
  });

const scoreForLines = lines => [0, 100, 300, 500, 800][lines] || 0;

module.exports = {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  PIECES,
  PIECE_COLORS,
  createBoard,
  rotateMatrix,
  pieceCells,
  canPlace,
  movePiece,
  rotatePiece,
  lockPiece,
  clearLines,
  addGarbageLines,
  dropDistance,
  getSpectrum,
  scoreForLines
};
