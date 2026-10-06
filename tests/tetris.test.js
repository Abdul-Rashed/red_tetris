import { describe, expect, it } from 'vitest';
const {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PIECES,
  addGarbageLines,
  canPlace,
  clearLines,
  createBoard,
  dropDistance,
  getSpectrum,
  lockPiece,
  movePiece,
  pieceCells,
  rotateMatrix,
  rotatePiece,
  scoreForLines
} = require('../src/shared/tetris.js');

describe('pure Tetris rules', () => {
  it('creates the standard empty field and piece shapes', () => {
    const board = createBoard();
    expect(board).toHaveLength(BOARD_HEIGHT);
    expect(board.every(row => row.length === BOARD_WIDTH && row.every(cell => cell === null))).toBe(true);
    expect(Object.keys(PIECES)).toEqual(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
  });

  it('rotates matrices in either direction', () => {
    expect(rotateMatrix([[1, 2], [3, 4]])).toEqual([[3, 1], [4, 2]]);
    expect(rotateMatrix([[1, 2], [3, 4]], -1)).toEqual([[2, 4], [1, 3]]);
  });

  it('checks collisions and moves without mutating the board or piece', () => {
    const board = createBoard();
    const piece = { type: 'O', x: 3, y: 0 };
    expect(pieceCells(piece)).toHaveLength(4);
    expect(canPlace(board, piece)).toBe(true);
    expect(canPlace(board, { ...piece, x: -1 })).toBe(false);
    expect(canPlace(board, { ...piece, y: BOARD_HEIGHT - 1 })).toBe(false);
    expect(movePiece(board, piece, -1, 0)).toMatchObject({ x: 2, y: 0 });
    expect(movePiece(board, piece, -4, 0)).toBe(piece);
    board[1][3] = 'J';
    expect(canPlace(board, piece)).toBe(false);
    expect(piece).toMatchObject({ x: 3, y: 0 });
  });

  it('rotates pieces and tries horizontal wall kicks', () => {
    const board = createBoard();
    const piece = { type: 'I', matrix: [[1], [1], [1], [1]], x: -1, y: 3, rotation: 1 };
    expect(rotatePiece(board, piece)).toMatchObject({ x: 0, y: 3, rotation: 2 });
    const blocked = { type: 'I', matrix: [[1, 1, 1, 1]], x: 3, y: 18, rotation: 0 };
    expect(rotatePiece(board, blocked)).toBe(blocked);
  });

  it('locks pieces immutably and reports blocks above the field', () => {
    const board = createBoard();
    const result = lockPiece(board, { type: 'O', x: 0, y: 0 });
    expect(result.topOut).toBe(false);
    expect(result.board[0].slice(0, 2)).toEqual(['O', 'O']);
    expect(board[0].slice(0, 2)).toEqual([null, null]);
    expect(lockPiece(board, { type: 'O', x: 0, y: -1 }).topOut).toBe(true);
  });

  it('clears complete rows and counts all cleared lines', () => {
    const board = createBoard();
    board[18].fill('T');
    board[19] = Array(BOARD_WIDTH).fill('I');
    board[19][0] = null;
    const result = clearLines(board);
    expect(result.linesCleared).toBe(1);
    expect(result.board[0].every(cell => cell === null)).toBe(true);
    expect(result.board[19]).toEqual(board[19]);
  });

  it('adds garbage rows at the bottom and reports overflow', () => {
    const board = createBoard();
    const result = addGarbageLines(board, [4, 7]);
    expect(result.overflow).toBe(false);
    expect(result.board[18][4]).toBeNull();
    expect(result.board[19][7]).toBeNull();
    expect(result.board[19].filter(cell => cell === 'garbage')).toHaveLength(9);
    board[0][0] = 'T';
    expect(addGarbageLines(board, [2]).overflow).toBe(true);
  });

  it('computes hard-drop distance, spectrum, and score values', () => {
    const board = createBoard();
    expect(dropDistance(board, { type: 'O', x: 0, y: 0 })).toBe(18);
    board[16][0] = 'O';
    expect(getSpectrum(board)[0]).toBe(4);
    expect(getSpectrum(board)[1]).toBe(0);
    expect(scoreForLines(0)).toBe(0);
    expect(scoreForLines(1)).toBe(100);
    expect(scoreForLines(2)).toBe(300);
    expect(scoreForLines(3)).toBe(500);
    expect(scoreForLines(4)).toBe(800);
    expect(scoreForLines(5)).toBe(0);
  });
});
