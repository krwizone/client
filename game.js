const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
// Fixed canvas size to match map bounds
canvas.width = 2400;
canvas.height = 1600;
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
let lastDirection = { x: 1, y: 0 }; // player movement direction for arrow
let effects = []; // transient visual effects
const FIREBALL_RANGE = 320;
const FIREBALL_SPEED = 600; // px/s visual speed

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
  const worldX = pos.x + cameraX;
  const worldY = pos.y + cameraY;
  const dx = worldX - local.x;
  const dy = worldY - local.y;
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
  const worldX = pos.x + cameraX;
  const worldY = pos.y + cameraY;
  if (e.button === 0){
    socket.emit("attack", { x: worldX, y: worldY });
  } else if (e.button === 2){
    const me = players[myId];
    if (me && me.energy >= me.maxEnergy){
      socket.emit("skill", { x: worldX, y: worldY });
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
  // Local immediate effect
  addSlashEffect(myId, aim.x - me.x, aim.y - me.y);
});

bindTouchButton(skillBtn, () => {
  const me = players[myId];
  if (!me || me.energy < me.maxEnergy) return;
  const aim = aimFromLast(me);
  socket.emit('skill', { x: aim.x, y: aim.y });
  // Instant local skill FX
  if (me.cls === 'warrior') addWhirlwindEffect(myId);
  if (me.cls === 'mage') addFireballEffect(myId, lastAim.x, lastAim.y);
});

// Receive attack visual effects from server
socket.on('attackFx', data => {
  if (!data) return;
  addSlashEffect(data.id, data.dx, data.dy);
});

// Skill FX from server
socket.on('skillFx', data => {
  if (!data) return;
  if (data.type === 'whirlwind') addWhirlwindEffect(data.id);
  else if (data.type === 'fireball') addFireballEffect(data.id, data.ux, data.uy);
});

function addSlashEffect(attackerId, dx, dy){
  const ang = Math.atan2(dy, dx);
  effects.push({ type: 'slash', id: attackerId, angle: ang, t: performance.now(), dur: 220 });
}

function addWhirlwindEffect(attackerId){
  effects.push({ type: 'whirlwind', id: attackerId, t: performance.now(), dur: 320 });
}

function addFireballEffect(attackerId, ux, uy){
  const norm = Math.hypot(ux, uy) || 1;
  const vx = (ux / norm);
  const vy = (uy / norm);
  const src = players[attackerId];
  const px = attackerId === myId ? local.x : (src?.x || 0);
  const py = attackerId === myId ? local.y : (src?.y || 0);
  const dur = (FIREBALL_RANGE / FIREBALL_SPEED) * 1000;
  effects.push({ type: 'fireball', id: attackerId, x: px, y: py, ux: vx, uy: vy, t: performance.now(), dur });
}

const local = { x: 450, y: 300, speed: 4 };
let lastX = local.x;
let lastY = local.y;
let cameraX = 0;
let cameraY = 0;

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

function drawArrow(x, y, dirX, dirY, length = 24){
  const headlen = 8;
  const angle = Math.atan2(dirY, dirX);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dirX * length, y + dirY * length);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + dirX * length, y + dirY * length);
  ctx.lineTo(x + dirX * (length - headlen) - Math.sin(angle) * headlen/2, y + dirY * (length - headlen) + Math.cos(angle) * headlen/2);
  ctx.moveTo(x + dirX * length, y + dirY * length);
  ctx.lineTo(x + dirX * (length - headlen) + Math.sin(angle) * headlen/2, y + dirY * (length - headlen) - Math.cos(angle) * headlen/2);
  ctx.stroke();
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const me = players[myId];
  
  // Update camera to center on player
  if (me){
    cameraX = local.x - canvas.width / 2;
    cameraY = local.y - canvas.height / 2;
  }
  
  ctx.save();
  ctx.translate(-cameraX, -cameraY);

  // Draw background outside map (darker)
  const mapW = 2400;
  const mapH = 1600;
  ctx.fillStyle = '#8b7355';
  ctx.fillRect(cameraX - 500, cameraY - 500, canvas.width + 1000, canvas.height + 1000);
  
  // Draw map area (lighter)
  ctx.fillStyle = '#d2b48c';
  ctx.fillRect(0, 0, mapW, mapH);
  
  // Draw map border
  ctx.strokeStyle = '#5c4033';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, mapW, mapH);

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
    let dx = 0, dy = 0;
    if (keys.w) { dy -= local.speed; }
    if (keys.s) { dy += local.speed; }
    if (keys.a) { dx -= local.speed; }
    if (keys.d) { dx += local.speed; }
    if (joy.active){
      dx += local.speed * joy.dx;
      dy += local.speed * joy.dy;
    }
    // Update direction if moving
    const moveLen = Math.hypot(dx, dy);
    if (moveLen > 0){
      lastDirection = { x: dx / moveLen, y: dy / moveLen };
    }
    local.x += dx;
    local.y += dy;
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
    if (id === myId){
      drawArrow(px, py, lastDirection.x, lastDirection.y);
    }
    if (p.shield > 0){
      ctx.strokeStyle = "#0ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 24, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // Draw effects
  const now = performance.now();
  effects = effects.filter(e => now - e.t < e.dur);
  effects.forEach(e => {
    const src = players[e.id];
    if (!src) return;
    const px = e.id === myId ? local.x : src.x;
    const py = e.id === myId ? local.y : src.y;
    const prog = (now - e.t) / e.dur; // 0..1
    const alpha = 1 - prog;
    const radius = 22 + prog * 16;
    ctx.save();
    if (e.type === 'slash'){
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, radius, e.angle - 0.7 + prog*0.2, e.angle + 0.7 - prog*0.2);
      ctx.stroke();
    } else if (e.type === 'whirlwind'){
      const r = 28 + prog * 60; // match server radius ~80
      ctx.strokeStyle = `rgba(135,206,250,${alpha})`;
      ctx.lineWidth = 4;
      for (let i=0;i<3;i++){
        const off = i*0.6;
        ctx.beginPath();
        ctx.arc(px, py, r, off, off+0.9);
        ctx.stroke();
      }
    } else if (e.type === 'fireball'){
      // Move ball along direction
      const dist = Math.min(FIREBALL_RANGE, FIREBALL_SPEED * (now - e.t) / 1000);
      const bx = e.x + e.ux * dist;
      const by = e.y + e.uy * dist;
      const grad = ctx.createRadialGradient(bx, by, 4, bx, by, 14);
      grad.addColorStop(0, `rgba(255,200,80,${alpha})`);
      grad.addColorStop(1, `rgba(255,80,0,${alpha*0.7})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, 12, 0, Math.PI*2);
      ctx.fill();
      // faint trail
      ctx.strokeStyle = `rgba(255,140,0,${alpha*0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.restore();
  });

  ctx.restore();

  // HUD (drawn in screen space after restoring transform)
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
