'use strict';
/* =========================================================
   arena —— 竞技场模式
   ---------------------------------------------------------
   打完考场全部 200 名保安、穿过门口那片白光之后，不是结算，
   而是被传送进一座永不停歇的斗技场：一波接一波的保安从
   四面八方涌入，人数越来越多、重装和快速型越来越常见，
   直到你被抓住为止。是一场真正的个人战。
   入口：combat.js walkOutOfTheRoom -> enterArena()
   ========================================================= */

const ARENA_HW = 11.5, ARENA_HD = 11.5;   /* 玩家活动边界（±，碰撞墙） */
const ARENA_FENCE = 12.6;                 /* 围栏视觉半径（x / z 向） */
const ARENA_WAVE_MAX = 14;                /* 单波人数上限 */

let arenaScene = null;
let arenaWave = 0;            /* 当前波次（0 = 尚未开场） */
let arenaAlive = 0;           /* 本波存活保安数 */
let arenaKills = 0;           /* 竞技场累计击杀 */
let arenaWavePending = false; /* 下一波正在倒数，防重复触发 */

/* 世界边界（教室 / 竞技场动态取值）：look.js 的 clamp 与小地图都走这里 */
function getWorldBounds(){
  return (typeof state !== 'undefined' && state.arenaMode)
    ? { hw: ARENA_HW, hd: ARENA_HD }
    : { hw: 7.5, hd: 6.5 };
}

/* 当前该渲染的世界场景：postfx.js 世界层走这里，UI 层仍渲染 scene */
function activeWorldScene(){
  return (typeof state !== 'undefined' && state.arenaMode && arenaScene)
    ? arenaScene : scene;
}

/* 单波人数：第 1 波 4 人起，每波 +2，上限 ARENA_WAVE_MAX */
function arenaWaveSize(w){
  return Math.min(4 + (w - 1) * 2, ARENA_WAVE_MAX);
}

/* 竞技场保安速度：随波次整体变快；fast 极快、heavy 慢但血厚 */
function arenaGuardSpeed(w, type){
  /* 波次越高冲得越狠：第 10 波起全员接近玩家疾跑速度 */
  const waveMul = 1 + Math.min(1.0, (w - 1) * 0.09);
  if (type === 'heavy') return 0.55 * Math.min(1.5, waveMul);
  if (type === 'fast')  return 1.45 * Math.min(1.6, waveMul);
  return 0.95 * waveMul;
}

/* 竞技场种类掷骰：波次越高，重装 / 快速越常见 */
function arenaGuardType(){
  const r = Math.random();
  const heavyP = Math.min(0.28, 0.07 + arenaWave * 0.02);
  const fastP  = Math.min(0.45, 0.22 + arenaWave * 0.025);
  if (r < heavyP) return 'heavy';
  if (r < heavyP + fastP) return 'fast';
  return 'normal';
}

/* 竞技场保安入场（教室补员仍走 world.js 的 spawnTwoGuards） */
function spawnArenaGuards(n){
  /* 竞技场不靠补员清理死守卫，入场前主动 prune 防数组膨胀 */
  if (typeof pruneDeadGuards === 'function') pruneDeadGuards();
  /* 以玩家当前站位为中心包抄：每一波都是包围圈，没有安全打靶位 */
  const px = state.pos.x, pz = state.pos.z;
  for (let i = 0; i < n; i++){
    const angle = Math.random() * Math.PI * 2;
    const dist = 6.5 + Math.random() * 3.0;
    const gx = clamp(px + Math.cos(angle) * dist, -ARENA_HW + 1.2, ARENA_HW - 1.2);
    const gz = clamp(pz + Math.sin(angle) * dist, -ARENA_HD + 1.2, ARENA_HD - 1.2);

    const type = (typeof arenaGuardType === 'function')
      ? arenaGuardType()
      : (typeof rollGuardType === 'function' ? rollGuardType() : 'normal');
    const g = buildSecurityGuard(gx, gz, type, arenaScene);
    g.userData = {
      speed: arenaGuardSpeed(arenaWave, type),
      alive: true,
      type: type,
      hp: type === 'heavy' ? 2 : 1
    };
    securityGuards.push(g);
    state.guardsSpawned = (state.guardsSpawned || 0) + 1;
  }
}

