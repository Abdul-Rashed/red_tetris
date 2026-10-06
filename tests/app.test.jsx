import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { io } from 'socket.io-client';
import App, { Board, getBoardCells, readScores, roomFromPath, saveScore } from '../src/client/App.jsx';
import { createBoard } from '../src/shared/tetris.js';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

let socket;
let handlers;

const makePlayer = (id, name) => ({
  id,
  name,
  alive: true,
  score: 0,
  lines: 0,
  board: createBoard(),
  spectrum: Array(10).fill(0),
  piece: null,
  sequenceIndex: 1
});

const roomState = (status = 'lobby', mode = 'classic') => ({
  room: 'arena',
  status,
  hostId: 'p1',
  viewerId: 'p1',
  mode,
  winnerId: null,
  round: 1,
  players: [makePlayer('p1', 'Ada'), makePlayer('p2', 'Lin')]
});

beforeEach(() => {
  handlers = {};
  socket = {
    id: 'p1',
    on: vi.fn((event, callback) => { handlers[event] = callback; }),
    emit: vi.fn((event, payload, callback) => {
      if (event === 'room:join') callback({ ok: true, state: roomState() });
      if (event === 'game:start') callback({ ok: true, state: roomState('playing', payload.mode) });
    }),
    disconnect: vi.fn()
  };
  io.mockReturnValue(socket);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.clearAllMocks();
});

describe('client room routing and personal bests', () => {
  it('parses encoded room routes and rejects malformed encodings', () => {
    expect(roomFromPath('/red-room/Ada%20Lovelace')).toEqual({ room: 'red-room', name: 'Ada Lovelace' });
    expect(roomFromPath('/')).toBeNull();
    expect(roomFromPath('/room/%E0%A4%A')).toBeNull();
  });

  it('loads and saves a sorted top-five personal leaderboard', () => {
    expect(readScores()).toEqual([]);
    expect(saveScore('Ada', 100)).toEqual([{ name: 'Ada', score: 100 }]);
    saveScore('Ada', 60);
    saveScore('Lin', 200);
    expect(readScores()).toEqual([{ name: 'Lin', score: 200 }, { name: 'Ada', score: 100 }]);
    window.localStorage.setItem('red-tetris-scores', '{}');
    expect(() => readScores()).toThrow('valid format');
  });

  it('renders the room-entry form and navigates to a player URL', () => {
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Red Pelican'), { target: { value: 'Ada' } });
    expect(screen.getByLabelText('ROOM').checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /enter room/i }));
    expect(window.location.pathname).toBe('/red-pelicans/Ada');
    expect(screen.getByText('CONNECTING')).toBeTruthy();
  });

  it('accepts hyphenated room names and rejects invalid room characters', () => {
    render(<App />);
    const roomInput = screen.getByLabelText('ROOM');
    expect(roomInput.checkValidity()).toBe(true);
    fireEvent.change(roomInput, { target: { value: 'bad room' } });
    expect(roomInput.checkValidity()).toBe(false);
  });

  it('joins a room, starts play, sends keyboard controls, and persists a finished score', () => {
    window.history.replaceState({}, '', '/arena/Ada');
    render(<App />);
    act(() => handlers.connect());
    expect(screen.getByRole('heading', { level: 1, name: /Ada.*game/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    expect(screen.getByRole('img', { name: /Ada's 10 by 20/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    expect(socket.emit).toHaveBeenCalledWith('player:input', 'left');
    expect(socket.emit).toHaveBeenCalledWith('player:input', 'rotate');
    const finished = roomState('finished');
    finished.winnerId = 'p1';
    finished.players[0].score = 450;
    act(() => handlers['room:state'](finished));
    expect(screen.getByText('You win.')).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('red-tetris-scores'))).toEqual([{ name: 'Ada', score: 450 }]);
  });

  it('composes fixed and falling blocks in the board display', () => {
    const player = {
      name: 'Ada',
      board: createBoard(),
      piece: { type: 'O', x: 3, y: 2, matrix: [[1, 1], [1, 1]] }
    };
    player.board[19][0] = 'J';
    const cells = getBoardCells(player);
    expect(cells[2][3]).toBe('O');
    expect(cells[3][4]).toBe('O');
    expect(cells[19][0]).toBe('J');
    render(<Board player={player} mode="invisible" />);
    expect(screen.getByRole('img', { name: /Ada's 10 by 20/ })).toBeTruthy();
  });
});
