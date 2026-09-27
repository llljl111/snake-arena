const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const PORT = 3000;
const GRID = 20;
const SPEED = 150; // 每步间隔 ms
const GAME_DURATION = 180; // 3分钟
const AUTO_START_AFTER = 5000; // 等待5秒自动开始（≥5人时）
const MAX_ROOMS = 200; // 全局最大房间数

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>贪吃蛇大作战</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
body { background:#1a1a2e; color:#fff; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; overflow:hidden; user-select:none; }
#app { display:flex; flex-direction:column; align-items:center; width:100%; max-width:500px; }
#login { display:flex; flex-direction:column; gap:10px; width:80%; }
#login input { padding:12px; border:none; border-radius:8px; font-size:16px; background:#16213e; color:#fff; }
#login button { padding:12px; border:none; border-radius:8px; font-size:18px; background:#e94560; color:#fff; cursor:pointer; }
#game { display:none; width:100%; flex-direction:column; align-items:center; gap:10px; }
#info { display:flex; justify-content:space-between; width:100%; padding:0 10px; font-size:14px; }
#canvas { background:#16213e; border:2px solid #e94560; border-radius:8px; width:min(95vw, 95vh, 500px); aspect-ratio:1; display:block; }
#controls { display:flex; gap:20px; align-items:center; margin-top:10px; }
#btnBoost { width:60px; height:60px; border-radius:50%; border:none; background:#e94560; color:#fff; font-size:14px; font-weight:bold; cursor:pointer; touch-action:none; }
#ranking { font-size:13px; white-space:pre-wrap; line-height:1.4; }
#roomInfo { font-size:14px; }
</style>
</head>
<body>
<div id="app">
  <div id="login">
    <h2>🐍 贪吃蛇大作战</h2>
    <input id="nickname" placeholder="昵称" maxlength="8">
    <input id="roomInput" placeholder="房间号" maxlength="6">
    <button onclick="join()">进入房间</button>
  </div>
  <div id="game">
    <div id="info">
      <span id="roomInfo"></span>
      <span id="timer">等待开局</span>
    </div>
    <canvas id="canvas"></canvas>
    <div id="controls">
      <button id="btnBoost" ontouchstart="boost(true)" ontouchend="boost(false)" onmousedown="boost(true)" onmouseup="boost(false)">加速</button>
    </div>
    <div id="ranking"></div>
  </div>
</div>
<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let grid;
let state = null;
let playerId = null;
let pendingDir = null;
let boosting = false;

function join() {
  const name = document.getElementById('nickname').value.trim();
  const room = document.getElementById('roomInput').value.trim();
  if (!name || !room) { alert('请填写昵称和房间号'); return; }
  socket.emit('join', { name, room });
}

socket.on('init', ({ id, room, mapSize }) => {
  playerId = id;
  grid = mapSize;
  canvas.width = 400;
  canvas.height = 400;
  document.getElementById('login').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  document.getElementById('roomInfo').textContent = '房间号: ' + room;
});

socket.on('state', (s) => {
  state = s;
});

socket.on('error', (msg) => {
  alert(msg);
  location.reload();
});

function boost(on) { boosting = on; socket.emit('boost', on); }

document.addEventListener('keydown', (e) => {
  switch(e.key) {
    case 'ArrowUp': e.preventDefault(); sendDir('up'); break;
    case 'ArrowDown': e.preventDefault(); sendDir('down'); break;
    case 'ArrowLeft': e.preventDefault(); sendDir('left'); break;
    case 'ArrowRight': e.preventDefault(); sendDir('right'); break;
    case ' ': e.preventDefault(); boosting = true; socket.emit('boost', true); break;
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === ' ') { boosting = false; socket.emit('boost', false); }
});

let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY };
});
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
  let dir;
  if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
  else dir = dy > 0 ? 'down' : 'up';
  sendDir(dir);
  touchStart = null;
});

function sendDir(d) {
  if (!state || state.status !== 'playing') return;
  const me = state.players.find(p => p.id === playerId);
  if (!me || me.alive !== true) return;
  socket.emit('dir', d);
}

function draw() {
  requestAnimationFrame(draw);
  if (!state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 网格
  ctx.strokeStyle = '#0f3460';
  ctx.lineWidth = 0.5;
  const size = canvas.width / grid;
  for (let i = 0; i <= grid; i++) {
    ctx.beginPath(); ctx.moveTo(i*size, 0); ctx.lineTo(i*size, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*size); ctx.lineTo(canvas.width, i*size); ctx.stroke();
  }
  // 食物
  ctx.fillStyle = '#ffd700';
  for (const f of state.foods) {
    ctx.fillRect(f.x*size+1, f.y*size+1, size-2, size-2);
  }
  // 蛇
  for (const p of state.players) {
    if (!p.alive) continue;
    ctx.fillStyle = p.id === playerId ? '#00ff88' : '#56ccf2';
    for (const seg of p.body) {
      ctx.fillRect(seg.x*size+1, seg.y*size+1, size-2, size-2);
    }
  }
  // 排名
  const ranking = [...state.players].sort((a,b) => b.score - a.score);
  const text = ranking.map((p,i) => `${i+1}. ${p.name} (${p.score})`).join('\n');
  document.getElementById('ranking').textContent = text;
  // 计时器
  if (state.status === 'waiting') {
    document.getElementById('timer').textContent = '等待开局...';
  } else if (state.status === 'playing') {
    const remain = Math.ceil((state.endAt - Date.now())/1000);
    document.getElementById('timer').textContent = remain + 's';
  } else {
    document.getElementById('timer').textContent = '已结束';
  }
}
draw();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200); res.end('OK');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

const io = new Server(server);

// 游戏房间管理
const rooms = new Map(); // roomId -> room

