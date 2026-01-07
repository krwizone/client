const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));
app.get('/health', (req, res) => res.json({ ok: true }));

const CANVAS_W = 1200;
const CANVAS_H = 800;
const RADIUS = 20;
const MELEE_RANGE = 60;
const FIREBALL_RANGE = 320;
const FIREBALL_WIDTH = 28;
const BOT_MAX = 6;
const BOT_SPEED = 2;
const PLAYER_SPEED = 4;
const BOT_ATTACK_COOLDOWN = 600; // ms between bot attacks
const TICK_MS = 120; // server tick interval

const CLASSES = {
  warrior: { maxHp: 9, maxEnergy: 3, color: 'royalblue', skill: 'whirlwind' },
  mage: { maxHp: 8, maxEnergy: 3, color: 'crimson', skill: 'fireball' },
  guardian: { maxHp: 11, maxEnergy: 3, color: 'seagreen', skill: 'shield' },
  cleric: { maxHp: 9, maxEnergy: 3, color: 'goldenrod', skill: 'heal' }
};

const players = {}; // id -> {id,x,y,cls,hp,maxHp,energy,maxEnergy,alive,shield}
const bots = []; // {id,x,y,hp,target}
let botSeq = 0;

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function dist(a, b){ const dx = a.x - b.x; const dy = a.y - b.y; return Math.hypot(dx, dy); }
function randomPos(){
  return {
    x: Math.floor(Math.random() * (CANVAS_W - RADIUS * 2)) + RADIUS,
    y: Math.floor(Math.random() * (CANVAS_H - RADIUS * 2)) + RADIUS
  };
}

function spawnPlayer(id, cls){
  const cfg = CLASSES[cls] || CLASSES.warrior;
  const pos = randomPos();
  players[id] = {
    id,
    cls: cls in CLASSES ? cls : 'warrior',
    x: pos.x,
    y: pos.y,
    hp: cfg.maxHp,
    maxHp: cfg.maxHp,
    energy: 0,
    maxEnergy: cfg.maxEnergy,
    shield: 0,
    alive: true
  };
}

function ensureBot(){
  while (bots.length < BOT_MAX){
    const pos = randomPos();
    bots.push({ id: `bot-${botSeq++}`, x: pos.x, y: pos.y, hp: 2, cd: 0 });
  }
}

function applyDamagePlayer(targetId, amount, sourceId){
  const p = players[targetId];
  if (!p || !p.alive) return false;
  if (p.shield > 0){
    p.shield = 0;
    return true;
  }
  p.hp -= amount;
  if (p.hp <= 0){
    delete players[targetId];
    io.emit('playerLeft', targetId);
    io.emit('playerDied', targetId);
  }
  if (sourceId && players[sourceId]){
    const s = players[sourceId];
    s.energy = clamp(s.energy + 1, 0, s.maxEnergy);
  }
  return true;
}

function applyDamageBot(botId, amount, sourceId){
  const idx = bots.findIndex(b => b.id === botId);
  if (idx === -1) return false;
  bots[idx].hp -= amount;
  if (bots[idx].hp <= 0) bots.splice(idx, 1);
  if (sourceId && players[sourceId]){
    const s = players[sourceId];
    s.energy = clamp(s.energy + 1, 0, s.maxEnergy);
  }
  return true;
}

function meleeAttack(attackerId, dir){
  const me = players[attackerId];
  if (!me) return;
  const targets = [];
  for (const id in players){
    if (id === attackerId) continue;
    const p = players[id];
    if (!p) continue;
    const d = dist(me, p);
    if (d <= MELEE_RANGE) targets.push({ type: 'player', id });
  }
  bots.forEach(b => {
    const d = dist(me, b);
    if (d <= MELEE_RANGE) targets.push({ type: 'bot', id: b.id });
  });
  const hit = targets[0];
  if (!hit) return;
  if (hit.type === 'player') applyDamagePlayer(hit.id, 1, attackerId);
  else applyDamageBot(hit.id, 1, attackerId);
}

function skillWhirlwind(attackerId){
  const me = players[attackerId];
  if (!me) return;
  const radius = 80;
  for (const id in players){
    if (id === attackerId) continue;
    if (dist(me, players[id]) <= radius) applyDamagePlayer(id, 1, attackerId);
  }
  bots.slice().forEach(b => {
    if (dist(me, b) <= radius) applyDamageBot(b.id, 1, attackerId);
  });
}

