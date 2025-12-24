const socket = io("https://YOUR-RENDER-SERVER.onrender.com");

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
  if (players[p.id])
    players[p.id] = p;
});

socket.on("connect", () => {
  player.id = socket.id;
});

document.addEventListener("keydown", e => {
  if (e.key === "w") player.y -= player.speed;
  if (e.key === "s") player.y += player.speed;
  if (e.key === "a") player.x -= player.speed;
  if (e.key === "d") player.x += player.speed;

  socket.emit("move", { x: player.x, y: player.y });
});

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

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
