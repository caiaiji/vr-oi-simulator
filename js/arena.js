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
let arenaBossKills = 0;       /* 校长被 KO 次数：决定下个 BOSS 波的强度/波位 */
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
  if (type === 'prefect') return 1.75 * Math.min(1.9, waveMul);   /* 风纪委员：贴脸猛追 */
  if (type === 'director') return 0.42 * Math.min(1.2, waveMul);  /* 年级组长：重甲踱步 */
  return 0.95 * waveMul;
}

/* 竞技场种类掷骰：波次越高，重装 / 快速越常见 */
function arenaGuardType(){
  const r = Math.random();
  const heavyP = Math.min(0.26, 0.07 + arenaWave * 0.02);
  const fastP  = Math.min(0.42, 0.22 + arenaWave * 0.022);
  const prefectP = arenaWave >= 4 ? Math.min(0.28, 0.10 + arenaWave * 0.02) : 0;
  const directorP = arenaWave >= 6 ? Math.min(0.20, 0.06 + arenaWave * 0.015) : 0;
  if (r < heavyP) return 'heavy';
  if (r < heavyP + fastP) return 'fast';
  if (r < heavyP + fastP + prefectP) return 'prefect';
  if (r < heavyP + fastP + prefectP + directorP) return 'director';
  return 'normal';
}

/* 竞技场保安入场（教室补员仍走 world.js 的 spawnTwoGuards） */
function spawnArenaGuards(n){
  /* 竞技场不靠补员清理死守卫，入场前主动 prune 防数组膨胀 */
  if (typeof pruneDeadGuards === 'function') pruneDeadGuards();
  /* 以玩家当前站位为中心包抄：每一波都是包围圈，没有安全打靶位 */
  const px = state.pos.x, pz = state.pos.z;
  const axMin = -ARENA_HW + 1.5, axMax = ARENA_HW - 1.5;
  const azMin = -ARENA_HD + 1.5, azMax = ARENA_HD - 1.5;
  for (let i = 0; i < n; i++){
    /* 刷新点必须落在场内且离玩家至少 5.5m：贴墙站也不可能刷在脚下 */
    let gx = px, gz = pz, ok = false;
    for (let t = 0; t < 24 && !ok; t++){
      const angle = Math.random() * Math.PI * 2;
      const dist = 6.5 + Math.random() * 3.0;
      gx = px + Math.cos(angle) * dist;
      gz = pz + Math.sin(angle) * dist;
      ok = gx > axMin && gx < axMax && gz > azMin && gz < azMax;
    }
    if (!ok){
      /* 极端贴角：从玩家指向场心的方向 7m 处钻出 */
      const ca = Math.atan2(-pz, -px);
      gx = clamp(px + Math.cos(ca) * 7.0, axMin, axMax);
      gz = clamp(pz + Math.sin(ca) * 7.0, azMin, azMax);
    }

    const type = (typeof arenaGuardType === 'function')
      ? arenaGuardType()
      : (typeof rollGuardType === 'function' ? rollGuardType() : 'normal');
    const g = buildSecurityGuard(gx, gz, type, arenaScene);
    g.userData = {
      speed: arenaGuardSpeed(arenaWave, type),
      alive: true,
      type: type,
      hp: type === 'heavy' ? 2 : type === 'director' ? 3 : 1,
      spawnT: 0.9   /* 登场硬直：先亮个相，给玩家反应时间 */
    };
    securityGuards.push(g);
    state.guardsSpawned = (state.guardsSpawned || 0) + 1;
  }
}

/* =========================================================
   场景搭建
   ========================================================= */
