// server.js
// Planning Poker server with per-room state persisted to disk (rooms.json)

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static("public"));

// ---- Persistence ------------------------------------------------------------

const ROOMS_FILE = path.join(__dirname, "rooms.json");

// Load rooms from disk if file exists
function loadRoomsFromDisk() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const raw = fs.readFileSync(ROOMS_FILE, "utf8");
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        console.log("Loaded rooms from disk.");
        return data;
      }
    }
  } catch (err) {
    console.error("Error loading rooms from disk:", err);
  }
  return {}; // default empty
}

// Save rooms to disk
function saveRoomsToDisk() {
  try {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving rooms to disk:", err);
  }
}

// ---- Room state -------------------------------------------------------------

// Room state shape:
// {
//   revealed: bool,
//   votes: { name: { value: string, avatar: string } },
//   backlog: { items: string[], currentIndex: number }
// }

// In-memory rooms object, initialised from disk
const rooms = loadRoomsFromDisk();

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

// ---- Socket.IO handlers -----------------------------------------------------

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

    // Ensure room exists and send full current state to the joining client
    const room = getRoom(currentRoom);
    socket.emit("stateUpdate", room);
    // also send backlog explicitly (client listens to backlogUpdate)
    socket.emit("backlogUpdate", room.backlog);
  });

  socket.on("updateName", ({ name, avatar }) => {
    currentName = name || "Anonymous";
    if (avatar) currentAvatar = avatar;
  });

  socket.on("vote", (value) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.votes[currentName] = { value, avatar: currentAvatar };
    saveRoomsToDisk(); // persist state
    io.to(currentRoom).emit("stateUpdate", room);
  });

  socket.on("reveal", () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.revealed = true;
    saveRoomsToDisk();
    io.to(currentRoom).emit("stateUpdate", room);
  });

  socket.on("reset", () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.revealed = false;
    room.votes = {};
    saveRoomsToDisk();
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
    saveRoomsToDisk();
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
    saveRoomsToDisk();
    io.to(currentRoom).emit("stateUpdate", room);
    io.to(currentRoom).emit("backlogUpdate", room.backlog);
  });

  socket.on("disconnect", () => {
    if (!currentRoom || !currentName) return;
    const room = rooms[currentRoom];
    if (!room) return;
    delete room.votes[currentName];
    saveRoomsToDisk();
    io.to(currentRoom).emit("stateUpdate", room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Planning Poker running at http://localhost:${PORT}`);
});
