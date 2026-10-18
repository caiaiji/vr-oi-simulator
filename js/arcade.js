'use strict';
/* =========================================================
   arcade —— 街机强化包
   ---------------------------------------------------------
   1. 连击系统：连续击倒叠加连击数，阈值解锁增益
      （×5 疾步移速 +12%、×10 拳威范围 +0.7m、×15 残像顿帧增强、
        ×20 心流回血 1 格）；断了会弹 COMBO LOST。
   2. 击杀飘字：目标头顶投影到屏幕坐标，浮出 KO!/踉跄!/+1❤ 等字样。
   3. 掉落补给：保安倒下随机掉落 矿泉水（回血）/ 红牛（14s 疾速），
      重装保安必掉。走近自动拾取，同屏最多 6 件。
   4. 冲刺：Q 键 0.16s 前冲 2.4m，贴身保安被撞开，FOV 轻微拉近，
      冷却 1.3s（红牛期间 0.72s）。
   5. 同学应援：打倒监考后，同学随机加油/提醒后方来敌。
   6. 氛围事件：灯管闪烁、广播电流噪音、挂钟滴答，随机出现。
   由 combat.js / npc.js / hp.js / look.js / main.js 在运行时挂钩调用，
   全部用 typeof 探测防御，加载顺序无关紧要。
   ========================================================= */

/* ---------- 全局状态扩展（不入存档，仅本局有效） ---------- */
state.combo = 0;            // 当前连击数
state.comboMax = 0;         // 本局最大连击
state.comboTimer = 0;       // 连击窗口剩余时间
state.comboHealed20 = false;
state.comboStep = 0;        // 已播报过的阈值档位
state.lootCount = 0;        // 拾取补给数
state.heavyKills = 0;       // 放倒重装保安数
state.fastKills = 0;
state.dashCount = 0;        // 冲刺次数
state.speedBuffT = 0;       // 疾速剩余时间（s）

/* =========================================================
   连击
   ========================================================= */
const COMBO_WINDOW = 3.2;      // 多少秒内再击杀算连续
const COMBO_FEED_STEPS = [
  { at: 5,  text: '疾步！连击 ×5',  cls: 'feed-gold' },
  { at: 10, text: '拳威！连击 ×10', cls: 'feed-gold' },
  { at: 15, text: '残像！连击 ×15', cls: 'feed-epic' },
  { at: 20, text: '心流！连击 ×20', cls: 'feed-epic' },
  { at: 30, text: '登峰造极 ×30',   cls: 'feed-epic' }
];

function comboSpeedMul(){
  return state.combo >= 5 ? 1.12 : 1;
}
function comboRangeBonus(){
  return state.combo >= 10 ? 0.7 : 0;
}
function comboHitStopBonus(){
  return state.combo >= 15 ? 0.045 : 0;
}

function bumpCombo(n){
  state.combo += n;
  state.comboTimer = COMBO_WINDOW;
  state.comboMax = Math.max(state.comboMax, state.combo);

  while (state.comboStep < COMBO_FEED_STEPS.length &&
         state.combo >= COMBO_FEED_STEPS[state.comboStep].at){
    const s = COMBO_FEED_STEPS[state.comboStep];
    showFeed(s.text, s.cls);
    audio.beep(660 + state.comboStep * 90, 0.09, 0.04, 'triangle');
    state.comboStep++;
  }

  /* ×20 心流：回 1 格血 */
  if (state.combo >= 20 && !state.comboHealed20){
    state.comboHealed20 = true;
    if (state.hpVisible && state.hp < HP_MAX){
      state.hp++;
      renderHp();
    }
    toast('你进入了心流状态，连伤口都在隐隐发烫。', 2200);
  }
  updateComboUI();
}

function resetCombo(){
  if (state.combo >= 5) showFeed('COMBO LOST', 'feed-lost');
  state.combo = 0;
  state.comboTimer = 0;
  state.comboHealed20 = false;
  state.comboStep = 0;
  updateComboUI();
}