function skillFireball(attackerId, dir){
  const me = players[attackerId];
  if (!me) return;
  const norm = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / norm;
  const uy = dir.y / norm;
  let best = null;
  function consider(target, id, type){
    const rx = target.x - me.x;
    const ry = target.y - me.y;
    const along = rx * ux + ry * uy;
    if (along < 0 || along > FIREBALL_RANGE) return;
    const side = Math.abs(rx * uy - ry * ux);
    if (side > FIREBALL_WIDTH) return;
    if (!best || along < best.along) best = { type, id, along };
  }
  for (const id in players){
    if (id === attackerId) continue;
    consider(players[id], id, 'player');
  }
  bots.forEach(b => consider(b, b.id, 'bot'));
  if (!best) return;
  if (best.type === 'player') applyDamagePlayer(best.id, 1, attackerId);
  else applyDamageBot(best.id, 1, attackerId);
}

function skillShield(attackerId){
  const me = players[attackerId];
  if (!me) return;
  me.shield = 1;
}

function skillHeal(attackerId){
  const me = players[attackerId];
  if (!me) return;
  me.hp = clamp(me.hp + 3, 0, me.maxHp);
}

function castSkill(attackerId, dir){
  const me = players[attackerId];
  if (!me || me.energy < me.maxEnergy) return;
  const skill = CLASSES[me.cls].skill;
  if (skill === 'whirlwind') {
    skillWhirlwind(attackerId);
    io.emit('skillFx', { id: attackerId, type: 'whirlwind' });
  }
  if (skill === 'fireball') {
    skillFireball(attackerId, dir);
    const norm = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / norm;
    const uy = dir.y / norm;
    io.emit('skillFx', { id: attackerId, type: 'fireball', ux, uy });
  }
  if (skill === 'shield') {
    skillShield(attackerId);
    io.emit('skillFx', { id: attackerId, type: 'shield' });
  }
  if (skill === 'heal') {
    skillHeal(attackerId);
    io.emit('skillFx', { id: attackerId, type: 'heal' });
  }
  me.energy = 0;
}

function moveBot(bot){
  bot.cd = Math.max(0, bot.cd - TICK_MS);
  let nearest = null;
  for (const id in players){
    const p = players[id];
    const d = dist(bot, p);
    if (!nearest || d < nearest.d) nearest = { id, d, p };
  }
  if (!nearest) return;
  const dx = nearest.p.x - bot.x;
  const dy = nearest.p.y - bot.y;
  const n = Math.hypot(dx, dy) || 1;
  bot.x = clamp(bot.x + (dx / n) * BOT_SPEED, RADIUS, CANVAS_W - RADIUS);
  bot.y = clamp(bot.y + (dy / n) * BOT_SPEED, RADIUS, CANVAS_H - RADIUS);
  if (dist(bot, nearest.p) <= MELEE_RANGE && bot.cd === 0){
    applyDamagePlayer(nearest.id, 1, null);
    bot.cd = BOT_ATTACK_COOLDOWN;
  }
}

io.on('connection', socket => {
  const id = socket.id;

  socket.on('chooseClass', data => {
    if (players[id]) return;
    const cls = data && data.cls;
    spawnPlayer(id, cls);
    socket.emit('currentPlayers', players);
    socket.emit('bots', bots);
    socket.broadcast.emit('playerJoined', players[id]);
  });

  socket.on('move', pos => {
    const me = players[id];
    if (!me) return;
    me.x = clamp(Number(pos.x) || me.x, RADIUS, CANVAS_W - RADIUS);
    me.y = clamp(Number(pos.y) || me.y, RADIUS, CANVAS_H - RADIUS);
    // Broadcast quick movement update to others to reduce perceived lag
    socket.broadcast.emit('playerMoved', me);
  });

  socket.on('attack', data => {
    const me = players[id];
    if (!me) return;
    const dir = { x: Number(data.x) - me.x, y: Number(data.y) - me.y };
    meleeAttack(id, dir);
    // Broadcast attack effect for clients to render
    io.emit('attackFx', { id, dx: dir.x, dy: dir.y });
  });

  socket.on('skill', data => {
    const me = players[id];
    if (!me) return;
    const dir = { x: Number(data.x) - me.x, y: Number(data.y) - me.y };
    castSkill(id, dir);
  });

  socket.on('disconnect', () => {
    delete players[id];
    io.emit('playerLeft', id);
  });
});

setInterval(() => {
  ensureBot();
  bots.forEach(moveBot);
}, TICK_MS);

setInterval(() => {
  io.emit('state', { players, bots });
}, 120);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
