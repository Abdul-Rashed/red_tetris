# Red Tetris

A browser-based, networked multiplayer Tetris game. The server is authoritative
for board state, piece order, collision, line clears, and round results.

## Requirements

- Node.js 20.19+, 22.12+, or 24+
- npm

## Run

```sh
npm install
npm start
```

Open `http://localhost:3000`. Enter a room and player name; send the room URL to
other players to invite them. The first player is the host and starts the round.
One-player rooms are supported. The host can choose Classic, Fast, or Invisible
mode before starting and can restart a completed round.

Use left/right arrows to move, up to rotate, down to soft drop, and Space to
hard drop. On touch devices, use the on-screen controls. Clearing two or more
lines sends `cleared lines - 1` garbage rows to each living opponent.

## Architecture and protocol

The Node server owns rooms, host assignment, the shared seven-bag piece
sequence, each player's board and score, gravity, line clears, garbage, and
win/loss decisions. The React client renders snapshots and sends input only;
it does not decide whether a move is valid. Each player advances through the
same generated piece sequence independently.

Clients join at `/<room>/<player_name>` over Socket.IO. `room:join` sends
`{ room, name }`; the first player becomes host. Only the host may send
`game:start` with `{ mode: "classic" | "fast" | "invisible" }`. During play,
`player:input` accepts `left`, `right`, `rotate`, `down`, or `hardDrop`.
The server broadcasts authoritative `room:state` snapshots after changes.
There is no account or server-side score persistence; personal bests are
stored locally in the browser.

## Development and tests

```sh
npm run dev
npm test
npm run test:coverage
```

The test command runs the full suite with the required coverage thresholds.
`npm start` builds the React single-page client into `public/bundle.js` before
starting the Express and Socket.IO server. The app keeps a small personal-best
leaderboard in the browser; game state and accounts are not persisted on the
server.