/* 玩家受伤 → 连击中断（hp.js 挂钩） */
function onPlayerHurt(){
  resetCombo();
}

function updateComboUI(){
  const wrap = $('comboWrap'), num = $('comboNum'), lab = $('comboLabel');
  if (!wrap) return;
  const show = state.combo >= 2;
  wrap.classList.toggle('hidden', !show);
  if (!show) return;
  num.textContent = state.combo;
  lab.textContent = state.combo >= 20 ? '心流 · COMBO' : 'COMBO';
  wrap.classList.toggle('t10', state.combo >= 10);
  wrap.classList.toggle('t20', state.combo >= 20);
  /* 重触发缩放动画 */
  num.classList.remove('pulse');
  void num.offsetWidth;
  num.classList.add('pulse');
}

/* =========================================================
   屏幕坐标飘字 / 中央信息
   ========================================================= */
const _ftV = new THREE.Vector3();

function floatTextAt(pos, text, cls){
  const layer = $('floatLayer');
  if (!layer) return;
  _ftV.copy(pos);
  _ftV.y += 1.65;
  _ftV.project(camera);
  if (_ftV.z > 1) return;   /* 相机背后不显示 */
  const el = document.createElement('div');
  el.className = 'ft ' + (cls || '');
  el.textContent = text;
  el.style.left = ((_ftV.x * 0.5 + 0.5) * innerWidth).toFixed(1) + 'px';
  el.style.top = ((-_ftV.y * 0.5 + 0.5) * innerHeight).toFixed(1) + 'px';
  layer.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 340);
  }, 760);
}

function showFeed(text, cls){
  const feed = $('killfeed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = 'feed ' + (cls || '');
  el.textContent = text;
  feed.appendChild(el);
  while (feed.children.length > 4) feed.removeChild(feed.firstChild);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 360);
  }, 900);
}

/* =========================================================
   击杀钩子（combat.js / npc.js 调用）
   ========================================================= */
function arcadeHookKill(g){
  const type = g.userData.type || 'normal';
  if (type === 'heavy') state.heavyKills++;
  if (type === 'fast') state.fastKills++;
  /* 武器击杀统计（按当前持用武器） */
  const wid = state.weapon || 'fist';
  state.weaponKills = state.weaponKills || { fist: 0, keyboard: 0, chair: 0, ruler: 0 };
  state.weaponKills[wid] = (state.weaponKills[wid] || 0) + 1;
  if (state.weaponKills.keyboard >= 20) unlockAch('kinoboard20');
  if (state.weaponKills.chair >= 30) unlockAch('chair30');
  if (state.weaponKills.ruler >= 15) unlockAch('ruler15');
  if (state.weaponKills.chalk >= 20) unlockAch('chalk20');
  if (state.weaponKills.eraser >= 15) unlockAch('eraser15');
  bumpCombo(1);
  floatTextAt(g.group.position,
              state.combo >= 2 ? 'KO!\u00d7' + state.combo : 'KO!', 'ft-ko');
  maybeDropLoot(g, type);
  maybeCheer();
  if (state.heavyKills >= 10) unlockAch('heavy10');
  if (state.combo >= 15) unlockAch('combo15');
  if (state.combo >= 30) unlockAch('combo30');
}

/* 放倒同学也算连击与武器击杀 */
function arcadeHookKillSimple(group){
  const wid = state.weapon || 'fist';
  state.weaponKills = state.weaponKills || { fist: 0, keyboard: 0, chair: 0, ruler: 0 };
  state.weaponKills[wid] = (state.weaponKills[wid] || 0) + 1;
  if (state.weaponKills.keyboard >= 20) unlockAch('kinoboard20');
  if (state.weaponKills.chair >= 30) unlockAch('chair30');
  if (state.weaponKills.ruler >= 15) unlockAch('ruler15');
  if (state.weaponKills.chalk >= 20) unlockAch('chalk20');
  if (state.weaponKills.eraser >= 15) unlockAch('eraser15');
  bumpCombo(1);
  floatTextAt(group.position,
              state.combo >= 2 ? 'KO!\u00d7' + state.combo : 'KO!', 'ft-ko');
  maybeCheer();
}

