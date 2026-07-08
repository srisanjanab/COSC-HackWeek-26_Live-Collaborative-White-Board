# Shared Board — Live Collaborative Whiteboard

A real-time multiplayer whiteboard. Anyone with the room link draws on the same canvas at the same time — strokes, an eraser, marker colors, live cursors, and a shared "clear board" all sync instantly over Socket.IO.

## Features

- **Real-time drawing sync** — every stroke segment is broadcast over a Socket.IO WebSocket connection and rendered on all connected clients within milliseconds.
- **Rooms** — the URL carries a `?room=` code. Anyone opening the same link joins the same board; opening the app fresh generates a new room and updates the URL.
- **Late-join replay** — the server keeps an in-memory log of strokes per room, so a user who joins mid-session sees everything drawn so far.
- **Marker tray** — six marker colors styled as physical dry-erase markers, an adjustable thickness slider, and an eraser (uses canvas `destination-out` compositing).
- **Live cursors** — see other users' pointers moving on the board in real time, labeled with a generated guest name.
- **Presence count** — a running count of how many people are on the board right now.
- **Clear board** — wipes the canvas for every connected user at once.
- **Copy invite link** — one click to copy the room URL to share with a collaborator.
- **Reconnect handling** — a banner appears if the socket briefly drops and is trying to reconnect.

## Architecture

```
collab-whiteboard/
├── server.js          Express static server + Socket.IO event relay
├── package.json
└── public/
    ├── index.html     Canvas + toolbar markup
    ├── style.css       "Whiteboard on a wall" design system
    └── script.js      Canvas drawing, pointer events, Socket.IO client
```

**How sync works:** each pointer-move while drawing emits a small `draw` event — `{x0, y0, x1, y1, color, size, eraser, batchId}` — using coordinates normalized to 0–1 so the drawing lines up correctly across different window sizes. The server pushes that segment into the room's stroke log and relays it to every other socket in the room, which draws the same segment locally. Cursor position updates are throttled to ~30 updates/sec and are not persisted — they're just relayed live.

Room state currently lives in server memory (a `Map`), which is enough for a demo/challenge submission. For long-term persistence across server restarts, swap the in-memory `rooms` map for Redis or a database.

## Running locally

```bash
npm install
npm start
# visit http://localhost:3000
```

Open the same URL in a second browser tab (or a private window) to see two "users" drawing together.

## Deploying

This app needs a server that keeps a long-lived process for WebSockets (not a serverless/static host). Good free options:

### Render
1. Push this repo to GitHub.
2. New → Web Service → connect the repo.
3. Build command: `npm install` · Start command: `npm start`.
4. Deploy — Render gives you a public HTTPS URL that supports WebSockets out of the box.

### Railway
1. New Project → Deploy from GitHub repo.
2. Railway auto-detects `npm start`. Deploy and grab the generated domain.

### Fly.io / Glitch
Both also work well for small Node + Socket.IO apps — import the repo and deploy per their standard Node app flow.

## Demo checklist (for submission)

1. Open the deployed URL in one browser window.
2. Copy the invite link (top-left chip) and open it in a second window/device.
3. Draw in one window — the stroke should appear in the other within a moment, and the presence count should read 2.
4. Try different marker colors, the eraser, and "Clear board" to show they sync too.
