import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { BOARD_HEIGHT, BOARD_WIDTH, PIECE_COLORS, pieceCells } from '../shared/tetris.js';

const MODES = [
  { value: 'classic', label: 'Classic', note: 'Original gravity' },
  { value: 'fast', label: 'Fast', note: 'Quick gravity' },
  { value: 'invisible', label: 'Invisible', note: 'Pile hidden' }
];

const roomFromPath = pathname => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  try {
    return { room: decodeURIComponent(segments[0]), name: decodeURIComponent(segments[1]) };
  } catch {
    return null;
  }
};

const readScores = () => {
  const stored = window.localStorage.getItem('red-tetris-scores');
  if (!stored) return [];
  const scores = JSON.parse(stored);
  if (!Array.isArray(scores)) throw new Error('Saved scores are not in a valid format.');
  return scores.filter(entry =>
    entry && typeof entry.name === 'string' && Number.isFinite(entry.score)
  );
};

const saveScore = (name, score) => {
  const current = readScores();
  const previous = current.find(entry => entry.name.toLowerCase() === name.toLowerCase());
  const best = Math.max(score, previous?.score || 0);
  const next = [
    ...current.filter(entry => entry.name.toLowerCase() !== name.toLowerCase()),
    { name, score: best }
  ].sort((left, right) => right.score - left.score).slice(0, 5);
  window.localStorage.setItem('red-tetris-scores', JSON.stringify(next));
  return next;
};

const getBoardCells = player => {
  const cells = player.board.map(row => row.slice());
  if (player.piece) {
    pieceCells(player.piece).forEach(({ x, y }) => {
      if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
        cells[y][x] = player.piece.type;
      }
    });
  }
  return cells;
};

const Board = ({ player, mode }) => {
  const cells = getBoardCells(player);
  return (
    <div
      className={`board${mode === 'invisible' ? ' board--invisible' : ''}`}
      role="img"
      aria-label={`${player.name}'s ${BOARD_WIDTH} by ${BOARD_HEIGHT} Tetris board`}
    >
      {cells.flatMap((row, y) => row.map((cell, x) => (
        <div
          className={`cell${cell ? ' cell--filled' : ''}${cell === 'garbage' ? ' cell--garbage' : ''}`}
          key={`${y}-${x}`}
          aria-hidden="true"
          style={cell && cell !== 'garbage' ? { '--piece-color': PIECE_COLORS[cell] } : undefined}
        />
      )))}
    </div>
  );
};

const Spectrum = ({ player }) => (
  <div className="spectrum" aria-label={`${player.name}'s column heights`}>
    {player.spectrum.map((height, index) => (
      <span
        className="spectrum__bar"
        key={index}
        style={{ height: `${Math.max(4, (height / BOARD_HEIGHT) * 100)}%` }}
      />
    ))}
  </div>
);

const Landing = ({ onJoin, scores, storageError }) => {
  const [room, setRoom] = useState('red-pelicans');
  const [name, setName] = useState('');
  return (
    <main className="landing">
      <header className="brand">
        <div className="brand__mark" aria-hidden="true">R</div>
        <span>RED / TETRIS</span>
      </header>
      <section className="landing__content">
        <p className="eyebrow">MULTIPLAYER BLOCK PARTY</p>
        <h1>Stack together.<br /><span>Stay on top.</span></h1>
        <p className="intro">A classic puzzle, with a little more competition. Create a room or join your crew.</p>
        <form
          className="join-form"
          onSubmit={event => {
            event.preventDefault();
            onJoin(room, name);
          }}
        >
          <label>
            <span>YOUR NAME</span>
            <input autoComplete="nickname" maxLength={18} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Red Pelican" required />
          </label>
          <label>
            <span>ROOM</span>
            <input maxLength={32} pattern="[A-Za-z0-9_]+(-[A-Za-z0-9_]+)*" value={room} onChange={event => setRoom(event.target.value)} required />
          </label>
          <button className="button button--primary" type="submit">ENTER ROOM <span aria-hidden="true">↗</span></button>
        </form>
        <p className="helper">Solo play works too — start a room and play at your own pace.</p>
        {storageError && <p className="error-message" role="alert">{storageError}</p>}
        {scores.length > 0 && (
          <aside className="leaderboard">
            <h2>PERSONAL BESTS</h2>
            {scores.map(entry => (
              <div className="leaderboard__row" key={entry.name}>
                <span>{entry.name}</span><strong>{entry.score.toLocaleString()}</strong>
              </div>
            ))}
          </aside>
        )}
      </section>
      <div className="landing__decoration landing__decoration--one" aria-hidden="true" />
      <div className="landing__decoration landing__decoration--two" aria-hidden="true" />
      <footer className="landing__footer">MADE FOR ONE MORE ROUND <span>♦</span></footer>
    </main>
  );
};

