'use strict';
/* =========================================================
   weapons —— 武器系统：拳头 / 键盘 / 椅子 / 直尺
   ---------------------------------------------------------
   - 4 件武器各自独立 范围/扇形/伤害/冷却/击退/挥击动画/音效。
   - 拳头初始拥有；打倒监考后考场刷出 3 件神器拾取点；
     保安偶尔也会掉（未拥有的武器）。
   - 数字键 1-4 切换；拾取新武器自动装备。
   - 第一人称手持模型：跟随相机，挥击时有下劈/突刺动画。
   - 由 combat.js / interact.js / arcade.js / main.js 挂钩调用，
     全部 typeof 防御，加载顺序无关。
   ========================================================= */

const WEAPONS = {
  fist: {
    id: 'fist', name: '拳头', icon: '\u{1F44A}', key: 1,
    range: 2.2, arc: 0.40, dmg: 1,  kb: 0,   cd: 0,
    swingT: 0.12, amp: 0.95, poke: 0,
    verb: '出拳', launch: '一拳挥出'
  },
  keyboard: {
    id: 'keyboard', name: '键盘', icon: '\u2328\uFE0F', key: 2,
    range: 2.6, arc: 0.55, dmg: 2,  kb: 1.2, cd: 0.45,
    swingT: 0.20, amp: 1.15, poke: 0,
    verb: '键盘横扫', launch: '键盘劈下'
  },
  chair: {
    id: 'chair', name: '椅子', icon: '\u{1FA91}', key: 3,
    range: 3.0, arc: 0.50, dmg: 3,  kb: 2.4, cd: 0.85,
    swingT: 0.28, amp: 1.30, poke: 0,
    verb: '椅子重击', launch: '椅子抡圆',
    /* 近战/投掷两用：贴身抡人，否则丢出去炸落点 */
    throwable: true, throwVerb: '丢椅子', throwHint: '砸哪炸哪',
    throwSpeed: 10, throwLift: 3.0, throwSize: 0.06, projColor: 0x6b5137,
    aoeR: 2.6, aoeDmg: 3, aoeKb: 2.0
  },
  ruler: {
    id: 'ruler', name: '直尺', icon: '\u{1F4CF}', key: 4,
    range: 3.6, arc: 0.28, dmg: 1.5, kb: 0.4, cd: 0.5,
    swingT: 0.16, amp: 0.62, poke: 0.45,
    verb: '直尺突刺', launch: '直尺刺出'
  },
  /* ----- 投掷类：从准星方向发射抛物弹，命中第一个目标 ----- */
  chalk: {
    id: 'chalk', name: '粉笔头', icon: '\u{1F58D}\uFE0F', key: 5,
    range: 9.5, arc: 0.10, dmg: 1, kb: 0.3, cd: 0.55,
    swingT: 0.14, amp: 0.5, poke: 0.35,
    verb: '投掷粉笔', launch: '粉笔破空',
    throwable: true, throwSpeed: 19, throwLift: 1.2, throwSize: 0.035,
    projColor: 0xffffff
  },
  eraser: {
    id: 'eraser', name: '橡皮', icon: '\u{1F9FD}', key: 6,
    range: 9.5, arc: 0.14, dmg: 2, kb: 1.5, cd: 1.15,
    swingT: 0.2, amp: 0.72, poke: 0.5,
    verb: '投掷橡皮', launch: '橡皮砸来',
    throwable: true, throwSpeed: 16, throwLift: 1.6, throwSize: 0.06,
    projColor: 0xf5f2ea
  }
};

/* ---------- 全局状态 ---------- */
state.weapon = 'fist';
state.weaponsOwned = ['fist'];
/* 每把武器独立冷却：换武器不会把上一把的冷却带过来，鼓励循环连招 */
state.weaponCds = { fist: 0, keyboard: 0, chair: 0, ruler: 0 };
state.weaponKills = { fist: 0, keyboard: 0, chair: 0, ruler: 0 };

