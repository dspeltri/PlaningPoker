// server.js
"use strict";

const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ROOM      = "default-room";
const DEFAULT_AVATAR    = "/avatars/avatar1.jpg";
const MAX_NAME_LENGTH   = 64;
const MAX_VOTE_LENGTH   = 16;
const MAX_BACKLOG_ITEMS = 200;
const MAX_ITEM_LENGTH   = 256;
const ROOM_TTL_MS       = 4 * 60 * 60 * 1000; // 4 h — prune idle rooms

// Rate-limit: max events per socket per window
const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MAX       = 20; // max events in that window

// ─── Room state ───────────────────────────────────────────────────────────────
//
// rooms[roomId] = {
//   revealed      : boolean,
//   votes         : { [socketId]: { name, value, avatar } },
//   backlog       : { items: string[], currentIndex: number },
//   lastActivity  : number  (Date.now())
// }
//
// Key change: votes are keyed by socket.id, not by name.
// This prevents two users with the same name overwriting each other.

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

// Serialise room state for the client — convert socket-id keys into name keys
// so the client rendering code stays unchanged.
function roomForClient(room) {
  const votes = {};
  for (const entry of Object.values(room.votes)) {
    votes[entry.name] = { value: entry.value, avatar: entry.avatar };
  }
  return { revealed: room.revealed, votes, backlog: room.backlog };
}

// Prune rooms idle longer than ROOM_TTL_MS
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of Object.entries(rooms)) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      delete rooms[id];
    }
  }
}, 30 * 60 * 1000);

// ─── Input helpers ────────────────────────────────────────────────────────────

function sanitiseName(raw) {
  return String(raw || "").trim().slice(0, MAX_NAME_LENGTH) || "Anonymous";
}

function sanitiseVote(raw) {
  return String(raw || "").trim().slice(0, MAX_VOTE_LENGTH);
}

function sanitiseAvatar(raw) {
  if (typeof raw === "string" && /^\/avatars\/avatar\d+\.jpg$/.test(raw)) return raw;
  return DEFAULT_AVATAR;
}

function sanitiseBacklogItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_BACKLOG_ITEMS)
    .map((s) => String(s).trim().slice(0, MAX_ITEM_LENGTH))
    .filter(Boolean);
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

function makeRateLimiter() {
  let count     = 0;
  let windowEnd = Date.now() + RATE_LIMIT_WINDOW_MS;

  return function isAllowed() {
    const now = Date.now();
    if (now > windowEnd) {
      count     = 0;
      windowEnd = now + RATE_LIMIT_WINDOW_MS;
    }
    count++;
    return count <= RATE_LIMIT_MAX;
  };
}

// ─── Socket handlers ──────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  let currentRoom   = null;
  let currentName   = null;
  let currentAvatar = DEFAULT_AVATAR;
  let hasJoined     = false;

  const isAllowed = makeRateLimiter();

  function requiresRoom(fn) {
    if (!currentRoom || !hasJoined) return;
    if (!isAllowed()) {
      socket.emit("error", "Rate limit exceeded. Slow down.");
      return;
    }
    fn();
  }

  // Broadcast updated state to everyone in the room
  function broadcastState() {
    const room = rooms[currentRoom];
    if (!room) return;
    io.to(currentRoom).emit("stateUpdate", roomForClient(room));
  }

  // ── joinRoom ──────────────────────────────────────────────────────────────
  socket.on("joinRoom", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { roomId, name, avatar } = payload;

    // Leave previous room — clean up stale vote entry
    if (currentRoom) {
      socket.leave(currentRoom);
      const oldRoom = rooms[currentRoom];
      if (oldRoom) {
        delete oldRoom.votes[socket.id];
        io.to(currentRoom).emit("stateUpdate", roomForClient(oldRoom));
      }
    }

    currentRoom   = sanitiseName(roomId) || DEFAULT_ROOM;
    currentName   = sanitiseName(name);
    currentAvatar = sanitiseAvatar(avatar);
    hasJoined     = true;

    socket.join(currentRoom);

    const room = getRoom(currentRoom);

    // Register presence immediately (value empty = not yet voted)
    room.votes[socket.id] = { name: currentName, value: "", avatar: currentAvatar };

    socket.emit("stateUpdate",  roomForClient(room));
    socket.emit("backlogUpdate", room.backlog);

    // Notify others that someone joined
    broadcastState();
  });

  // ── vote ──────────────────────────────────────────────────────────────────
  socket.on("vote", (rawValue) => {
    requiresRoom(() => {
      const room = getRoom(currentRoom);
      if (room.revealed) return; // locked after reveal
      const value = sanitiseVote(rawValue);
      room.votes[socket.id] = { name: currentName, value, avatar: currentAvatar };
      broadcastState();
    });
  });

  // ── reveal ────────────────────────────────────────────────────────────────
  socket.on("reveal", () => {
    requiresRoom(() => {
      const room = getRoom(currentRoom);
      if (room.revealed) return; // idempotent
      room.revealed = true;
      broadcastState();
    });
  });

  // ── reset ─────────────────────────────────────────────────────────────────
  socket.on("reset", () => {
    requiresRoom(() => {
      const room = getRoom(currentRoom);
      room.revealed = false;
      // Clear votes but keep participants present (empty value)
      for (const id of Object.keys(room.votes)) {
        room.votes[id].value = "";
      }
      broadcastState();
    });
  });

  // ── setBacklog ────────────────────────────────────────────────────────────
  socket.on("setBacklog", (payload) => {
    requiresRoom(() => {
      if (!payload || typeof payload !== "object") return;
      const items        = sanitiseBacklogItems(payload.items);
      const currentIndex = items.length > 0 ? 0 : -1;
      const room         = getRoom(currentRoom);
      room.backlog       = { items, currentIndex };
      io.to(currentRoom).emit("backlogUpdate", room.backlog);
    });
  });

  // ── setBacklogIndex ───────────────────────────────────────────────────────
  socket.on("setBacklogIndex", (rawIndex) => {
    requiresRoom(() => {
      const room      = getRoom(currentRoom);
      const { items } = room.backlog;
      if (!items.length) return;
      const index = parseInt(rawIndex, 10);
      if (Number.isNaN(index) || index < 0 || index >= items.length) return;

      room.backlog.currentIndex = index;
      room.revealed = false;
      for (const id of Object.keys(room.votes)) {
        room.votes[id].value = "";
      }

      io.to(currentRoom).emit("stateUpdate",  roomForClient(room));
      io.to(currentRoom).emit("backlogUpdate", room.backlog);
    });
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room) return;
    delete room.votes[socket.id];
    io.to(currentRoom).emit("stateUpdate", roomForClient(room));
  });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`);
  // Tell all connected clients so they can show a message
  io.emit("serverShutdown", "Server is restarting. Please refresh in a moment.");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
  // Force-exit after 8 s if connections hang
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Planning Poker running at http://localhost:${PORT}`);
});