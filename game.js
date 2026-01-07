// Connect to same-origin Socket.IO server
const socket = io();

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const player = {
  x: 450,
  y: 300,
  speed: 4,
  id: null
};

const players = {};

socket.on("currentPlayers", data => {
  Object.assign(players, data);
});

socket.on("playerJoined", p => players[p.id] = p);
socket.on("playerLeft", id => delete players[id]);

socket.on("playerMoved", p => {
  // Accept movement updates regardless of prior existence
  players[p.id] = p;
});

socket.on("connect", () => {
  player.id = socket.id;
});

// Smooth movement: track key state and update in the frame loop
const keys = { w: false, a: false, s: false, d: false };
document.addEventListener("keydown", e => {
  if (e.key in keys) keys[e.key] = true;
});
document.addEventListener("keyup", e => {
  if (e.key in keys) keys[e.key] = false;
});

function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

let lastX = player.x;
let lastY = player.y;

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Apply movement per frame
  if (keys.w) player.y -= player.speed;
  if (keys.s) player.y += player.speed;
  if (keys.a) player.x -= player.speed;
  if (keys.d) player.x += player.speed;

  // Keep player within bounds considering radius 20
  player.x = clamp(player.x, 20, canvas.width - 20);
  player.y = clamp(player.y, 20, canvas.height - 20);

  // Emit move only if position changed
  if (player.x !== lastX || player.y !== lastY){
    lastX = player.x;
    lastY = player.y;
    socket.emit("move", { x: player.x, y: player.y });
  }

  for(const id in players){
    const p = players[id];
    ctx.fillStyle = id === player.id ? "blue" : "red";
    ctx.beginPath();
    ctx.arc(p.x,p.y,20,0,Math.PI*2);
    ctx.fill();
  }

  requestAnimationFrame(draw);
}
draw();
