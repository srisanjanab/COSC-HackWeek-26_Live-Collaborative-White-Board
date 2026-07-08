/* ============================================================
   Live Collaborative Whiteboard — Server
   Express serves the static client; Socket.IO relays drawing
   events between everyone in the same "room" and keeps an
   in-memory stroke log so late joiners see the existing board.
   ============================================================ */

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

/**
 * In-memory room state. Fine for a demo/challenge — for real
 * persistence you'd swap this for Redis or a database.
 *
 * rooms = {
 *   [roomId]: {
 *     strokes: Array<StrokeSegment>,   // for replay to new joiners
 *     users: Map<socketId, { name, color }>
 *   }
 * }
 */
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { strokes: [], users: new Map() });
  }
  return rooms.get(roomId);
}

function broadcastUserList(roomId) {
  const room = getRoom(roomId);
  const users = Array.from(room.users.entries()).map(([id, u]) => ({
    id,
    name: u.name,
    color: u.color,
  }));
  io.to(roomId).emit("users", users);
}

io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("join", ({ room, name, color }) => {
    currentRoom = room || "lobby";
    socket.join(currentRoom);

    const roomState = getRoom(currentRoom);
    roomState.users.set(socket.id, { name: name || "Guest", color: color || "#23262b" });

    // Replay existing strokes to the new joiner only.
    socket.emit("load-strokes", roomState.strokes);
    broadcastUserList(currentRoom);
  });

  socket.on("draw", (segment) => {
    if (!currentRoom) return;
    const roomState = getRoom(currentRoom);
    roomState.strokes.push(segment);
    // Everyone else in the room draws this segment too.
    socket.to(currentRoom).emit("draw", segment);
  });

  socket.on("cursor", (pos) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("cursor", { id: socket.id, ...pos });
  });

  socket.on("clear", () => {
    if (!currentRoom) return;
    const roomState = getRoom(currentRoom);
    roomState.strokes = [];
    io.to(currentRoom).emit("clear");
  });

  socket.on("undo-last-batch", (batchId) => {
    if (!currentRoom) return;
    const roomState = getRoom(currentRoom);
    roomState.strokes = roomState.strokes.filter((s) => s.batchId !== batchId);
    io.to(currentRoom).emit("remove-batch", batchId);
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const roomState = getRoom(currentRoom);
    roomState.users.delete(socket.id);
    socket.to(currentRoom).emit("cursor-leave", socket.id);
    broadcastUserList(currentRoom);

    // Clean up empty rooms so memory doesn't grow forever.
    if (roomState.users.size === 0) {
      rooms.delete(currentRoom);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Whiteboard server listening on port ${PORT}`);
});