/* 一整拳结算后调用：多杀播报 / 应援 */
function arcadeHookPunch(n){
  if (n >= 2){
    const word = n === 2 ? '双杀!!' : n === 3 ? '三杀!!'
               : n === 4 ? '四杀!!' : '狂杀!!';
    showFeed(word, n >= 4 ? 'feed-epic' : 'feed-multi');
    audio.beep(520 + n * 60, 0.14, 0.05, 'square');
  }
  maybeCheer();
}

/* 重装保安挨第一拳：踉跄 + 火花 + 击退 */
function staggerGuard(g, hard){
  const dx = g.group.position.x - state.pos.x;
  const dz = g.group.position.z - state.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const kb = hard ? 1.9 : 1.35;
  g.group.position.x += dx / d * kb;
  g.group.position.z += dz / d * kb;
  spawnSparks(g.group.position.x, 1.35, g.group.position.z, hard ? 14 : 8, 0xffcc55);
  floatTextAt(g.group.position, hard ? '重击! 踉跄' : '踉跄!', 'ft-stagger');
  audio.beep(hard ? 60 : 90, hard ? 0.2 : 0.14, hard ? 0.1 : 0.07, 'square');
  hitStop = Math.max(hitStop, hard ? 0.06 : 0.035);
}

/* 小火花碎块：复用 debris.js 的刚体池 */
function spawnSparks(x, y, z, n, color){
  for (let i = 0; i < n; i++){
    const m = new THREE.Mesh(
      getBoxGeo(0.045, 0.045, 0.045),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 })
    );
    m.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
    (typeof activeWorldScene === 'function' ? activeWorldScene() : scene).add(m);
    const shape = boxShape(0.045, 0.045, 0.045);
    shape.quat = m.quaternion;
    debrisList.push({
      mesh: m, mat: m.material, shape,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 2.4, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4),
      omega: new THREE.Vector3(
        (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
      life: 1.1 + Math.random() * 0.5, calm: 0, sleep: false
    });
  }
}

/* =========================================================
   掉落补给
   ========================================================= */
const lootList = [];
const LOOT_MAX = 6;
const LOOT_LIFE = 30;      // 掉落物 30s 后消失
const LOOT_PICK_R = 0.9;