/* =========================================================
   场景搭建
   ========================================================= */
function buildArena(){
  arenaScene = new THREE.Scene();
  arenaScene.background = new THREE.Color(0x120608);
  arenaScene.fog = new THREE.FogExp2(0x120608, 0.012);

  /* 地面：外圈血污平台 */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_FENCE * 2, ARENA_FENCE * 2),
    mat(0x1b111a, { roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  arenaScene.add(floor);

  const grid = new THREE.GridHelper(ARENA_FENCE * 2, 18, 0x4a2230, 0x2a141e);
  grid.position.y = 0.005;
  arenaScene.add(grid);

  /* 中央红环（加法发光，标记出生点） */
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 1.86, 48),
    new THREE.MeshBasicMaterial({
      color: 0xff3b30, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  arenaScene.add(ring);

  /* 围栏：圆柱 + 柱顶红灯球，分布在四周 */
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a33, roughness: 0.6, metalness: 0.5
  });
  const postGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.5, 10);
  const ballGeo = getSphereGeo(0.22, 12, 10);
  const ballMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const slots = [];
  for (const s of [-1, 1]){
    slots.push([s * ARENA_FENCE, 0], [0, s * ARENA_FENCE],
               [s * ARENA_FENCE, s * ARENA_FENCE],
               [s * ARENA_FENCE * 0.5, s * ARENA_FENCE],
               [s * ARENA_FENCE, s * ARENA_FENCE * 0.5]);
  }
  for (const [px, pz] of slots){
    const post = new THREE.Mesh(postGeo, fenceMat);
    post.position.set(px, 0.75, pz);
    arenaScene.add(post);
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.set(px, 1.62, pz);
    arenaScene.add(ball);
    addObstacle(px, pz, 0.35, 0.35);
  }

  /* 碰撞墙（玩家 clamp 边界） */
  addObstacle(0, -ARENA_HW - 0.6, ARENA_HW + 2, 0.5);
  addObstacle(0,  ARENA_HW + 0.6, ARENA_HW + 2, 0.5);
  addObstacle(-ARENA_HW - 0.6, 0, 0.5, ARENA_HW + 2);
  addObstacle( ARENA_HW + 0.6, 0, 0.5, ARENA_HW + 2);

  /* 四角掩体箱：绕柱周旋的战术掩体 */
  const crateTops = [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]];
  for (const [cx, cz] of crateTops){
    const c = new THREE.Group();
    c.position.set(cx, 0, cz);
    box(1.6, 1.15, 1.6, 0x3a2b3a, 0, 0.575, 0, c, { roughness: 0.85 });
    box(1.7, 0.05, 1.7, 0x2a1f20, 0, 1.15, 0, c);
    arenaScene.add(c);
    addObstacle(cx, cz, 0.9, 0.9);
  }

  /* 灯光：四角红灯 + 中央罩顶 */
  for (const [lx, lz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]){
    const pl = new THREE.PointLight(0xff2a1f, 0.55, 22, 2);
    pl.position.set(lx, 3.4, lz);
    arenaScene.add(pl);
  }
  const top = new THREE.PointLight(0xffe0d0, 0.5, 26, 2);
  top.position.set(0, 4.2, 0);
  arenaScene.add(top);
}

/* =========================================================
   进入竞技场
   ========================================================= */
