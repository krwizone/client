const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const classSelect = document.getElementById("class-select");
const attackBtn = document.getElementById("btn-attack");
const skillBtn = document.getElementById("btn-skill");

const CLASS_INFO = {
  warrior: { label: "Warrior", color: "royalblue" },
  mage: { label: "Mage", color: "crimson" },
  guardian: { label: "Guardian", color: "seagreen" },
  cleric: { label: "Cleric", color: "goldenrod" }
};

const players = {};
let bots = [];
let myId = null;
let selectedClass = null;
let lastAim = { x: 1, y: 0 };

const keys = { w: false, a: false, s: false, d: false };
document.addEventListener("keydown", e => { if (e.key in keys) keys[e.key] = true; });
document.addEventListener("keyup", e => { if (e.key in keys) keys[e.key] = false; });

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

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
  if (stickEl){
    stickEl.style.left = `calc(50% + ${nx}px)`;
    stickEl.style.top = `calc(50% + ${ny}px)`;
  }
  joy.dx = nx / joy.max;
  joy.dy = ny / joy.max;
  if (Math.hypot(joy.dx, joy.dy) > 0.15){
    lastAim = { x: joy.dx, y: joy.dy };
  }
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
  joyEl.addEventListener("touchend", () => { resetStick(); });
}

function canvasPos(evt){
  const r = canvas.getBoundingClientRect();
  return { x: evt.clientX - r.left, y: evt.clientY - r.top };
}

canvas.addEventListener('mousemove', e => {
  const me = players[myId];
  if (!me) return;
  const pos = canvasPos(e);
  const dx = pos.x - me.x;
  const dy = pos.y - me.y;
  const n = Math.hypot(dx, dy) || 1;
  lastAim = { x: dx / n, y: dy / n };
});

function chooseClass(cls){
  selectedClass = cls;
  classSelect.style.display = "none";
  socket.emit("chooseClass", { cls });
}

document.querySelectorAll('[data-class]').forEach(btn => {
  btn.addEventListener('click', () => chooseClass(btn.dataset.class));
});

socket.on("connect", () => { myId = socket.id; });

let spawnedLocal = false;
socket.on("currentPlayers", data => {
  Object.keys(players).forEach(k => delete players[k]);
  Object.assign(players, data || {});
  const me = players[myId];
  if (me && !spawnedLocal){
    local.x = me.x; local.y = me.y; spawnedLocal = true;
  }
  if (!players[myId]) classSelect.style.display = "flex";
});

socket.on("bots", data => { bots = data || []; });
socket.on("state", data => {
  Object.keys(players).forEach(k => delete players[k]);
  Object.assign(players, data.players || {});
  bots = data.bots || [];
  if (!players[myId]){
    classSelect.style.display = "flex";
  }
});

socket.on("playerMoved", p => {
  if (!p || !p.id) return;
  const cur = players[p.id] || {};
  players[p.id] = { ...cur, ...p };
});

socket.on("playerJoined", p => players[p.id] = p);
socket.on("playerLeft", id => delete players[id]);

canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("mousedown", e => {
  if (!players[myId]) return;
  const pos = canvasPos(e);
  if (e.button === 0){
    socket.emit("attack", { x: pos.x, y: pos.y });
  } else if (e.button === 2){
    const me = players[myId];
    if (me && me.energy >= me.maxEnergy){
      socket.emit("skill", { x: pos.x, y: pos.y });
    }
  }
});

function aimFromLast(me){
  const aim = { x: me.x + lastAim.x * 80, y: me.y + lastAim.y * 80 };
  return aim;
}

function bindTouchButton(btn, handler){
  if (!btn) return;
  btn.addEventListener('touchstart', e => {
    e.preventDefault();
    handler();
  }, { passive: false });
  btn.addEventListener('click', e => {
    e.preventDefault();
    handler();
  });
}

bindTouchButton(attackBtn, () => {
  const me = players[myId];
  if (!me) return;
  const aim = aimFromLast(me);
  socket.emit('attack', { x: aim.x, y: aim.y });
});

bindTouchButton(skillBtn, () => {
  const me = players[myId];
  if (!me || me.energy < me.maxEnergy) return;
  const aim = aimFromLast(me);
  socket.emit('skill', { x: aim.x, y: aim.y });
});

const local = { x: 450, y: 300, speed: 4 };
let lastX = local.x;
let lastY = local.y;

function drawBars(entity){
  const barW = 40;
  const barH = 6;
  const hpRatio = entity.hp / entity.maxHp;
  ctx.fillStyle = "#400";
  ctx.fillRect(entity.x - barW/2, entity.y - 32, barW, barH);
  ctx.fillStyle = "#0f0";
  ctx.fillRect(entity.x - barW/2, entity.y - 32, barW * hpRatio, barH);

  const energyRatio = entity.energy / entity.maxEnergy;
  ctx.fillStyle = "#002";
  ctx.fillRect(entity.x - barW/2, entity.y - 24, barW, barH);
  ctx.fillStyle = "#0ff";
  ctx.fillRect(entity.x - barW/2, entity.y - 24, barW * energyRatio, barH);
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const me = players[myId];
  if (me && spawnedLocal){
    // Soft-correct local position toward server to avoid drift
    const dx = me.x - local.x;
    const dy = me.y - local.y;
    const err = Math.hypot(dx, dy);
    if (err > 100){
      // Large divergence: snap
      local.x = me.x; local.y = me.y;
    } else {
      // Gentle convergence
      local.x += dx * 0.15;
      local.y += dy * 0.15;
    }
  }

  if (me){
    if (keys.w) local.y -= local.speed;
    if (keys.s) local.y += local.speed;
    if (keys.a) local.x -= local.speed;
    if (keys.d) local.x += local.speed;
    if (joy.active){
      local.x += local.speed * joy.dx;
      local.y += local.speed * joy.dy;
    }
    local.x = clamp(local.x, 20, canvas.width - 20);
    local.y = clamp(local.y, 20, canvas.height - 20);
    if (local.x !== lastX || local.y !== lastY){
      lastX = local.x; lastY = local.y;
      socket.emit("move", { x: local.x, y: local.y });
    }
  }

  // Draw bots
  bots.forEach(b => {
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 18, 0, Math.PI*2);
    ctx.fill();
  });

  // Draw players (self rendered from predicted local position)
  for (const id in players){
    const p = players[id];
    const info = CLASS_INFO[p.cls] || { color: "red" };
    const px = id === myId ? local.x : p.x;
    const py = id === myId ? local.y : p.y;
    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.arc(px, py, 20, 0, Math.PI*2);
    ctx.fill();
    drawBars({ ...p, x: px, y: py });
    if (p.shield > 0){
      ctx.strokeStyle = "#0ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 24, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // HUD
  if (me){
    ctx.fillStyle = "#000";
    ctx.font = "16px sans-serif";
    ctx.fillText(`Class: ${CLASS_INFO[me.cls]?.label || me.cls}`, 10, 20);
    ctx.fillText(`HP: ${me.hp}/${me.maxHp}  Energy: ${me.energy}/${me.maxEnergy}`, 10, 40);
    if (me.energy >= me.maxEnergy) ctx.fillText("Skill Ready (Right Click)", 10, 60);
  } else {
    ctx.fillStyle = "#000";
    ctx.font = "18px sans-serif";
    ctx.fillText("Select a class to spawn", 10, 24);
  }

  requestAnimationFrame(draw);
}

draw();