function makeLootMesh(kind, x, z){
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const isWater = kind === 'water';

  if (isWater){
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.17, 12),
      new THREE.MeshStandardMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.85, roughness: 0.15 })
    );
    bottle.position.y = 0.24;
    g.add(bottle);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.03, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    cap.position.y = 0.34;
    g.add(cap);
  } else {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.7, roughness: 0.3 })
    );
    can.position.y = 0.23;
    g.add(can);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10),
      new THREE.MeshStandardMaterial({ color: 0x9b9b9b, metalness: 0.85, roughness: 0.3 })
    );
    top.position.y = 0.32;
    g.add(top);
  }

  const glow = new THREE.Mesh(
    getSphereGeo(0.14, 10, 10),
    new THREE.MeshBasicMaterial({
      color: isWater ? 0x55ccff : 0xffc040,
      transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  glow.position.y = 0.26;
  g.add(glow);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.2, 20),
    new THREE.MeshBasicMaterial({
      color: isWater ? 0x55ccff : 0xffc040,
      transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);

  (typeof activeWorldScene === 'function' ? activeWorldScene() : scene).add(g);
  lootList.push({ group: g, kind, t: 0, life: LOOT_LIFE, ph: Math.random() * 7 });
}

function maybeDropLoot(guard, type){
  /* 先掷武器掉落（未拥有的，小概率）；掷中就只掉武器 */
  if (typeof tryDropWeaponPickup === 'function' &&
      tryDropWeaponPickup(guard.group.position.x, guard.group.position.z)) return;
  if (lootList.length >= LOOT_MAX) removeLoot(lootList[0]);
  const chance = type === 'heavy' ? 1 : type === 'fast' ? 0.30 : 0.18;
  if (Math.random() > chance) return;
  const kind = Math.random() < 0.72 ? 'water' : 'redbull';
  makeLootMesh(kind, guard.group.position.x, guard.group.position.z);
}

function removeLoot(it){
  if (it.group.parent) it.group.parent.remove(it.group);
  const i = lootList.indexOf(it);
  if (i >= 0) lootList.splice(i, 1);
}

function pickLoot(it){
  state.lootCount++;
  if (it.kind === 'water'){
    if (state.hpVisible && state.hp < HP_MAX){
      state.hp++;
      renderHp();
      floatTextAt(it.group.position, '+1 \u2764', 'ft-heal');
      toast('\u{1F4A7} 捡到一瓶矿泉水，喝了一大口。', 1800);
    } else {
      state.speedBuffT = Math.max(state.speedBuffT, 4);
      floatTextAt(it.group.position, '神清气爽!', 'ft-buff');
      toast('\u{1F4A7} 捡到矿泉水一口闷下，感觉轻快了几分。', 1800);
    }
    audio.beep(660, 0.08, 0.05);
    setTimeout(() => audio.beep(880, 0.12, 0.04), 90);
  } else {
    state.speedBuffT = 14;
    floatTextAt(it.group.position, '疾速!', 'ft-buff');
    toast('\u26A1 红牛下肚，感觉能跑得更快！', 1800);
    audio.beep(760, 0.1, 0.05);
    setTimeout(() => audio.beep(1140, 0.16, 0.045), 90);
  }
  if (state.lootCount >= 5) unlockAch('loot5');
  removeLoot(it);
}

function updateLoot(realDt){
  for (let i = lootList.length - 1; i >= 0; i--){
    const it = lootList[i];
    it.life -= realDt;
    if (it.life <= 0){ removeLoot(it); continue; }
    it.t += realDt;
    /* 瓶身慢速旋转 */
    if (it.group.children[0]) it.group.children[0].rotation.y += realDt * 2.2;
    it.group.position.y = 0.28 + Math.sin(it.t * 3 + it.ph) * 0.05;
    if (Math.hypot(state.pos.x - it.group.position.x,
                   state.pos.z - it.group.position.z) < LOOT_PICK_R){
      pickLoot(it);
    }
  }
}

function updateBuffUI(){
  const wrap = $('buffWrap'), text = $('buffText'), bar = $('buffBar');
  if (!wrap) return;
  if (state.speedBuffT > 0){
    wrap.classList.remove('hidden');
    text.textContent = '\u26A1 疾速';
    bar.style.width = Math.min(100, state.speedBuffT / 14 * 100).toFixed(1) + '%';
  } else {
    wrap.classList.add('hidden');
  }
}

/* =========================================================
   冲刺
   ========================================================= */
const DASH_TIME = 0.16;      // 冲刺持续（s）→ 位移 2.4m
const DASH_SPEED = 15;
const DASH_CD = 1.3;         // 冷却（s）
const DASH_KNOCK_R = 0.95;   // 撞开贴身保安的半径
let dashT = 0, dashCd = 0, dashFov = 0;
const dashDir = { x: 0, z: 0 };
const _dashOut = { x: 0, z: 0 };
const DASH_FOV_KICK = 7;

function tryDash(){
  if (!state.started || state.ended || state.frozen) return;
  if (state.view !== 'world') return;
  if (typeof hasDialog === 'function' && hasDialog()) return;
  if (dashCd > 0) return;

  let dx = 0, dz = 0;
  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
  const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
  if (state.keys['w']){ dx += fx; dz += fz; }
  if (state.keys['s']){ dx -= fx; dz -= fz; }
  if (state.keys['d']){ dx += rx; dz += rz; }
  if (state.keys['a']){ dx -= rx; dz -= rz; }
  if (dx === 0 && dz === 0){ dx = fx; dz = fz; }   // 无输入则朝前
  const len = Math.hypot(dx, dz) || 1;
  dashDir.x = dx / len;
  dashDir.z = dz / len;

  dashT = DASH_TIME;
  dashFov = DASH_FOV_KICK;
  dashCd = DASH_CD * (state.speedBuffT > 0 ? 0.55 : 1);
  state.dashCount++;
  if (state.dashCount >= 30) unlockAch('dash30');
  audioWhoosh();
  kickView(-0.02, (Math.random() - 0.5) * 0.018);
}

/* look.js 每帧调用：返回本帧冲刺位移增量，并顺带撞开贴身保安 */
function dashImpulse(dt){
  _dashOut.x = 0;
  _dashOut.z = 0;
  if (dashT <= 0) return _dashOut;
  dashT -= dt;
  const s = DASH_SPEED * dt;
  _dashOut.x = dashDir.x * s;
  _dashOut.z = dashDir.z * s;

  for (const g of securityGuards){
    if (!g.userData.alive) continue;
    const ddx = g.group.position.x - state.pos.x;
    const ddz = g.group.position.z - state.pos.z;
    const d = Math.hypot(ddx, ddz);
    if (d < DASH_KNOCK_R && d > 0.01){
      const push = (1 - d / DASH_KNOCK_R) * 0.55;
      const nx = g.group.position.x + (ddx / d) * push;
      const nz = g.group.position.z + (ddz / d) * push;
      if (!collides(nx, nz, 0.3)){
        g.group.position.x = nx;
        g.group.position.z = nz;
      }
    }
  }
  return _dashOut;
}

function speedBuffMul(){
  return state.speedBuffT > 0 ? 1.25 : 1;
}

/* =========================================================
   同学应援
   ========================================================= */
const CHEERS = [
  '好耶！揍他！', '大哥快跑——不对，大哥快打！',
  '我们这考场是不是变成真人快打了……', '再放倒一个！',
  '这是我见过最勇的考生！', '打！狠狠地打！',
  '拳头才是第一生产力', '你卷谁不好，卷保安……'
];
const WARN_LINES = [
  '后面！又有保安来了！', '连击别断，你可以的！',
  '别被抱住，用冲刺甩开！', '保安从左边绕过来了！'
];
const HURT_LINES = [
  '快捡矿泉水！就在地上！', '你只剩一格血了，别浪！',
  '先撤一下，他们人多！'
];

let cheerCd = 0, warnCd = 0;

function maybeCheer(){
  if (cheerCd > 0 || !state.teacherDown) return;
  const seated = npcs.filter(n => n.userData && n.userData.state === 'seated');
  if (!seated.length) return;
  const n = seated[Math.floor(Math.random() * seated.length)];
  const line = CHEERS[Math.floor(Math.random() * CHEERS.length)];
  toast(`${n.userData.name}：“${line}”`, 1900);
  cheerCd = 2.5;
}

function maybeWarn(){
  if (warnCd > 0 || !state.hpVisible) return;
  if (nearestGuardDist === Infinity || nearestGuardDist > 2.8) return;
  const seated = npcs.filter(n => n.userData && n.userData.state === 'seated');
  if (!seated.length) return;
  warnCd = 6 + Math.random() * 4;
  const n = seated[Math.floor(Math.random() * seated.length)];
  const pool = state.hp === 1 ? HURT_LINES : WARN_LINES;
  toast(`${n.userData.name}：“${pool[Math.floor(Math.random() * pool.length)]}”`, 2100);
}

/* =========================================================
   氛围事件：灯闪 / 广播噪音 / 挂钟滴答
   ========================================================= */
const BROADCAST_LINES = [
  '\u{1F4E2} 广播：“滋——请各位考生——滋——”',
  '\u{1F4E2} 广播：“各点位注意——滋——维持——滋——”',
  '\u{1F4E2} 广播里只剩一阵沙沙的电流声。'
];
let ambientTimer = 26 + Math.random() * 18;
let flickerT = 0;

function rollAmbientEvent(){
  if (!state.teacherDown && Math.random() < 0.65) return;  // 开打前保持安静
  const r = Math.random();
  if (r < 0.42){
    startFlicker();
    toast('\u{1F4A1} 头顶的灯管闪了几下。', 1600);
  } else if (r < 0.78){
    audioNoiseBurst();
    toast(BROADCAST_LINES[Math.floor(Math.random() * BROADCAST_LINES.length)], 2200);
  } else {
    audio.beep(980, 0.06, 0.05, 'square');
    setTimeout(() => audio.beep(980, 0.06, 0.05, 'square'), 200);
    toast('\u{1F570}\uFE0F 挂钟的秒针发出清脆的滴答声。', 1600);
  }
}

function startFlicker(){
  if (flickerT > 0) return;
  for (const p of tPoints){
    if (p.userData && p.userData.noTensionDim) continue;
    p.userData.flickerBase = p.intensity;
  }
  flickerT = 0.6;
}

function updateFlicker(realDt){
  if (flickerT <= 0) return;
  flickerT -= realDt;
  const on = Math.sin(performance.now() * 0.06) > -0.15;
  for (const p of tPoints){
    if (p.userData && p.userData.noTensionDim) continue;
    if (typeof p.userData.flickerBase === 'number'){
      p.intensity = p.userData.flickerBase * (on ? 1 : 0.18);
    }
  }
  if (flickerT <= 0){
    for (const p of tPoints){
      if (p.userData && p.userData.noTensionDim) continue;
      if (typeof p.userData.flickerBase === 'number'){
        p.intensity = p.userData.flickerBase;
        delete p.userData.flickerBase;
      }
    }
  }
}

/* =========================================================
   合成音效
   ========================================================= */
function audioWhoosh(){
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  const buf = audio.ctx.createBuffer(1, 4096, audio.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = audio.ctx.createBufferSource(); s.buffer = buf;
  const f = audio.ctx.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(2200, t + 0.16);
  f.Q.value = 0.7;
  const g = audio.ctx.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  s.connect(f); f.connect(g); g.connect(audio.master);
  s.start(t);
}

function audioNoiseBurst(){
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  const buf = audio.ctx.createBuffer(1, 8192, audio.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++){
    d[i] = (Math.random() * 2 - 1) * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.13))) * (1 - i / d.length);
  }
  const s = audio.ctx.createBufferSource(); s.buffer = buf;
  const f = audio.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = audio.ctx.createGain(); g.gain.value = 0.10;
  s.connect(f); f.connect(g); g.connect(audio.master);
  s.start(t);
}

