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

const joy = { active: false, dx: 0, dy: 0, max: 50 };
const joyEl = document.getElementById("joystick");
const stickEl = document.getElementById("stick");
let joyCx = 0, joyCy = 0;

function setStick(dx, dy){
  const d = Math.hypot(dx, dy);
  const lim = Math.min(d, joy.max);
  const a = Math.atan2(dy, dx);
  const nx = Math.cos(a) * lim;
  const ny = Math.sin(a) * lim;
  stickEl.style.left = `calc(50% + ${nx}px)`;
  stickEl.style.top = `calc(50% + ${ny}px)`;
  joy.dx = nx / joy.max;
  joy.dy = ny / joy.max;
}

function resetStick(){
  joy.active = false;
  joy.dx = 0;
  joy.dy = 0;
  if (stickEl){
    stickEl.style.left = `50%`;
    stickEl.style.top = `50%`;
  }
}

if (joyEl){
  joyEl.addEventListener("touchstart", e => {
    e.preventDefault();
    joy.active = true;
    const t = e.touches[0];
    const r = joyEl.getBoundingClientRect();
    joyCx = r.left + r.width/2;
    joyCy = r.top + r.height/2;
    setStick(t.clientX - joyCx, t.clientY - joyCy);
  }, { passive: false });
  joyEl.addEventListener("touchmove", e => {
    if (!joy.active) return;
    e.preventDefault();
    const t = e.touches[0];
    setStick(t.clientX - joyCx, t.clientY - joyCy);
  }, { passive: false });
  joyEl.addEventListener("touchend", () => {
    resetStick();
  });
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

  if (joy.active){
    player.x += player.speed * joy.dx;
    player.y += player.speed * joy.dy;
  }

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