function enterArena(){
  if (state.ended || state.arenaMode || !state.started) return;

  /* 收掉还可能开着的终局弹窗 */
  dismissDialogs();

  /* ---- 教室场务清理：NPC / 老师 / 保安 / 掉落 / 投掷物 / 障碍 ---- */
  for (const g of securityGuards){
    if (g.group.parent) g.group.parent.remove(g.group);
  }
  securityGuards.length = 0;
  for (const n of npcs){
    if (n.group.parent) n.group.parent.remove(n.group);
  }
  npcs.length = 0;
  if (teacher){
    if (teacher.group.parent) teacher.group.parent.remove(teacher.group);
    teacher = null;
  }
  if (typeof clearThrows === 'function') clearThrows();
  if (typeof wpPickups !== 'undefined'){
    for (const w of wpPickups){
      if (w.group.parent) w.group.parent.remove(w.group);
    }
    wpPickups.length = 0;
  }
  if (typeof lootList !== 'undefined' && typeof removeLoot === 'function'){
    while (lootList.length) removeLoot(lootList[0]);
  }
  if (typeof interactables !== 'undefined') interactables.length = 0;
  obstacles.length = 0;

  /* ---- 建场景 + 传送 ---- */
  buildArena();
  state.arenaMode = true;

  state.pos.x = 0;
  state.pos.z = 0;
  yawTarget = state.yaw = 0;
  pitchTarget = state.pitch = 0;
  jumpY = 0; velY = 0; onGround = true;

  /* 第一人称武器视图跟着进竞技场 */
  if (typeof weaponView !== 'undefined' && weaponView){
    if (weaponView.parent) weaponView.parent.remove(weaponView);
    arenaScene.add(weaponView);
  }

  /* 画面复位：教室里的血腥记忆不带进竞技场，一眼回到刚进游戏 */
  tension = 0;

  /* ---- HUD 与开场 ---- */
  arenaWave = 0;
  arenaKills = 0;
  arenaAlive = 0;
  updateArenaHud();
  const ah = $('arenaHud');
  if (ah) ah.classList.remove('hidden');

  toast('\u2694 白光吞没一切。你再睁眼时，脚下是竞技场。', 3000);
  audio.beep(220, 0.5, 0.07, 'sawtooth');
  audio.beep(110, 0.6, 0.06, 'sawtooth');
  setTimeout(() => {
    if (state.ended || !state.arenaMode) return;
    startArenaWave();
  }, 1100);
}

/* =========================================================
   波次管理
   ========================================================= */
function startArenaWave(){
  arenaWave++;
  const n = arenaWaveSize(arenaWave);
  arenaAlive = n;
  spawnArenaGuards(n);
  updateArenaHud();
  toast(`\u26A0 第 ${arenaWave} 波 · ${n} 名保安冲进竞技场！`, 2400);
  audio.beep(140, 0.4, 0.07, 'sawtooth');
  if (arenaWave === 1){
    setTimeout(() => {
      if (state.ended || !state.arenaMode) return;
      toast('竞技场守则：不要停，打到没有下一波。', 3400);
    }, 2600);
  }
  if (arenaWave === 10 && typeof unlockAch === 'function') unlockAch('arena10');
}

/* killGuard 钩子：竞技场击杀计数与波次推进（combat.js 调用） */
function arenaHookKill(){
  if (!state.arenaMode) return;
  arenaKills++;
  arenaAlive = Math.max(0, arenaAlive - 1);
  updateArenaHud();

  if (arenaAlive <= 0 && !arenaWavePending){
    arenaWavePending = true;
    setTimeout(() => {
      arenaWavePending = false;
      if (state.ended || !state.arenaMode) return;
      const bounty = 20 + arenaWave * 5;
      state.totalScore = (state.totalScore || 0) + bounty;
      toast(`\u{1F3C6} 第 ${arenaWave} 波清空！奖励 ${bounty} 分，下一波正在入场……`, 2600);
      audio.beep(523, 0.12, 0.05, 'sine');
      setTimeout(() => {
        if (state.ended || !state.arenaMode) return;
        startArenaWave();
      }, 1500);
    }, 1000);
  }
}

function updateArenaHud(){
  const w = $('arenaWave'), a = $('arenaAlive'), k = $('arenaKills');
  if (w) w.textContent = '第 ' + Math.max(1, arenaWave) + ' 波';
  if (a) a.textContent = '剩余 ' + arenaAlive + ' 人';
  if (k) k.textContent = '本场击杀 ' + arenaKills;
}