/* 每局随机 2~3 组掩体：讲台高台（可绕打）+ 翻倒桌椅（视线遮挡） */
function spawnArenaProps(){
  const groups = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < groups; i++){
    const ang = Math.random() * Math.PI * 2;
    const r = 4.2 + Math.random() * 4.2;
    const px = clamp(Math.cos(ang) * r, -ARENA_HW + 2.6, ARENA_HW - 2.6);
    const pz = clamp(Math.sin(ang) * r, -ARENA_HD + 2.6, ARENA_HD - 2.6);
    if (Math.random() < 0.5){
      /* 讲台高台：两级台阶 */
      const g = new THREE.Group();
      g.position.set(px, 0, pz);
      box(2.7, 0.5, 2.0, 0x3f3134, 0, 0.25, 0, g, { roughness: 0.9 });
      box(2.0, 0.5, 1.4, 0x4a3a3c, 1.35, 0.5, 0.3, g, { roughness: 0.9 });
      const rail = mat(0x5a4a4c, { roughness: 0.7, metalness: 0.4 });
      for (const [rx, rz] of [[0, -1.05], [0, 0.75], [1.05, 1.05], [-1.05, 1.05]]){
        const post = new THREE.Mesh(getSphereGeo(0.09, 8, 6), rail);
        post.position.set(rx, 0.78, rz);
        g.add(post);
      }
      arenaScene.add(g);
      const pl = new THREE.PointLight(0xffb060, 0.25, 9, 2);
      pl.position.set(px, 1.5, pz);
      arenaScene.add(pl);
      addObstacle(px, pz, 1.6, 1.2);
    } else {
      /* 翻倒桌子：斜立的桌面 + 两条桌腿 */
      const g = new THREE.Group();
      g.position.set(px, 0, pz);
      g.rotation.y = Math.random() * Math.PI;
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.14, 1.1),
        mat(0x7a5a3c, { roughness: 0.85 })
      );
      top.position.set(0, 0.78, 0.28);
      top.rotation.z = 1.35;
      top.castShadow = true;
      g.add(top);
      const legM = mat(0x4a3524, { roughness: 0.8, metalness: 0.3 });
      for (const [lx, lz] of [[-0.45, 0.5], [0.45, 0.5]]){
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), legM);
        leg.position.set(lx, 0.45, lz);
        leg.rotation.z = 1.35;
        g.add(leg);
      }
      arenaScene.add(g);
      addObstacle(px, pz, 1.15, 0.85);
    }
  }
}

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

  /* 随机地形：讲台高台 / 翻倒桌椅围挡，每局不同 */
  spawnArenaProps();

  /* 全局照明：环境光 + 半球光 + 主方向光（否则竞技场只有红警示灯，人物全黑） */
  arenaScene.add(new THREE.AmbientLight(0xfff1e8, 0.5));
  arenaScene.add(new THREE.HemisphereLight(0xc8d8ff, 0x2a2427, 0.55));
  const dirMain = new THREE.DirectionalLight(0xfff0dc, 0.55);
  dirMain.position.set(2, 6, 2);
  arenaScene.add(dirMain);

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
  arenaBossKills = 0;
  const _bb = document.getElementById('bossBarWrap');
  if (_bb) _bb.classList.add('hidden');
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
  /* 校长波：第 9 波首次登场，之后每 4 波带着更强形态回归 */
  const bossWave = 9 + arenaBossKills * 4;
  if (arenaWave === bossWave){
    spawnPrincipalBoss();
    const escorts = Math.max(2, Math.floor(n / 3));
    spawnArenaGuards(escorts);   /* 校长带贴身护卫上场 */
    arenaAlive = escorts + 1;
  } else {
    spawnArenaGuards(n);
  }
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
function arenaHookKill(g){
  if (!state.arenaMode) return;
  /* 校长战败：加分 + 周目升级 + 血条隐去 */
  if (g && g.userData && g.userData.type === 'principal'){
    arenaBossKills++;
    const bounty = 400 + (arenaBossKills - 1) * 150;
    state.totalScore = (state.totalScore || 0) + bounty;
    const bw = document.getElementById('bossBarWrap');
    if (bw) bw.classList.add('hidden');
    toast('\U0001F3C6 校长被 KO 了！第 ' + arenaBossKills + ' 形态击破，奖励 ' + bounty + ' 分。', 3600);
    audio.beep(660, 0.15, 0.05, 'sine');
    audio.beep(880, 0.3, 0.06, 'sine');
    if (typeof unlockAch === 'function') unlockAch('arenaBoss');
  }
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

/* ---------- 校长 BOSS ---------- */

function ensureBossBar(){
  if (document.getElementById('bossBarWrap')) return;
  const w = document.createElement('div');
  w.id = 'bossBarWrap';
  w.style.cssText = 'position:fixed;top:92px;left:50%;transform:translateX(-50%);width:min(70%,520px);z-index:60;';
  const name = document.createElement('div');
  name.id = 'bossName';
  name.style.cssText = 'color:#ffe08a;font-weight:bold;text-align:center;margin-bottom:4px;font-size:15px;letter-spacing:1px;text-shadow:0 0 10px #a33;';
  const bar = document.createElement('div');
  bar.style.cssText = 'height:14px;background:#2a1216;border-radius:8px;border:2px solid #7a3340;overflow:hidden;';
  const fill = document.createElement('div');
  fill.id = 'bossBarFill';
  fill.style.cssText = 'height:100%;width:100%;background:linear-gradient(90deg,#ffb020,#ff4d30);transition:width .15s;';
  bar.appendChild(fill);
  w.appendChild(name);
  w.appendChild(bar);
  document.body.appendChild(w);
}

function updateBossBar(hp, max){
  const f = document.getElementById('bossBarFill');
  if (f) f.style.width = Math.max(0, hp / max * 100) + '%';
}

function spawnPrincipalBoss(){
  pruneDeadGuards();
  /* 出生点反重叠：随机地形（高台/翻桌）不能把校长吸进障碍里 */
  let bx = 0, bz = 0;
  for (let t = 0; t < 14; t++){
    const ang = Math.random() * Math.PI * 2;
    const cx = clamp(8.4 * Math.cos(ang), -ARENA_HW + 2.5, ARENA_HW - 2.5);
    const cz = clamp(8.4 * Math.sin(ang), -ARENA_HD + 2.5, ARENA_HD - 2.5);
    if (!collides(cx, cz, 1.0)){ bx = cx; bz = cz; break; }
    if (t === 0){ bx = cx; bz = cz; }   /* 全是障碍时保留第一个点，交给绕行 */
  }
  const g = buildSecurityGuard(bx, bz, 'director', arenaScene);
  const form = arenaBossKills + 1;
  g.group.scale.setScalar(2.2 + (form - 1) * 0.12);
  g.userData = {
    speed: 0.8 + (form - 1) * 0.04,
    alive: true, type: 'principal',
    hp: 14 + (form - 1) * 6,
    hpMax: 14 + (form - 1) * 6,
    spawnT: 1.3, boss: true,
    stompCd: 3.0, dashCd: 6.0,
    bState: 'idle', bT: 0
  };
  if (g.glow){
    g.glow.material.color.set(0xffc400);
    g.glow.material.opacity = 0.55;
    g.glow.scale.setScalar((2.2 + (form - 1) * 0.12) * 1.3);
  }
  securityGuards.push(g);
  state.guardsSpawned = (state.guardsSpawned || 0) + 1;

  ensureBossBar();
  const bw = document.getElementById('bossBarWrap');
  if (bw) bw.classList.remove('hidden');
  const bn = document.getElementById('bossName');
  if (bn) bn.textContent = '校长 · 第 ' + form + ' 形态 · 抚顶 OA';
  updateBossBar(g.userData.hp, g.userData.hpMax);
  toast('\U0001F454 校长亲自下场了！踩水跺脚、直线冲刺都是死穴。', 3000);
  audio.beep(170, 0.5, 0.07, 'sawtooth');
  audio.beep(92, 0.8, 0.07, 'sawtooth');
}

function updateArenaHud(){
  const w = $('arenaWave'), a = $('arenaAlive'), k = $('arenaKills');
  if (w) w.textContent = '第 ' + Math.max(1, arenaWave) + ' 波';
  if (a) a.textContent = '剩余 ' + arenaAlive + ' 人';
  if (k) k.textContent = '本场击杀 ' + arenaKills;
}