// 清理空房间，保证计数准确
function cleanupEmptyRooms() {
  for (const [id, room] of rooms) {
    if (room.players.size === 0) {
      clearTimeout(room.timer);
      clearInterval(room.gameLoop);
      rooms.delete(id);
    }
  }
}

function roomUpdate(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players = [...room.players.values()].filter(p => p.socket.connected);
  if (room.players.length === 0) {
    rooms.delete(roomId);
    return;
  }
  if (room.players.length >= 5 && room.status === 'waiting' && !room.timer) {
    room.timer = setTimeout(() => {
      startGame(roomId);
    }, AUTO_START_AFTER);
  }
  broadcast(roomId);
}

function startGame(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'waiting' || room.players.length < 5) return;
  room.status = 'playing';
  room.endAt = Date.now() + GAME_DURATION * 1000;
  // 生成蛇
  room.players.forEach((p, i) => {
    const x = Math.floor(GRID/2) + (i - room.players.length/2) * 2;
    const y = Math.floor(GRID/2);
    p.body = [];
    for (let j=0; j<3; j++) p.body.push({x: x, y: y+j});
    p.dir = {x: 0, y: -1};
    p.nextDir = {x: 0, y: -1};
    p.alive = true;
    p.score = 0;
    p.speed = SPEED;
  });
  room.foods = [];
  for (let i=0; i<8; i++) addFood(roomId);
  room.gameLoop = setInterval(() => stepRoom(roomId), SPEED);
}

function stepRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') return;
  if (Date.now() >= room.endAt) {
    endGame(roomId);
    return;
  }
  const positions = new Set();
  for (const p of room.players) {
    if (!p.alive) continue;
    p.dir = p.nextDir;
    const head = p.body[0];
    const newHead = { x: head.x + p.dir.x, y: head.y + p.dir.y };
    // 撞墙
    if (newHead.x < 0 || newHead.y < 0 || newHead.x >= GRID || newHead.y >= GRID) {
      p.alive = false;
      continue;
    }
    // 撞自己或别人（先排除尾巴）
    const bodySet = new Set();
    for (const q of room.players) {
      if (!q.alive) continue;
      for (const seg of q.body) bodySet.add(seg.x + ',' + seg.y);
    }
    if (bodySet.has(newHead.x + ',' + newHead.y)) {
      p.alive = false;
      continue;
    }
    p.body.unshift(newHead);
    // 吃食物
    const foodIdx = room.foods.findIndex(f => f.x === newHead.x && f.y === newHead.y);
    if (foodIdx >= 0) {
      room.foods.splice(foodIdx, 1);
      p.score += 10;
      addFood(roomId);
    } else {
      p.body.pop();
    }
  }
  // 检查是否只剩一人
  const alive = room.players.filter(p => p.alive);
  if (alive.length <= 1) {
    endGame(roomId);
    return;
  }
  broadcast(roomId);
}

function endGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.status = 'over';
  clearInterval(room.gameLoop);
  room.gameLoop = null;
  setTimeout(() => resetRoom(roomId), 3000);
  broadcast(roomId);
}

function resetRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.status = 'waiting';
  room.endAt = null;
  room.timer = null;
  room.players.forEach(p => { p.alive = false; p.body = []; });
  room.foods = [];
  broadcast(roomId);
}

function addFood(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  let x, y;
  do {
    x = Math.floor(Math.random() * GRID);
    y = Math.floor(Math.random() * GRID);
  } while (room.players.some(p => p.body.some(s => s.x === x && s.y === y)) || room.foods.some(f => f.x === x && f.y === y));
  room.foods.push({x, y});
}

function broadcast(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const state = {
    status: room.status,
    endAt: room.endAt,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      body: p.body,
      alive: p.alive,
      score: p.score
    })),
    foods: room.foods
  };
  room.players.forEach(p => {
    p.socket.emit('state', state);
  });
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join', ({ name, room: roomId }) => {
    if (!name || !roomId) { socket.emit('error', '昵称和房间号不能为空'); return; }
    if (currentRoom) {
      socket.leave(currentRoom);
      const old = rooms.get(currentRoom);
      if (old) { old.players.delete(socket.id); roomUpdate(currentRoom); }
    }
    currentRoom = roomId;
    // === 新增：全局最多 200 个房间 ===
    cleanupEmptyRooms(); // 先清理空房间，确保计数准确
    if (!rooms.has(roomId) && rooms.size >= MAX_ROOMS) {
      socket.emit('error', '当前房间数已达上限（200个），请稍后再试或加入其他房间');
      return;
    }
    // ================================
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        players: new Map(),
        foods: [],
        status: 'waiting',
        endAt: null,
        timer: null,
        gameLoop: null
      });
    }
    const room = rooms.get(roomId);
    if (room.players.size >= 10) {
      socket.emit('error', '房间已满');
      return;
    }
    socket.join(roomId);
    const player = { id: socket.id, name, socket, body: [], alive: false, score: 0, dir: {x:0,y:0}, nextDir: {x:0,y:0} };
    room.players.set(socket.id, player);
    socket.emit('init', { id: socket.id, room: roomId, mapSize: GRID });
    roomUpdate(roomId);
  });

  socket.on('dir', (d) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return;
    const dirMap = { up: {x:0,y:-1}, down: {x:0,y:1}, left: {x:-1,y:0}, right: {x:1,y:0} };
    const nd = dirMap[d];
    if (!nd) return;
    // 禁止直接掉头
    if (p.dir.x + nd.x === 0 && p.dir.y + nd.y === 0) return;
    p.nextDir = nd;
  });

  socket.on('boost', (on) => {
    // 简化为不影响速度，可拓展功能
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.players.delete(socket.id);
        roomUpdate(currentRoom);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Snake game running at http://0.0.0.0:${PORT}`);
});
