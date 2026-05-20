// server.js
// Simple Planning Poker server without Azure DevOps integration

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Serve static files
app.use(express.static("public"));

// In-memory room state: { roomId: { revealed: bool, votes: { name: value } } }
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = { revealed: false, votes: {} };
  }
  return rooms[roomId];
}

io.on("connection", (socket) => {
  let currentRoom = null;
  let currentName = null;

  socket.on("joinRoom", ({ roomId, name }) => {
    if (currentRoom) socket.leave(currentRoom);

    currentRoom = roomId || "default-room";
    currentName = name || "Anonymous";

    socket.join(currentRoom);
    socket.emit("stateUpdate", getRoom(currentRoom));
  });

  socket.on("updateName", (name) => {
    currentName = name || "Anonymous";
  });

  socket.on("vote", (value) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.votes[currentName || "Anonymous"] = value;
    io.to(currentRoom).emit("stateUpdate", room);
  });

  socket.on("reveal", () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.revealed = true;
    io.to(currentRoom).emit("stateUpdate", room);
  });

  socket.on("reset", () => {
    if (!currentRoom) return;
    rooms[currentRoom] = { revealed: false, votes: {} };
    io.to(currentRoom).emit("stateUpdate", rooms[currentRoom]);
  });

  socket.on("disconnect", () => {
    // No cleanup for now
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Planning Poker running at http://localhost:${PORT}`);
});