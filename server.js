// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static("public"));

// Room state shape:
// {
//   revealed: bool,
//   votes: { name: { value: string, avatar: string } },
//   backlog: { items: string[], currentIndex: number }
// }
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      revealed: false,
      votes: {},
      backlog: { items: [], currentIndex: -1 },
    };
  }
  return rooms[roomId];
}

io.on("connection", (socket) => {
  let currentRoom = null;
  let currentName = null;
  let currentAvatar = "/avatars/avatar1.jpg";

  socket.on("joinRoom", ({ roomId, name, avatar }) => {
    if (currentRoom) socket.leave(currentRoom);

    currentRoom = roomId || "default-room";
    currentName = name || "Anonymous";
    currentAvatar = avatar || "/avatars/avatar1.jpg";

    socket.join(currentRoom);

    // Send full current state to the joining client
    socket.emit("stateUpdate", getRoom(currentRoom));
  });

  socket.on("updateName", ({ name, avatar }) => {
    currentName = name || "Anonymous";
    if (avatar) currentAvatar = avatar;
  });

  socket.on("vote", (value) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.votes[currentName] = { value, avatar: currentAvatar };
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
    const room = getRoom(currentRoom);
    room.revealed = false;
    room.votes = {};
    io.to(currentRoom).emit("stateUpdate", room);
  });

  // Sync backlog across all participants in the room
  socket.on("setBacklog", ({ items, currentIndex }) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.backlog = {
      items: Array.isArray(items) ? items : [],
      currentIndex: typeof currentIndex === "number" ? currentIndex : -1,
    };
    io.to(currentRoom).emit("backlogUpdate", room.backlog);
  });

  socket.on("setBacklogIndex", (index) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (!room.backlog.items.length) return;
    room.backlog.currentIndex = index;
    // Also reset votes when navigating to a new item
    room.revealed = false;
    room.votes = {};
    io.to(currentRoom).emit("stateUpdate", room);
    io.to(currentRoom).emit("backlogUpdate", room.backlog);
  });

  socket.on("disconnect", () => {
    if (!currentRoom || !currentName) return;
    const room = rooms[currentRoom];
    if (!room) return;
    delete room.votes[currentName];
    io.to(currentRoom).emit("stateUpdate", room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Planning Poker running at http://localhost:${PORT}`);
});