/* =========================================================
   每帧入口（main.js 在世界视图调用）
   ========================================================= */
function updateArcade(realDt, worldDt, t){
  if (!state.started || state.ended) return;

  if (dashCd > 0) dashCd -= realDt;
  if (state.speedBuffT > 0){
    state.speedBuffT -= realDt;
    updateBuffUI();
  }

  /* 连击窗口衰减 */
  if (state.combo > 0){
    state.comboTimer -= realDt;
    if (state.comboTimer <= 0) resetCombo();
  }

  updateLoot(realDt);
  /* 武器系统：挥击动画 / 冷却恢复 / 武器拾取点 / HUD / 投掷弹道 */
  if (typeof updateWeapons === 'function') updateWeapons(realDt, worldDt);

  if (cheerCd > 0) cheerCd -= realDt;
  if (warnCd > 0) warnCd -= realDt;
  if (state.hpVisible) maybeWarn();

  /* 冲刺 FOV 踢 + 归位 */
  if (dashFov > 0.005){
    dashFov *= Math.exp(-realDt * 4.5);
    camera.fov = 74 + dashFov;
    camera.updateProjectionMatrix();
  } else if (dashFov !== 0){
    dashFov = 0;
    camera.fov = 74;
    camera.updateProjectionMatrix();
  }

  updateFlicker(realDt);

  ambientTimer -= realDt;
  if (ambientTimer <= 0){
    ambientTimer = 26 + Math.random() * 22;
    rollAmbientEvent();
  }
}