let swingTd = 0;            // 挥击动画剩余时间
const weaponView = new THREE.Group();
let wvFist, wvKeyboard, wvChair, wvRuler, wvChalk, wvEraser;   // 手持模型（懒构建）
const thrownList = [];      // 飞行中的投掷物

/* ---------- 武器拾取物（世界内悬浮） ---------- */
const wpPickups = [];       // { group, kind, t }
const WP_PICK_R = 0.95;
const WP_PICK_SPOTS = [     // 开局即刷新（过道，避开障碍）
  { kind: 'keyboard', x: 2.9,  z: 0.9 },
  { kind: 'chair',    x: 6.4,  z: -1.2 },
  { kind: 'ruler',    x: -1.2, z: -6.3 },
  { kind: 'chalk',    x: 2.4,  z: -0.3 },   // 讲台附近
  { kind: 'eraser',   x: 1.2,  z: -6.3 }    // 黑板前
];

/* =========================================================
   访问器 / 切换
   ========================================================= */
function weaponParams(){
  return WEAPONS[state.weapon] || WEAPONS.fist;
}
function weaponCanSwing(){
  const w = weaponParams();
  return !state.weaponCds || (state.weaponCds[w.id] || 0) <= 0;
}

function trySwitchWeapon(key){
  if (!state.started || state.ended) return;
  const id = Object.keys(WEAPONS).find(k => WEAPONS[k].key === key);
  if (!id) return;
  const w = WEAPONS[id];
  if (state.weaponsOwned.indexOf(id) < 0){
    toast(`你还没有${w.name}。`, 1300);
    return;
  }
  if (state.weapon === id) return;
  state.weapon = id;
  updateWeaponHUD();
  toast(`${w.icon} 已切换：${w.name}（锋距 ${w.range.toFixed(1)}m）`, 1500);
  audio.beep(420 + w.key * 120, 0.07, 0.05, 'triangle');
  if (state.weaponsOwned.length >= 4) unlockAch('armed4');
}

/* 滚轮循环切换已拥有武器（main.js 的 wheel 事件挂钩调用）。
   dir=1 正向（向后滚）、dir=-1 反向。 */
function cycleWeapon(dir){
  const order = Object.keys(WEAPONS).filter(k => state.weaponsOwned.indexOf(k) >= 0);
  if (order.length < 2) return;
  let idx = order.indexOf(state.weapon);
  if (idx < 0) idx = 0;
  const nxt = order[(idx + dir + order.length) % order.length];
  if (nxt === state.weapon) return;
  state.weapon = nxt;
  updateWeaponHUD();
  const w = WEAPONS[nxt];
  toast(`${w.icon} ${w.name}（滚轮切换）`, 1100);
  audio.beep(420 + w.key * 90, 0.06, 0.05, 'triangle');
}

/* 挥击：触发动画、冷却与专属音效；命中效果由 combat 负责 */
function weaponSwing(){
  const w = weaponParams();
  state.weaponCds[w.id] = w.cd;
  swingTd = w.swingT;
  kickView(0.018 + w.amp * 0.02, (Math.random() - 0.5) * 0.02);
  /* 专属挥空音效 */
  if (w.id === 'fist'){
    if (typeof audioWhoosh === 'function') audioWhoosh();
  } else if (w.id === 'keyboard'){
    audio.beep(620, 0.04, 0.05, 'square');
    setTimeout(() => audio.beep(480, 0.04, 0.05, 'square'), 55);
    setTimeout(() => audio.beep(300, 0.05, 0.05, 'square'), 110);
  } else if (w.id === 'chair'){
    if (typeof audioWhoosh === 'function') audioWhoosh();
    setTimeout(() => audio.beep(65, 0.2, 0.09, 'sawtooth'), w.swingT * 500);
  } else if (w.id === 'ruler'){
    if (typeof audioWhoosh === 'function') audioWhoosh();
    audio.beep(1500, 0.03, 0.03, 'square');
  } else if (w.id === 'chalk'){
    /* 粉笔发音脆响，发射音由 punchThrow 弹道负责 */
    audio.beep(1700, 0.03, 0.04, 'square');
  } else if (w.id === 'eraser'){
    if (typeof audioWhoosh === 'function') audioWhoosh();
  }
}

