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

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ROOM = "default-room";
const DEFAULT_AVATAR = "/avatars/avatar1.jpg";
const MAX_NAME_LENGTH = 64;
const MAX_VOTE_LENGTH = 16;
const MAX_BACKLOG_ITEMS = 200;
const MAX_ITEM_LENGTH = 256;
const ROOM_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours — prune idle rooms

// ─── Room state ───────────────────────────────────────────────────────────────
//
// rooms[roomId] = {
//   revealed: boolean,
//   votes: { [name]: { value: string, avatar: string } },
//   backlog: { items: string[], currentIndex: number },
//   lastActivity: number  (Date.now())
// }

const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      revealed: false,
      votes: {},
      backlog: { items: [], currentIndex: -1 },
      lastActivity: Date.now(),
    };
  } else {
    rooms[roomId].lastActivity = Date.now();
  }
  return rooms[roomId];
}

// Prune rooms that have been idle longer than ROOM_TTL_MS
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of Object.entries(rooms)) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      delete rooms[id];
    }
  }
}, 30 * 60 * 1000); // check every 30 min

// ─── Input helpers ────────────────────────────────────────────────────────────

function sanitiseName(raw) {
  return String(raw || "").trim().slice(0, MAX_NAME_LENGTH) || "Anonymous";
}

function sanitiseVote(raw) {
  return String(raw || "").trim().slice(0, MAX_VOTE_LENGTH);
}

function sanitiseAvatar(raw) {
  // Only allow relative paths that match our avatar pattern
  if (typeof raw === "string" && /^\/avatars\/avatar\d+\.jpg$/.test(raw)) {
    return raw;
  }
  return DEFAULT_AVATAR;
}

function sanitiseBacklogItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_BACKLOG_ITEMS)
    .map((s) => String(s).trim().slice(0, MAX_ITEM_LENGTH))
    .filter(Boolean);
}

// ─── Socket handlers ──────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  // Per-socket identity — set once on joinRoom
  let currentRoom = null;
  let currentName = null;
  let currentAvatar = DEFAULT_AVATAR;
  let hasJoined = false;

  // Helper: guard any action that requires the socket to have joined a room
  function requiresRoom(fn) {
    if (!currentRoom || !hasJoined) return;
    fn();
  }

  socket.on("joinRoom", (payload) => {
    // Tolerate both object and primitive payloads defensively
    if (!payload || typeof payload !== "object") return;

    const { roomId, name, avatar } = payload;

    // Leave previous room if re-joining (e.g. hash change)
    if (currentRoom) {
      socket.leave(currentRoom);
      // Clean up old vote entry when switching rooms
      const oldRoom = rooms[currentRoom];
      if (oldRoom && currentName) {
        delete oldRoom.votes[currentName];
        io.to(currentRoom).emit("stateUpdate", oldRoom);
      }
    }

    currentRoom   = sanitiseName(roomId) || DEFAULT_ROOM;
    currentName   = sanitiseName(name);
    currentAvatar = sanitiseAvatar(avatar);
    hasJoined     = true;

    socket.join(currentRoom);

    // Send full current state so the joining client is immediately in sync
    socket.emit("stateUpdate", getRoom(currentRoom));
    // Also send the backlog separately so client mirrors server state
    socket.emit("backlogUpdate", getRoom(currentRoom).backlog);
  });

  socket.on("vote", (rawValue) => {
    requiresRoom(() => {
      const value = sanitiseVote(rawValue);
      const room = getRoom(currentRoom);

      // Prevent voting after reveal — must reset first
      if (room.revealed) return;

      room.votes[currentName] = { value, avatar: currentAvatar };
      io.to(currentRoom).emit("stateUpdate", room);
    });
  });

  socket.on("reveal", () => {
    requiresRoom(() => {
      const room = getRoom(currentRoom);
      if (room.revealed) return; // idempotent
      room.revealed = true;
      io.to(currentRoom).emit("stateUpdate", room);
    });
  });

  socket.on("reset", () => {
    requiresRoom(() => {
      const room = getRoom(currentRoom);
      room.revealed = false;
      room.votes = {};
      io.to(currentRoom).emit("stateUpdate", room);
    });
  });

  socket.on("setBacklog", (payload) => {
    requiresRoom(() => {
      if (!payload || typeof payload !== "object") return;
      const items        = sanitiseBacklogItems(payload.items);
      const currentIndex = items.length > 0 ? 0 : -1;

      const room = getRoom(currentRoom);
      room.backlog = { items, currentIndex };
      io.to(currentRoom).emit("backlogUpdate", room.backlog);
    });
  });

  socket.on("setBacklogIndex", (rawIndex) => {
    requiresRoom(() => {
      const room  = getRoom(currentRoom);
      const { items } = room.backlog;
      if (!items.length) return;

      const index = parseInt(rawIndex, 10);
      if (isNaN(index) || index < 0 || index >= items.length) return;

      room.backlog.currentIndex = index;
      // Navigating to a new item resets the round for everyone
      room.revealed = false;
      room.votes    = {};

      // Send both updates atomically (same tick — no interleaved renders)
      io.to(currentRoom).emit("stateUpdate", room);
      io.to(currentRoom).emit("backlogUpdate", room.backlog);
    });
  });

  socket.on("disconnect", () => {
    if (!currentRoom || !currentName) return;
    const room = rooms[currentRoom];
    if (!room) return;
    delete room.votes[currentName];
    io.to(currentRoom).emit("stateUpdate", room);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Planning Poker running at http://localhost:${PORT}`);
});
