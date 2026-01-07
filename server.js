const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (index.html, game.js) from current folder
app.use(express.static(__dirname));

// Simple health check
app.get('/health', (req, res) => res.json({ ok: true }));

// In-memory players
const players = {}; // id -> { id, x, y }
const CANVAS_W = 900;
const CANVAS_H = 600;
const RADIUS = 20;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

io.on('connection', socket => {
  const id = socket.id;
  // Spawn new player within bounds
  const x = Math.floor(Math.random() * (CANVAS_W - RADIUS * 2)) + RADIUS;
  const y = Math.floor(Math.random() * (CANVAS_H - RADIUS * 2)) + RADIUS;
  players[id] = { id, x, y };

  // Send current roster to the new client
  socket.emit('currentPlayers', players);
  // Inform others about the new player
  socket.broadcast.emit('playerJoined', players[id]);

  // Movement updates from client
  socket.on('move', pos => {
    if (!players[id]) return;
    const nx = clamp(Number(pos.x) || players[id].x, RADIUS, CANVAS_W - RADIUS);
    const ny = clamp(Number(pos.y) || players[id].y, RADIUS, CANVAS_H - RADIUS);
    players[id].x = nx;
    players[id].y = ny;
    // Broadcast to all (including sender) for consistency
    io.emit('playerMoved', players[id]);
  });

  socket.on('disconnect', () => {
    delete players[id];
    io.emit('playerLeft', id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