/* =========================================================
   手持模型（第一人称）
   ========================================================= */
function ensureWeaponView(){
  if (wvFist) return;
  /* 拳头 */
  wvFist = new THREE.Mesh(
    getSphereGeo(0.075, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd0a070, roughness: 0.7 })
  );
  wvFist.position.set(0.02, -0.02, -0.05);

  /* 键盘：握持面朝前，加几排键帽 */
  wvKeyboard = new THREE.Group();
  const kbBody = new THREE.Mesh(
    getBoxGeo(0.32, 0.032, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: 0.45 })
  );
  kbBody.rotation.x = -Math.PI / 2 * 0.72;
  wvKeyboard.add(kbBody);
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xd8dee8, roughness: 0.4 });
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 9; col++){
      const k = new THREE.Mesh(getBoxGeo(0.028, 0.008, 0.026), keyMat);
      k.position.set(-0.14 + col * 0.034, 0.032, 0.05 - row * 0.032);
      k.rotation.x = -Math.PI / 2 * 0.72;
      wvKeyboard.add(k);
    }

  /* 椅子：四条腿 + 座面 + 靠背 */
  wvChair = new THREE.Group();
  const seat = new THREE.Mesh(
    getBoxGeo(0.26, 0.03, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x6b5137, roughness: 0.6 })
  );
  seat.position.set(0, 0.02, 0);
  wvChair.add(seat);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2b303b, roughness: 0.5 });
  for (const dx of [-0.105, 0.105])
    for (const dz of [-0.105, 0.105]){
      const leg = new THREE.Mesh(getBoxGeo(0.028, 0.2, 0.028), legMat);
      leg.position.set(dx, -0.095, dz);
      wvChair.add(leg);
    }
  for (const dx of [-0.1, 0.1]){
    const post = new THREE.Mesh(getBoxGeo(0.024, 0.24, 0.024), legMat);
    post.position.set(dx, 0.06, 0.11);
    wvChair.add(post);
  }
  const back = new THREE.Mesh(
    getBoxGeo(0.23, 0.1, 0.024),
    new THREE.MeshStandardMaterial({ color: 0x6b5137, roughness: 0.6 })
  );
  back.position.set(0, 0.15, 0.11);
  wvChair.add(back);

  /* 粉笔头：白色短圆柱 */
  wvChalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.11, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
  );
  wvChalk.rotation.x = Math.PI / 2;

  /* 橡皮：白方块 */
  wvEraser = new THREE.Mesh(
    getBoxGeo(0.075, 0.036, 0.13),
    new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.55 })
  );

  /* 直尺：细长突刺物 */
  wvRuler = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.46, 8),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.35, metalness: 0.2 })
  );
  weaponView.add(wvFist, wvKeyboard, wvChair, wvRuler, wvChalk, wvEraser);
  wvKeyboard.visible = false;
  wvChair.visible = false;
  wvRuler.visible = false;
  wvChalk.visible = false;
  wvEraser.visible = false;
  scene.add(weaponView);
}