const GameRoom = ({ route, onLeave, scores, setScores, storageError, setStorageError }) => {
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [selectedMode, setSelectedMode] = useState('classic');
  const [copied, setCopied] = useState(false);
  const recordedRound = useRef(null);

  useEffect(() => {
    const connection = io();
    setSocket(connection);
    connection.on('connect', () => {
      setConnected(true);
      setSocketId(connection.id);
      connection.emit('room:join', route, result => {
        if (!result?.ok) {
          setError(result?.error || 'Could not join the room.');
          return;
        }
        setError('');
        setState(result.state);
      });
    });
    connection.on('room:state', nextState => setState(nextState));
    connection.on('disconnect', () => setConnected(false));
    connection.on('connect_error', () => {
      setConnected(false);
      setError('Could not connect to the game server. Check your connection and try again.');
    });
    return () => connection.disconnect();
  }, [route]);

  const sendInput = useCallback(input => {
    if (socket && state?.status === 'playing') socket.emit('player:input', input);
  }, [socket, state?.status]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const inputs = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'rotate',
        ArrowDown: 'down',
        ' ': 'hardDrop'
      };
      const input = inputs[event.key];
      if (!input || state?.status !== 'playing') return;
      event.preventDefault();
      sendInput(input);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sendInput, state?.status]);

  const ownPlayer = useMemo(
    () => state?.players.find(player => player.id === socketId),
    [state?.players, socketId]
  );
  const opponents = useMemo(
    () => state?.players.filter(player => player.id !== socketId) || [],
    [state?.players, socketId]
  );
  const isHost = state?.hostId === socketId;

  useEffect(() => {
    if (!state || state.status !== 'finished' || !ownPlayer || recordedRound.current === state.round) return;
    recordedRound.current = state.round;
    try {
      setScores(saveScore(ownPlayer.name, ownPlayer.score));
    } catch (saveError) {
      setStorageError(`Your score could not be saved: ${saveError.message}`);
    }
  }, [ownPlayer, setScores, setStorageError, state]);

  const startGame = () => {
    socket?.emit('game:start', { mode: selectedMode }, result => {
      if (!result?.ok) setError(result?.error || 'Could not start the game.');
      else {
        setState(result.state);
        setError('');
      }
    });
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Could not copy the invite link. Copy the address bar URL instead.');
    }
  };

  if (error && !state) {
    return (
      <main className="room-page room-page--centered">
        <p className="eyebrow">RED / TETRIS</p>
        <h1>Room unavailable</h1>
        <p className="error-message" role="alert">{error}</p>
        <button className="button button--quiet" onClick={onLeave}>BACK TO HOME</button>
      </main>
    );
  }

  return (
    <main className="room-page">
      <header className="room-header">
        <button className="wordmark" onClick={onLeave} aria-label="Leave room and return home">RED <span>/</span> TETRIS</button>
        <div className={`connection${connected ? ' connection--online' : ''}`}>
          <span className="connection__dot" />{connected ? 'CONNECTED' : 'CONNECTING'}
        </div>
        <button className="button button--quiet invite-button" onClick={copyInvite}>{copied ? 'LINK COPIED' : 'INVITE ↗'}</button>
      </header>
      <div className="room-title">
        <div><p className="eyebrow">ROOM / {state?.room || route.room}</p><h1>{ownPlayer?.name || route.name}<span>'s game</span></h1></div>
        <div className="room-title__tag">{state?.players.length || 0} / 8 PLAYERS</div>
      </div>

      {error && <p className="error-message room-error" role="alert">{error}</p>}
      {storageError && <p className="error-message room-error" role="alert">{storageError}</p>}

      {state?.status === 'lobby' && (
        <section className="waiting-panel">
          <div className="waiting-panel__copy">
            <p className="eyebrow">NEXT UP</p>
            <h2>Ready when<br />you are.</h2>
            <p>{isHost ? 'Pick a mode and start the round.' : 'The host will start the round shortly.'} Solo games are ready as soon as you are.</p>
            <div className="player-list">
              {state.players.map(player => (
                <div className="player-pill" key={player.id}>
                  <span className="player-pill__dot" />{player.name}
                  {player.id === state.hostId && <small>HOST</small>}
                </div>
              ))}
            </div>
            {isHost && (
              <div className="start-controls">
                <label className="mode-select">
                  <span>GAME MODE</span>
                  <select value={selectedMode} onChange={event => setSelectedMode(event.target.value)}>
                    {MODES.map(mode => <option value={mode.value} key={mode.value}>{mode.label} — {mode.note}</option>)}
                  </select>
                </label>
                <button className="button button--primary" onClick={startGame}>START GAME <span aria-hidden="true">→</span></button>
              </div>
            )}
          </div>
          <div className="waiting-panel__art" aria-hidden="true">
            <div className="art-piece art-piece--one" /><div className="art-piece art-piece--two" /><div className="art-piece art-piece--three" />
            <span>STACK / PLAY / REPEAT</span>
          </div>
        </section>
      )}

      {state?.status === 'playing' && ownPlayer && (
        <section className="play-layout">
          <div className="play-main">
            <div className="play-meta">
              <div><span className="meta-label">SCORE</span><strong>{ownPlayer.score.toLocaleString()}</strong></div>
              <div><span className="meta-label">LINES</span><strong>{ownPlayer.lines.toString().padStart(2, '0')}</strong></div>
              <div><span className="meta-label">MODE</span><strong className="mode-label">{MODES.find(mode => mode.value === state.mode)?.label}</strong></div>
            </div>
            {ownPlayer.alive
              ? <Board player={ownPlayer} mode={state.mode} />
              : <div className="board board--out"><span>TOP OUT</span></div>}
            <div className="controls-hint"><span>← → MOVE</span><span>↑ ROTATE</span><span>↓ SOFT DROP</span><span>SPACE HARD DROP</span></div>
            <div className="touch-controls" aria-label="Game controls">
              <button onClick={() => sendInput('left')} aria-label="Move left">←</button>
              <button onClick={() => sendInput('rotate')} aria-label="Rotate">↻</button>
              <button onClick={() => sendInput('down')} aria-label="Soft drop">↓</button>
              <button onClick={() => sendInput('right')} aria-label="Move right">→</button>
              <button className="touch-controls__drop" onClick={() => sendInput('hardDrop')}>DROP</button>
            </div>
          </div>
          <aside className="opponent-panel">
            <div className="opponent-panel__heading"><p className="eyebrow">THE FIELD</p><h2>Opponents <span>({opponents.length})</span></h2></div>
            {opponents.length === 0
              ? <div className="empty-opponents"><span>01</span><p>Waiting on your rivals.<br />Share the room link to invite them.</p></div>
              : opponents.map(player => (
                <div className={`opponent-card${player.alive ? '' : ' opponent-card--out'}`} key={player.id}>
                  <div className="opponent-card__top"><strong>{player.name}</strong><span>{player.alive ? `${player.score.toLocaleString()} PTS` : 'OUT'}</span></div>
                  <Spectrum player={player} />
                  <div className="opponent-card__lines">{player.lines} LINES</div>
                </div>
              ))}
            <p className="opponent-note">Clear 2+ lines to send garbage.<br />The last player standing wins.</p>
          </aside>
        </section>
      )}

      {state?.status === 'finished' && (
        <section className="finished-panel">
          <p className="eyebrow">ROUND {state.round} COMPLETE</p>
          <h2>{state.winnerId ? (state.winnerId === socketId ? 'You win.' : `${state.players.find(player => player.id === state.winnerId)?.name || 'A rival'} wins.`) : 'Nice run.'}</h2>
          {ownPlayer && <p>Your score: <strong>{ownPlayer.score.toLocaleString()}</strong> · {ownPlayer.lines} lines</p>}
          <div className="finished-panel__actions">
            {isHost && <button className="button button--primary" onClick={startGame}>PLAY AGAIN <span aria-hidden="true">→</span></button>}
            {!isHost && <p>Waiting for the host to start the next round.</p>}
            <button className="button button--quiet" onClick={onLeave}>LEAVE ROOM</button>
          </div>
          {scores.length > 0 && <p className="personal-best">PERSONAL BEST · {scores[0].name} / {scores[0].score.toLocaleString()}</p>}
        </section>
      )}

      <footer className="room-footer"><span>RED / TETRIS</span><span>ARROWS TO MOVE · SPACE TO DROP</span></footer>
    </main>
  );
};

export default function App() {
  const [route, setRoute] = useState(() => roomFromPath(window.location.pathname));
  const [scores, setScores] = useState(() => {
    try {
      return readScores();
    } catch {
      return [];
    }
  });
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    const onPopState = () => setRoute(roomFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const joinRoom = (room, name) => {
    const safeRoom = room.trim();
    const safeName = name.trim();
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(safeRoom) || !safeName || safeName.length > 18) return;
    const destination = `/${encodeURIComponent(safeRoom)}/${encodeURIComponent(safeName)}`;
    window.history.pushState({}, '', destination);
    setRoute({ room: safeRoom, name: safeName });
  };

  const leaveRoom = () => {
    window.history.pushState({}, '', '/');
    setRoute(null);
  };

  return route
    ? <GameRoom key={`${route.room}/${route.name}`} route={route} onLeave={leaveRoom} scores={scores} setScores={setScores} storageError={storageError} setStorageError={setStorageError} />
    : <Landing onJoin={joinRoom} scores={scores} storageError={storageError} />;
}

export { Board, GameRoom, Landing, getBoardCells, readScores, roomFromPath, saveScore };