/* 世界内拾取物的迷你模型：直接复制手持模型造型建一个简化版 */
function makeWeaponPickupMesh(kind){
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    getBoxGeo(0.3, 0.05, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: 0.5 })
  );
  g.add(base);
  if (kind === 'chair'){
    base.scale.set(0.8, 0.7, 0.35);
    base.position.y = 0.1;
  } else if (kind === 'keyboard'){
    base.position.y = 0.18;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.012, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0x57e389, roughness: 0.4 })
    );
    ring.position.y = -0.02; ring.rotation.x = Math.PI / 2;
    g.add(ring);
  } else if (kind === 'ruler'){
    base.scale.set(0.12, 0.012, 1.1);
    base.material = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.35 });
  } else if (kind === 'chalk'){
    base.scale.set(0.5, 0.02, 0.5);
    base.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    base.position.y = 0.2;
  } else if (kind === 'eraser'){
    base.scale.set(1.5, 0.35, 0.8);
    base.material = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.55 });
    base.position.y = 0.2;
  }

  const glow = new THREE.Mesh(
    getSphereGeo(0.17, 10, 10),
    new THREE.MeshBasicMaterial({
      color: 0xff8a3d, transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  glow.position.y = 0.32;
  g.add(glow);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.26, 20),
    new THREE.MeshBasicMaterial({
      color: 0xff8a3d, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  return g;
}

function spawnWeaponPickupAt(kind, x, z){
  if (!WEAPONS[kind]) return;
  if (state.weaponsOwned.indexOf(kind) >= 0) return;   // 已拥有就不再刷
  if (collides(x, z, 0.35)) return;
  const group = makeWeaponPickupMesh(kind);
  group.position.set(x, 0, z);
  scene.add(group);
  wpPickups.push({ group, kind, t: Math.random() * 7 });
}

/* 打倒监考：刷出未拥有的神器（combat.js 挂钩） */
function spawnWeaponPickups(){
  for (const s of WP_PICK_SPOTS) spawnWeaponPickupAt(s.kind, s.x, s.z);
  if (wpPickups.length){
    toast('\u{1F4E6} 考场各处浮现出奇怪的光……（走近拾取新武器）', 2600);
  }
}

/* 保安掉落：小概率掉一件未拥有的武器（arcade.js 挂钩），返回是否掉落 */
function tryDropWeaponPickup(x, z){
  const missing = Object.keys(WEAPONS).filter(k => state.weaponsOwned.indexOf(k) < 0);
  if (!missing.length) return false;
  if (wpPickups.length >= 3) return false;
  if (Math.random() > 0.05) return false;
  const kind = missing[Math.floor(Math.random() * missing.length)];
  spawnWeaponPickupAt(kind, x, z);
  return true;
}

function pickWeaponPickup(it){
  const w = WEAPONS[it.kind];
  wpPickups.splice(wpPickups.indexOf(it), 1);
  scene.remove(it.group);
  if (w){
    state.weaponsOwned.push(w.id);
    state.weapon = w.id;                 // 拾取即装备，方便试手感
    updateWeaponHUD();
    floatTextAt(it.group.position, `拾起 ${w.name}!`, 'ft-buff');
    toast(`${w.icon} 捡到了${w.name}！按数字键 ${w.key} 切换（锋距 ${w.range.toFixed(1)}m）`, 2200);
    audio.beep(520, 0.08, 0.05, 'triangle');
    setTimeout(() => audio.beep(780, 0.1, 0.05, 'triangle'), 90);
    if (state.weaponsOwned.length >= 4) unlockAch('armed4');
  }
}

/* =========================================================
   HUD
   ========================================================= */
function updateWeaponHUD(){
  const hud = $('weaponHud');
  if (!hud) return;
  let html = '';
  for (const id of Object.keys(WEAPONS)){
    const w = WEAPONS[id];
    const owned = state.weaponsOwned.indexOf(id) >= 0;
    const cur = state.weapon === id;
    html += '<div class="wslot' + (owned ? ' owned' : ' locked') + (cur ? ' cur' : '') + '"'
         +  ' data-id="' + id + '">'
         +  '<span class="wkey">' + w.key + '</span>'
         +  '<span class="wic">' + (owned ? w.icon : '\u{1F512}') + '</span>'
         +  '<span class="wname">' + (owned ? w.name : '未获得') + '</span>'
         +  '<i class="wcd" style="width:' + cdPctFor(id).toFixed(1) + '%"></i>'
         +  '</div>';
  }
  hud.innerHTML = html;
}

function cdPctFor(id){
  const w = WEAPONS[id];
  if (!w || !w.cd) return 0;
  return Math.min(100, (state.weaponCds[id] || 0) / w.cd * 100);
}

function updateWeaponHUDCd(){
  const slots = document.querySelectorAll('#weaponHud .wslot');
  for (let i = 0; i < slots.length; i++){
    const sl = slots[i];
    const wcd = sl.querySelector('.wcd');
    if (!wcd) continue;
    wcd.style.width = cdPctFor(sl.getAttribute('data-id')).toFixed(1) + '%';
  }
}

/* =========================================================
   每帧（arcade 的 updateArcade 挂钩调用）
   ========================================================= */
const WV_ROT_X_BASE = { fist: 0, keyboard: 0, chair: 0, ruler: Math.PI / 2, chalk: Math.PI / 2, eraser: 0 };

function updateWeapons(realDt, worldDt){
  if (!state.started || state.ended) return;
  ensureWeaponView();

  /* HUD 只在世界视图显示（开局前/暂停/翻窗去厕所等一律隐藏） */
  const wh = $('weaponHud');
  if (wh) wh.classList.toggle('hidden', state.view !== 'world');

  /* 各武器分别充能（切换武器随时可用） */
  let anyCd = false;
  for (const k in state.weaponCds){
    if (state.weaponCds[k] > 0){
      state.weaponCds[k] -= realDt;
      anyCd = true;
    }
  }
  if (anyCd) updateWeaponHUDCd();

  /* 手持模型：跟随相机（世界视图才显示） */
  const inWorld = state.view === 'world';
  weaponView.visible = inWorld;
  weaponView.children.forEach(c => { c.visible = false; });
  const cur = state.weapon === 'keyboard' ? wvKeyboard
            : state.weapon === 'chair'    ? wvChair
            : state.weapon === 'ruler'    ? wvRuler
            : state.weapon === 'chalk'    ? wvChalk
            : state.weapon === 'eraser'   ? wvEraser
            : wvFist;
  if (cur && inWorld) cur.visible = true;

  if (!inWorld){
    updateWeaponPickups(realDt, 0);
    return;
  }
  /* 投掷物物理（世界时间：顿帧/慢放时弹道同步凝滞） */
  updateThrows(worldDt || realDt);

  const f = _wvFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = _wvRight.crossVectors(f, _wvUp).normalize();
  weaponView.position.copy(camera.position)
    .addScaledVector(f, 0.42)
    .addScaledVector(right, 0.26)
    .addScaledVector(_wvUp, -0.31);
  weaponView.quaternion.copy(camera.quaternion);

  /* 挥击动画：下劈曲线 + 突刺位移 */
  if (cur){
    const w = weaponParams();
    const baseX = WV_ROT_X_BASE[w.id] || 0;
    if (swingTd > 0){
      swingTd -= realDt;
      const p = 1 - Math.max(0, swingTd / w.swingT);
      const s = Math.sin(p * Math.PI);
      cur.rotation.x = baseX - 0.18 - w.amp * s;
      cur.rotation.y = (w.id === 'chair' ? -0.35 : w.id === 'ruler' ? 0 : -0.12) * s;
      cur.position.z = -w.poke * s;
    } else {
      /* 归位 + 呼吸浮动 */
      cur.rotation.x = baseX - 0.18;
      cur.rotation.y = 0;
      cur.position.z = Math.sin(performance.now() * 0.003) * 0.008;
      cur.position.y = Math.sin(performance.now() * 0.004) * 0.008 - 0;
    }
  }

  updateWeaponPickups(realDt, 1);
}

const _wvFwd = new THREE.Vector3();
const _wvRight = new THREE.Vector3();
const _wvUp = new THREE.Vector3(0, 1, 0);
const _thDir = new THREE.Vector3();

/* =========================================================
   投掷物：粉笔（直快）/ 橡皮（高抛物重掷）
   ========================================================= */
const THROW_GRAVITY = 4.5;   // 投掷物受空气托举：弹道能飞满整间教室（约 20m 对角）

/* 出拳链路转向投掷（combat.js 在武器为投掷类时调用） */
function punchThrow(w){
  const dir = _thDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  let mesh;
  if (w.id === 'chair'){
    /* 整把椅子飞出去：座面 + 四腿 + 靠背 */
    mesh = new THREE.Group();
    const seatM = new THREE.MeshStandardMaterial({ color: 0x6b5137, roughness: 0.6 });
    const legM  = new THREE.MeshStandardMaterial({ color: 0x2b303b, roughness: 0.5 });
    const seat = new THREE.Mesh(getBoxGeo(0.2, 0.02, 0.2), seatM);
    mesh.add(seat);
    for (const sx of [-0.075, 0.075])
      for (const sz of [-0.075, 0.075]){
        const leg = new THREE.Mesh(getBoxGeo(0.02, 0.16, 0.02), legM);
        leg.position.set(sx, -0.09, sz);
        mesh.add(leg);
      }
    const back = new THREE.Mesh(getBoxGeo(0.18, 0.09, 0.02), seatM);
    back.position.set(0, 0.06, 0.095);
    mesh.add(back);
  } else {
    mesh = new THREE.Mesh(
      w.id === 'chalk'
        ? new THREE.CylinderGeometry(w.throwSize, w.throwSize, w.throwSize * 3.2, 7)
        : getBoxGeo(w.throwSize * 2, w.throwSize * 1.3, w.throwSize * 1.6),
      new THREE.MeshStandardMaterial({ color: w.projColor, roughness: 0.55 })
    );
  }
  mesh.position.copy(camera.position)
    .addScaledVector(dir, 0.45)
    .addScaledVector(_wvUp, -0.12);
  (typeof activeWorldScene === 'function' ? activeWorldScene() : scene).add(mesh);

  const vel = dir.clone().multiplyScalar(w.throwSpeed);
  vel.y += w.throwLift;
  thrownList.push({
    mesh, vel, life: 3.0,
    dmg: w.dmg, kb: w.kb, id: w.id,
    aoeR: w.aoeR || 0, aoeDmg: w.aoeDmg || 0, aoeKb: w.aoeKb || 0,
    spin: (w.id === 'chair' ? 13 : 6) + Math.random() * 6
  });
  kickView(0.014 + Math.min(0.02, w.throwSize), 0);
  if (typeof audioWhoosh === 'function') audioWhoosh();
}

function updateThrows(worldDt){
  for (let i = thrownList.length - 1; i >= 0; i--){
    const it = thrownList[i];
    it.life -= worldDt;
    it.vel.y -= THROW_GRAVITY * worldDt;
    /* 子步积分：高速弹道按每段 ≤0.12m 细分，
       防止远距离高速弹体一帧掠过保安造成漏判 */
    const stepX = it.vel.x * worldDt;
    const stepY = it.vel.y * worldDt;
    const stepZ = it.vel.z * worldDt;
    const steps = Math.max(1, Math.ceil(Math.hypot(stepX, stepZ) / 0.12));
    const dx = stepX / steps;
    const dy = stepY / steps;
    const dz = stepZ / steps;

    let done = false, hitGuard = false;
    for (let s = 0; s < steps && !done; s++){
      const p = it.mesh.position;
      it.mesh.position.x += dx;
      it.mesh.position.z += dz;
      it.mesh.position.y += dy;
      it.mesh.rotation.x += it.spin * worldDt / steps;
      it.mesh.rotation.z += it.spin * 0.8 * worldDt / steps;

      /* 撞墙 / 高桌椅：粉碎（低矮桌椅可越顶） */
      if (throwCollides(p)){ done = true; break; }
      /* 出界 / 落地 / 超时 */
      if (it.life <= 0 || p.y < 0.02 || p.y > 3.2 ||
          Math.abs(p.x) > 8 || Math.abs(p.z) > 7.5){ done = true; break; }
      /* 命中首个活保安：不限距离，撞到就生效 */
      for (let gi = 0; gi < securityGuards.length; gi++){
        const g = securityGuards[gi];
        if (!g.userData.alive) continue;
        const hx = p.x - g.group.position.x;
        const hz = p.z - g.group.position.z;
        if (hx * hx + hz * hz < 0.16 && p.y < 1.9){
          killGuard(g, it.dmg, it.kb);   // 已含连击/飘字/掉落钩子
          done = true; hitGuard = true;
          break;
        }
      }
      /* 命中监考老师：任何距离，砸中就触发"老师夺门叫保安"剧情 */
      if (!done && teacher && !teacher.userData.leaving){
        const hx = p.x - teacher.group.position.x;
        const hz = p.z - teacher.group.position.z;
        if (hx * hx + hz * hz < 0.16 && p.y < 1.9){
          punchTeacher(true);
          done = true; hitGuard = true;
        }
      }
    }
    if (done) impactThrow(i, hitGuard);
  }
}

function impactThrow(idx, hitGuard){
  const it = thrownList[idx];
  const p = it.mesh.position.clone();
  scene.remove(it.mesh);
  thrownList.splice(idx, 1);
  /* 椅子：落点群伤（砸中人 / 砸墙 / 落地都会炸） */
  let aoeN = 0;
  if (it.aoeR) aoeN = explodeThrowAt(p, it);
  /* 粉笔碎成白灰；橡皮击出闷尘；椅子炸出木屑 */
  if (typeof spawnSparks === 'function'){
    spawnSparks(p.x, p.y, p.z,
                it.id === 'chalk' ? 5 : it.id === 'eraser' ? 3 : 9,
                it.id === 'chalk' ? 0xffffff : it.id === 'eraser' ? 0xd8d2c4 : 0xc8a05a);
  }
  if (hitGuard || aoeN > 0){
    audio.punch();
    kickView(0.05, (Math.random() - 0.5) * 0.05);
    hitStop = Math.max(hitStop, aoeN > 1 ? 0.12 : 0.07);
    if (typeof comboHitStopBonus === 'function') hitStop += comboHitStopBonus() * 0.5;
  } else {
    audio.beep(it.id === 'chalk' ? 1300 : it.id === 'eraser' ? 220 : 90, 0.05, 0.05, 'square');
  }
}

/* 椅子爆炸：以落点为爆心，半径 aoeR 内群伤 + 击退；老师也炸得到 */
function explodeThrowAt(p, it){
  let n = 0;
  for (const g of securityGuards){
    if (!g.userData.alive) continue;
    const dx = g.group.position.x - p.x;
    const dz = g.group.position.z - p.z;
    if (dx * dx + dz * dz <= it.aoeR * it.aoeR){
      killGuard(g, it.aoeDmg, it.aoeKb);   // 已含补员/连击/掉落钩子
      n++;
    }
  }
  if (teacher && !teacher.userData.leaving){
    const dx = teacher.group.position.x - p.x;
    const dz = teacher.group.position.z - p.z;
    if (dx * dx + dz * dz <= it.aoeR * it.aoeR &&
        Math.abs(p.y - 1.65) < 1.3) punchTeacher(true);
  }
  if (n > 0){
    toast(`\u{1FA91} 椅子砸落，${n} 名保安被砸飞！`, 1500);
    if (typeof arcadeHookPunch === 'function') arcadeHookPunch(n);
  }
  return n;
}

function clearThrows(){
  for (const it of thrownList) if (it.mesh.parent) it.mesh.parent.remove(it.mesh);
  thrownList.length = 0;
}

/* 高度感知障碍碰撞：桌椅级低障碍可越过，墙/柱不可（障碍表是 2D 的，
   用“两维都小 ≈ 桌椅”作为启发） */
function throwCollides(p){
  for (let i = 0; i < obstacles.length; i++){
    const o = obstacles[i];
    if (Math.abs(p.x - o.x) < o.hw + 0.12 && Math.abs(p.z - o.z) < o.hd + 0.12){
      const low = o.hw <= 1.15 && o.hd <= 1.15;
      if (!low || p.y < 0.85) return true;
    }
  }
  return false;
}

/* mode: 0 = 静止（不拾取），1 = 正常 */
function updateWeaponPickups(realDt, mode){
  for (let i = wpPickups.length - 1; i >= 0; i--){
    const it = wpPickups[i];
    it.t += realDt;
    it.group.position.y = 0.34 + Math.sin(it.t * 2.4) * 0.07;
    it.group.rotation.y += realDt * 1.6;
    if (mode && Math.hypot(state.pos.x - it.group.position.x,
                           state.pos.z - it.group.position.z) < WP_PICK_R){
      pickWeaponPickup(it);
    }
  }
}