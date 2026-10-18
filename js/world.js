'use strict';
/* =========================================================
   world —— 考场场景：房间 / 桌椅 / 显示器 / 人物 / 保安
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   场景搭建
   ========================================================= */
const ROOM_W = 16, ROOM_D = 14, ROOM_H = 3.4;
const DOOR_W = 0.95, DOOR_H = 2.15;   // 门洞尺寸（+X 墙上的开口）

/* 终局白光：门板 / 门口光面 / 外扩辉光 / 地面投射 / 点光源 */
let doorGroup = null, doorLightMesh = null, doorGlowMesh = null,
    doorFloorMesh = null, doorPointLight = null, doorFloorTex = null;
let doorOpenT = 0;

function buildRoom(){
  const W = ROOM_W, D = ROOM_D, H = ROOM_H;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    mat(0x22262e, { roughness: 0.96 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const gridHelper = new THREE.GridHelper(W, 16, 0x2e3442, 0x2a2f3b);
  gridHelper.position.y = 0.005;
  scene.add(gridHelper);

  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    mat(0x171b23, { roughness: 1 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  scene.add(ceil);

  const wallMat = mat(0x2b313d, { roughness: 0.92 });
  const mkWall = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
  };
  mkWall(W, H,  0, H/2, -D/2, 0);
  mkWall(W, H,  0, H/2,  D/2, Math.PI);
  mkWall(D, H, -W/2, H/2, 0, Math.PI/2);
  /* +X 墙留出门洞：左右两段 + 顶部一段 */
  const sideW = (D - DOOR_W) / 2;
  mkWall(sideW, H, W/2, H/2, -(D/2 - sideW / 2), -Math.PI/2);
  mkWall(sideW, H, W/2, H/2,  (D/2 - sideW / 2), -Math.PI/2);
  mkWall(DOOR_W, H - DOOR_H, W/2, DOOR_H + (H - DOOR_H) / 2, 0, -Math.PI/2);

  /* 墙面障碍 */
  addObstacle(-W/2 - 0.5, 0, 0.5, D/2 + 1);
  addObstacle( W/2 + 0.5, 0, 0.5, D/2 + 1);
  addObstacle(0, -D/2 - 0.5, W/2 + 1, 0.5);
  addObstacle(0,  D/2 + 0.5, W/2 + 1, 0.5);

  /* 吊灯（只保留 3 个 PointLight，显示器不再单独挂灯） */
  for (let i = -1; i <= 1; i++){
    const lamp = new THREE.Mesh(
      getBoxGeo(3.4, 0.06, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xfff4dc })
    );
    lamp.position.set(i * 4.6, H - 0.08, 0);
    scene.add(lamp);
    const pl = new THREE.PointLight(0xfff0d8, 0.42, 22, 2);
    pl.position.set(i * 4.6, H - 0.4, 0);
    scene.add(pl);
  }

  /* 黑板 */
  box(6, 2.0, 0.06, 0xf2f4f0, 0, 1.85, -D/2 + 0.05, scene,
    { roughness: 0.35, emissive: 0x1a1c1e, emissiveIntensity: 0.4 });
  box(6.16, 2.16, 0.03, 0x3a4150, 0, 1.85, -D/2 + 0.03, scene);

  const bc = document.createElement('canvas');
  bc.width = 1024; bc.height = 320;
  const bx = bc.getContext('2d');
  bx.fillStyle = '#f2f4f0'; bx.fillRect(0, 0, 1024, 320);
  bx.fillStyle = '#c0392b'; bx.font = 'bold 54px "Microsoft YaHei", sans-serif';
  bx.fillText('NOI 2026  竞赛守则', 60, 90);
  bx.fillStyle = '#2c3e50'; bx.font = '30px "Microsoft YaHei", sans-serif';
  bx.fillText('1. 禁止随意走动、禁止交头接耳、禁止干扰他人', 60, 160);
  bx.fillText('2. 如需去洗手间请举手示意监考老师', 60, 205);
  bx.fillText('3. 尊重监考老师，禁止任何形式的暴力行为', 60, 250);
  const boardTex = new THREE.CanvasTexture(bc);
  boardTex.anisotropy = 4;
  const boardFace = new THREE.Mesh(
    new THREE.PlaneGeometry(5.96, 1.96),
    new THREE.MeshBasicMaterial({ map: boardTex })
  );
  boardFace.position.set(0, 1.85, -D/2 + 0.085);
  scene.add(boardFace);

  /* 挂钟 */
  const clockBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.07, 32),
    mat(0xe8ecf2, { roughness: 0.4 })
  );
  clockBody.rotation.x = Math.PI / 2;
  clockBody.position.set(6.2, 2.6, -D/2 + 0.08);
  scene.add(clockBody);
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.29, 32),
    new THREE.MeshBasicMaterial({ color: 0xfbfcfe })
  );
  clockFace.position.set(6.2, 2.6, -D/2 + 0.13);
  scene.add(clockFace);
  const hh = box(0.022, 0.15, 0.01, 0x1a1a1a, 6.2, 2.65, -D/2 + 0.14, scene);
  const mm = box(0.018, 0.23, 0.01, 0x333333, 6.2, 2.71, -D/2 + 0.145, scene);
  hh.rotation.z = 0.6; mm.rotation.z = -1.1;

  /* 门 */
  /* 注意：必须赋值给模块级 doorGroup（不能加 const，否则会遮蔽它，
     updateDoorLight / openTheDoor 拿到的就永远是 null） */
  doorGroup = new THREE.Group();
  doorGroup.position.set(W/2 - 0.04, 0, -0.475);   /* 铰链在门左侧 */
  scene.add(doorGroup);
  box(0.07, 2.15, 0.95, 0x4a3a2e, 0, 1.075, 0.475, doorGroup, { roughness: 0.7 });
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10),
    mat(0xc9b037, { metalness: 0.85, roughness: 0.28 })
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.set(-0.08, 1.05, 0.155);
  doorGroup.add(handle);

  const signC = document.createElement('canvas');
  signC.width = 256; signC.height = 96;
  const sx = signC.getContext('2d');
  sx.fillStyle = '#1f6b4a'; sx.fillRect(0, 0, 256, 96);
  sx.fillStyle = '#fff'; sx.font = 'bold 46px "Microsoft YaHei"';
  sx.textAlign = 'center'; sx.fillText('出 口', 128, 64);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.19),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signC) })
  );
  sign.position.set(W/2 - 0.09, 2.42, 0);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);

  /* ---------- 终局白光（打完全部保安后才点亮） ---------- */
  /* 门口光面：填满门洞的极亮白面，从房内可见 */
  doorLightMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_W, DOOR_H),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide
    })
  );
  doorLightMesh.position.set(W/2 + 0.14, DOOR_H / 2, 0);
  doorLightMesh.rotation.y = -Math.PI / 2;
  doorLightMesh.visible = false;
  scene.add(doorLightMesh);

  /* 外扩辉光：门口外侧更大的一层加法白光 */
  doorGlowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 3.4),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  doorGlowMesh.position.set(W/2 + 0.42, 1.5, 0);
  doorGlowMesh.rotation.y = -Math.PI / 2;
  doorGlowMesh.visible = false;
  scene.add(doorGlowMesh);

  /* 地面投射：门口洒进房内的光斑，亮度随距离衰减 */
  const fc = document.createElement('canvas');
  fc.width = 256; fc.height = 256;
  const fx = fc.getContext('2d');
  /* 亮端在画布右侧：plane 的 u 轴朝 +X，即门口一侧最亮、向房内衰减 */
  const grad = fx.createLinearGradient(256, 0, 0, 0);
  grad.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  fx.fillStyle = grad;
  fx.fillRect(0, 0, 256, 256);
  doorFloorTex = new THREE.CanvasTexture(fc);
  doorFloorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 2.8),
    new THREE.MeshBasicMaterial({
      map: doorFloorTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  doorFloorMesh.rotation.x = -Math.PI / 2;
  doorFloorMesh.position.set(W/2 - 2.1, 0.03, 0);
  doorFloorMesh.visible = false;
  scene.add(doorFloorMesh);

  /* 门口点光源：让白光真正照到考场里（压迫感中的唯一亮源） */
  doorPointLight = new THREE.PointLight(0xffffff, 0, 16, 2);
  doorPointLight.userData.noTensionDim = true;   /* 豁免紧张值调光 */
  doorPointLight.position.set(W/2 + 0.5, 1.6, 0);
  scene.add(doorPointLight);

  /* 窗 */
  box(0.06, 1.6, 3.0, 0x3a4150, -W/2 + 0.04, 1.9, 0, scene);
  const winGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.42),
    new THREE.MeshBasicMaterial({ color: 0x6d8fb8 })
  );
  winGlass.position.set(-W/2 + 0.09, 1.9, 0);
  winGlass.rotation.y = Math.PI / 2;
  scene.add(winGlass);

  /* 饮水机 */
  const cooler = new THREE.Group();
  cooler.position.set(-6.6, 0, 5.6);
  scene.add(cooler);
  box(0.36, 1.0, 0.36, 0xdfe4ec, 0, 0.5, 0, cooler, { roughness: 0.5 });
  box(0.3, 0.36, 0.3, 0x8fd0f0, 0, 1.18, 0, cooler,
    { transparent: true, opacity: 0.75, roughness: 0.15 });
  box(0.4, 0.04, 0.4, 0x9aa4b4, 0, 1.0, 0, cooler);
  addObstacle(-6.6, 5.6, 0.25, 0.25);
}

function drawDeskScreen(cx, w, h){
  cx.fillStyle = '#0b0f16'; cx.fillRect(0, 0, w, h);
  cx.fillStyle = '#131b26'; cx.fillRect(0, 0, w, 34);
  cx.fillStyle = '#5b8cff'; cx.fillRect(0, 32, w, 2);
  cx.fillStyle = '#8ea6d8'; cx.font = 'bold 16px Consolas, monospace';
  cx.fillText('NOI 2026  Contest Environment', 14, 23);

  /* 题目列表 */
  cx.fillStyle = '#1a2330'; cx.fillRect(12, 48, w - 24, 100);
  cx.font = '15px Consolas, monospace';
  const probs = (state.problems && state.problems.length) ? state.problems : [];
  probs.slice(0, 4).forEach((p, i) => {
    const sc = state.score[p.id] || 0;
    const maxScore = p.max || 100;
    const label = (p.id + '  ' + p.name).slice(0, 24);
    const pad = ' '.repeat(Math.max(1, 24 - label.length));
    let status, color;
    if (sc >= maxScore)      { status = '[ 已 AC ]';  color = '#4fd1c5'; }
    else if (sc > 0)         { status = '[ 部分分 ]'; color = '#ffcc57'; }
    else                     { status = '[ 未提交 ]'; color = '#8a92a5'; }
    cx.fillStyle = color;
    cx.fillText(label + pad + status, 26, 76 + i * 24);
  });

  cx.fillStyle = '#3a4456'; cx.fillRect(12, 152, w - 24, 2);

  /* 代码预览：当前第一题的 starter 前 9 行 */
  cx.font = '14px Consolas, monospace';
  const first = probs[0];
  const lines = (first && first.starter)
    ? first.starter.split('\n').slice(0, 9)
    : ['#include <bits/stdc++.h>', 'using namespace std;', '', 'int main() {', '    // ...', '    return 0;', '}'];
  lines.forEach((l, i) => {
    let color = '#8fa8c8';
    if (/^\s*#/.test(l))                     color = '#c586c0';
    else if (/\/\//.test(l))                 color = '#5a6b80';
    else if (/(cin|cout|return|int main)/.test(l)) color = '#9cdcfe';
    cx.fillStyle = color;
    cx.fillText(l.slice(0, 62), 24, 182 + i * 22);
  });
}

function updateAllDeskScreens(){
  for (const s of deskScreens){
    drawDeskScreen(s.ctx, 640, 384);
    s.tex.needsUpdate = true;
  }
}

/* 合并短时间内的多次调用（例如连续提交），避免 6 张画布反复全量重绘 */
let deskScreenTimer = null;
function scheduleDeskScreensUpdate(){
  if (deskScreenTimer) return;
  deskScreenTimer = setTimeout(() => {
    deskScreenTimer = null;
    updateAllDeskScreens();
  }, 80);
}

function buildDesk(x, z, withMonitor){
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);

  const woodTop = 0x6b5137;
  box(1.9, 0.06, 0.95, woodTop, 0, 0.74, 0, g);
  for (const dx of [-0.88, 0.88])
    for (const dz of [-0.4, 0.4])
      box(0.06, 0.74, 0.06, 0x2b303b, dx, 0.37, dz, g);
  box(1.9, 0.4, 0.03, 0x50596a, 0, 0.55, -0.44, g);

  /* 桌子碰撞（桌腿范围） */
  addObstacle(x, z, 0.92, 0.45);

  if (withMonitor){
    box(0.46, 0.025, 0.22, 0x22262e, 0, 0.775, -0.28, g);
    box(0.07, 0.34, 0.07, 0x2e3440, 0, 0.95, -0.30, g);
    box(0.80, 0.48, 0.035, 0x15181f, 0, 1.26, -0.30, g);

    /* 屏幕贴图 */
    const sc = document.createElement('canvas');
    sc.width = 640; sc.height = 384;
    const sx = sc.getContext('2d');
    drawDeskScreen(sx, 640, 384);
    const tex = new THREE.CanvasTexture(sc);
    tex.anisotropy = 4;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 0.44),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    face.position.set(0, 1.26, -0.278);
    g.add(face);

    /* 记录以便后续刷新（切题 / 得分 / 读档时重新绘制） */
    deskScreens.push({ ctx: sx, tex: tex });

    /* 原先每台显示器一盏 PointLight，累计 6 盏，会把光照 shader 拖慢；
       这里换成一块微弱自发光平面，零光照开销。 */
    const glowPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.34),
      new THREE.MeshBasicMaterial({
        color: 0x35507f, transparent: true, opacity: 0.18, depthWrite: false
      })
    );
    glowPanel.position.set(0, 1.26, -0.06);
    g.add(glowPanel);

    /* 键盘 */
    const kbC = document.createElement('canvas');
    kbC.width = 512; kbC.height = 180;
    const kx = kbC.getContext('2d');
    kx.fillStyle = '#1c2028'; kx.fillRect(0, 0, 512, 180);
    kx.fillStyle = '#2c323e';
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 16; c++){
        const w = (r === 5 && c > 3 && c < 9) ? 40 : 26;
        kx.fillRect(10 + c * 31, 12 + r * 27, w, 21);
      }
    const kbTex = new THREE.CanvasTexture(kbC);
    const kb = new THREE.Mesh(
      getBoxGeo(0.46, 0.022, 0.16),
      new THREE.MeshStandardMaterial({ map: kbTex, roughness: 0.75 })
    );
    kb.position.set(0, 0.775, 0.08);
    g.add(kb);

    box(0.065, 0.028, 0.105, 0x1e222a, 0.38, 0.778, 0.10, g, { roughness: 0.6 });

    /* 水杯 */
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.03, 0.10, 16),
      new THREE.MeshStandardMaterial({
        color: 0xdfe6f2, transparent: true, opacity: 0.55, roughness: 0.2
      })
    );
    cup.position.set(0.66, 0.82, -0.02);
    g.add(cup);
    cup.userData.interact = { label: '喝水', action: () => drinkWater() };
    interactables.push(cup);

    /* 草稿纸 */
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.30, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0xf2eee3, roughness: 0.95, side: THREE.DoubleSide
      })
    );
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = 0.14;
    paper.position.set(-0.62, 0.772, 0.06);
    g.add(paper);
    paper.userData.interact = { label: '查看草稿纸', action: () => openPaper() };
    interactables.push(paper);

    /* 笔 */
    const pen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.15, 8),
      mat(0x2a2f3a, { roughness: 0.5 })
    );
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = 0.3;
    pen.position.set(-0.62, 0.782, 0.20);
    g.add(pen);

    face.userData.interact = { label: '使用电脑', action: () => openCode() };
    interactables.push(face);
  }

  /* 椅子 */
  const chair = new THREE.Group();
  chair.position.set(0, 0, 0.92);
  g.add(chair);
  box(0.46, 0.05, 0.46, 0x2e3440, 0, 0.45, 0, chair);
  box(0.46, 0.52, 0.05, 0x2e3440, 0, 0.72, 0.21, chair);
  box(0.05, 0.45, 0.05, 0x242a34, 0, 0.22, 0, chair);

  return g;
}

function buildPerson(x, z, shirtColor, rotY, startPose){
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY || 0;
  scene.add(g);

  const skin = 0xd8a878, pants = 0x2a3140;

  // 坐姿腿组
  const legsSit = new THREE.Group();
  box(0.17, 0.17, 0.44, pants, -0.115, 0.52, 0.22, legsSit);
  box(0.17, 0.17, 0.44, pants,  0.115, 0.52, 0.22, legsSit);
  box(0.16, 0.44, 0.16, pants, -0.115, 0.24, 0.42, legsSit);
  box(0.16, 0.44, 0.16, pants,  0.115, 0.24, 0.42, legsSit);
  g.add(legsSit);

  // 站姿腿组（垂直向下）
  const legsStand = new THREE.Group();
  box(0.17, 0.9, 0.17, pants, -0.115, 0.45, 0, legsStand);
  box(0.17, 0.9, 0.17, pants,  0.115, 0.45, 0, legsStand);
  g.add(legsStand);

  if (startPose === 'stand') legsSit.visible = false;
  else legsStand.visible = false;

  box(0.44, 0.58, 0.27, shirtColor, 0, 1.09, 0.01, g);
  const armL = box(0.115, 0.42, 0.115, shirtColor, -0.29, 1.06, 0.13, g);
  const armR = box(0.115, 0.42, 0.115, shirtColor,  0.29, 1.06, 0.13, g);

  const head = new THREE.Mesh(getSphereGeo(0.135, 16, 12), mat(skin, { roughness: 0.75 }));
  head.position.set(0, 1.52, 0.02);
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.142, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mat(0x18181c, { roughness: 1 })
  );
  hair.position.set(0, 1.535, 0.02);
  g.add(hair);

  addContactShadow(g, 0.52);

  return { group: g, armL, armR, head, legsSit, legsStand,
           phase: Math.random() * Math.PI * 2 };
}

function buildSecurityGuard(x, z, type, parent){
  type = type || 'normal';
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  (parent || scene).add(g);

  /* 更自然的人体配色 */
  const skin = 0xd9a174;
  const pants = 0x232733;
  const hatC = 0x161c28;
  let uniform = 0x2a4a72, stripec = 0xffd23c, glowc = 0xff4444;
  if (type === 'heavy'){ uniform = 0x5a262e; stripec = 0xff7a3c; glowc = 0xff6a33; }
  else if (type === 'fast'){ uniform = 0x2c4722; stripec = 0xffe66b; glowc = 0xffb020; }
  g.scale.setScalar(type === 'heavy' ? 1.16 : type === 'fast' ? 0.95 : 1);

  const mkMat = (c, rough) => new THREE.MeshStandardMaterial({
    color: c, roughness: rough == null ? 0.85 : rough, metalness: 0.05
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.48, metalness: 0.0 });
  const addMesh = (geo, mat, px, py, pz, parentObj) => {
    const mm = new THREE.Mesh(geo, mat);
    mm.position.set(px, py, pz);
    parentObj.add(mm);
    return mm;
  };
  /* 自建胶囊体：圆柱 + 两端球帽（兼容旧版本无 CapsuleGeometry） */
  const capMesh = (r, len, mat, parentObj, px, py, pz) => {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat));
    const ca = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    ca.position.y = len / 2;
    grp.add(ca);
    const cb = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    cb.position.y = -len / 2;
    grp.add(cb);
    grp.position.set(px, py, pz);
    parentObj.add(grp);
    return grp;
  };

  /* ---------- 上半身组：颠簸、冲刺前倾、肩部扭动都作用于此 ---------- */
  const body = new THREE.Group();
  g.add(body);

  /* ---- 骨盆 + 上宽下窄胸膛 + 制服细节 ---- */
  addMesh(new THREE.BoxGeometry(0.33, 0.19, 0.22), mkMat(pants, 0.9), 0, 0.875, 0, body);
  addMesh(new THREE.CylinderGeometry(0.215, 0.155, 0.58, 18), mkMat(uniform, 0.8), 0, 1.28, 0.01, body);
  addMesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 18), mkMat(0x101318, 0.6), 0, 0.985, 0.01, body);
  addMesh(new THREE.BoxGeometry(0.075, 0.055, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xd8b64a, roughness: 0.3, metalness: 0.8 }),
    0, 0.985, 0.185, body);
  addMesh(new THREE.CylinderGeometry(0.20, 0.20, 0.022, 18), mkMat(stripec, 0.5), 0, 1.02, 0.01, body);
  addMesh(new THREE.CylinderGeometry(0.196, 0.196, 0.022, 18), mkMat(stripec, 0.5), 0, 1.46, 0.01, body);
  box(0.09, 0.11, 0.03, uniform, -0.14, 1.18, 0.185, body);
  box(0.09, 0.11, 0.03, uniform,  0.14, 1.18, 0.185, body);
  addMesh(getSphereGeo(0.085, 10, 10), mkMat(uniform, 0.8), -0.378, 1.50, 0.02, body);
  addMesh(getSphereGeo(0.085, 10, 10), mkMat(uniform, 0.8),  0.378, 1.50, 0.02, body);

  /* ---- 关节手臂：上臂 + 屈肘前臂 + 手 ---- */
  function makeArm(side){
    const arm = new THREE.Group();
    arm.position.set(side * 0.372, 1.48, 0.06);
    capMesh(0.058, 0.15, mkMat(uniform, 0.8), arm, 0, -0.12, 0);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.27, 0);
    elbow.rotation.x = 0.50;   /* 曲肘：前臂明显前倾 */
    arm.add(elbow);
    capMesh(0.045, 0.13, mkMat(uniform, 0.8), elbow, 0, -0.10, 0);
    const hand = addMesh(new THREE.BoxGeometry(0.078, 0.095, 0.068), skinMat, 0, -0.21, 0.01, elbow);
    hand.rotation.x = 0.08;
    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  armL.rotation.x = -0.03;
  armR.rotation.x = -0.03;
  armL.rotation.z = 0.09;
  armR.rotation.z = -0.09;
  body.add(armL);
  body.add(armR);

  /* ---- 脖颈 + 头组（头/五官/帽子/警示灯一体，整体转向） ---- */
  /* 脖颈（拉长让头部与躯干分离） */
  addMesh(new THREE.CylinderGeometry(0.055, 0.058, 0.19, 10), skinMat, 0, 1.635, 0.02, body);
  /* 白衬衫领：两片立领衬出脖子轮廓 */
  const collMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6, metalness: 0.0 });
  const collL = addMesh(new THREE.BoxGeometry(0.08, 0.05, 0.017), collMat, -0.048, 1.53, 0.128, body);
  collL.rotation.z = 0.5;
  const collR = addMesh(new THREE.BoxGeometry(0.08, 0.05, 0.017), collMat, 0.048, 1.53, 0.128, body);
  collR.rotation.z = -0.5;
  const head = new THREE.Group();
  head.position.set(0, 1.71, 0.02);
  body.add(head);
  const skull = addMesh(new THREE.SphereGeometry(0.118, 18, 14), skinMat, 0, 0, 0, head);
  skull.scale.set(1.0, 1.06, 1.0);
  /* 耳朵 */
  addMesh(new THREE.SphereGeometry(0.022, 8, 8), skinMat, -0.116, 0.004, 0.008, head);
  addMesh(new THREE.SphereGeometry(0.022, 8, 8), skinMat,  0.116, 0.004, 0.008, head);
  /* 眼睛：白眼球 + 黑瞳 */
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.3, metalness: 0 });
  const pupMat = new THREE.MeshStandardMaterial({ color: 0x151b1f, roughness: 0.25, metalness: 0 });
  const eyeBL = addMesh(new THREE.SphereGeometry(0.024, 10, 8), eyeMat, -0.047, 0.026, 0.102, head);
  eyeBL.scale.set(0.85, 1.25, 0.45);
  const eyeBR = addMesh(new THREE.SphereGeometry(0.024, 10, 8), eyeMat,  0.047, 0.026, 0.102, head);
  eyeBR.scale.set(0.85, 1.25, 0.45);
  const puL = addMesh(new THREE.SphereGeometry(0.011, 8, 8), pupMat, -0.047, 0.025, 0.117, head);
  puL.scale.set(0.9, 1.3, 0.6);
  const puR = addMesh(new THREE.SphereGeometry(0.011, 8, 8), pupMat,  0.047, 0.025, 0.117, head);
  puR.scale.set(0.9, 1.3, 0.6);
  /* 眉毛（微斜带怒意） */
  const browMat = mkMat(0x6e4a33, 0.7);
  const browL = addMesh(new THREE.BoxGeometry(0.038, 0.011, 0.013), browMat, -0.047, 0.056, 0.107, head);
  browL.rotation.z = 0.18;
  const browR = addMesh(new THREE.BoxGeometry(0.038, 0.011, 0.013), browMat,  0.047, 0.056, 0.107, head);
  browR.rotation.z = -0.18;
  /* 鼻子：小坡形 */
  const nose = addMesh(new THREE.BoxGeometry(0.02, 0.033, 0.024), skinMat, 0, -0.011, 0.111, head);
  nose.rotation.x = -0.32;
  /* 嘴：微笑弧 */
  addMesh(new THREE.TorusGeometry(0.025, 0.008, 8, 16, Math.PI), mkMat(0x7c4030, 0.5), 0, -0.045, 0.108, head).rotation.x = Math.PI;
  /* 大檐执勤帽 */
  addMesh(new THREE.CylinderGeometry(0.123, 0.113, 0.055, 16), mkMat(hatC, 0.45), 0, 0.113, 0, head);
  addMesh(new THREE.CylinderGeometry(0.177, 0.177, 0.014, 16), mkMat(hatC, 0.45), 0, 0.084, 0.043, head);
  addMesh(new THREE.BoxGeometry(0.145, 0.011, 0.09), mkMat(0x0d1119, 0.5), 0, 0.082, 0.118, head);
  const emblem = addMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 12),
    new THREE.MeshStandardMaterial({ color: stripec, roughness: 0.3, metalness: 0.8 }),
    0, 0.112, 0.118, head);
  emblem.rotation.x = Math.PI / 2;
  /* 头顶警示灯：小支柱 + 灯球 + 光晕（随头转） */
  addMesh(new THREE.CylinderGeometry(0.011, 0.014, 0.03, 8), mkMat(0x101318, 0.6), 0, 0.158, 0.01, head);
  const warnLight = addMesh(getSphereGeo(0.036, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3333 }), 0, 0.177, 0.01, head);
  const glow = addMesh(getSphereGeo(0.09, 8, 8),
    new THREE.MeshBasicMaterial({
      color: glowc, transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, depthWrite: false
    }), 0, 0.177, 0.01, head);

  /* ---- 摆腿：大腿 + 膝盖枢轴 + 小腿 + 鞋 ---- */
  const pantsMat = mkMat(pants, 0.9);
  const shoeMat = mkMat(0x101114, 0.7);
  function makeLeg(side){
    const leg = new THREE.Group();
    leg.position.set(side * 0.115, 0.92, 0);
    /* 大腿（上粗下细） */
    addMesh(new THREE.CylinderGeometry(0.112, 0.085, 0.38, 12), pantsMat, 0, -0.19, 0, leg);
    /* 膝盖枢轴：跑步后摆腿时折弯 */
    const knee = new THREE.Group();
    knee.position.set(0, -0.38, 0);
    leg.add(knee);
    /* 膝盖头 */
    addMesh(new THREE.SphereGeometry(0.074, 10, 8), pantsMat, 0, 0.015, 0.02, knee);
    /* 小腿（上粗下细） */
    addMesh(new THREE.CylinderGeometry(0.078, 0.052, 0.44, 12), pantsMat, 0, -0.22, 0, knee);
    /* 鞋：鞋身 + 鞋尖 */
    addMesh(new THREE.BoxGeometry(0.14, 0.075, 0.26), shoeMat, 0, -0.50, 0.04, knee);
    addMesh(new THREE.BoxGeometry(0.13, 0.065, 0.05), shoeMat, 0, -0.50, -0.075, knee);
    addMesh(new THREE.BoxGeometry(0.12, 0.055, 0.08), shoeMat, 0, -0.512, 0.20, knee);
    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  g.add(legL);
  g.add(legR);
  const calfL = legL.children[1];
  const calfR = legR.children[1];

  addContactShadow(g, 0.5);

  return {
    group: g, armL, armR, head, warnLight,
    glow, legL, legR, body, calfL, calfR,
    phase: Math.random() * Math.PI * 2
  };
}

/* ---------- 保安系统 ---------- */
const securityGuards = [];
const GUARD_SPEED_BASE = 0.55;
const GUARD_SPAWN_DIST = 5.0;
const GUARD_HIT_RADIUS = 0.95;
const GUARD_PUNCH_RANGE = 2.2;
const GUARD_MAX_TOTAL = 200;   // 全场最多排出多少保安；耗尽后不再补充

/* ---------- 假接触阴影：径向渐变贴片，比真阴影便宜且可随紧张态加深 ---------- */
const _shadowGeo = new THREE.PlaneGeometry(1, 1);
const _shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(0,0,0,0.9)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const contactShadows = [];

function addContactShadow(parent, radius){
  const m = new THREE.Mesh(_shadowGeo, new THREE.MeshBasicMaterial({
    map: _shadowTex, transparent: true, opacity: 0.45, depthWrite: false
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.scale.set(radius * 2, radius * 2, 1);
  m.renderOrder = 1;
  parent.add(m);
  contactShadows.push(m);
  return m;
}

/* 紧张态：阴影变深（"阴影更深"的廉价实现，无需 shadowMap） */
function deepenContactShadows(t){
  /* 清扫：组已被移出场景的角色（父级的父级为空）其阴影不再需要 */
  for (let i = contactShadows.length - 1; i >= 0; i--){
    const m = contactShadows[i];
    if (m.parent && m.parent.parent === null) contactShadows.splice(i, 1);
  }
  for (const m of contactShadows) m.material.opacity = 0.42 + 0.46 * t;
}

/* ---------- 保安警灯：最多 2 盏真实点光源，挂到最近的保安头顶 ----------
   点光源数量直接进光照 shader，不能按保安数无限添加，故做上限并常驻。 */
const guardLights = [];
/* ---------- 终局：门开 + 强光投射 ---------- */
function openTheDoor(){
  state.doorOpen = true;
  doorLightMesh.visible = true;
  doorGlowMesh.visible = true;
  doorFloorMesh.visible = true;
}

/* 每帧推进开门与点灯（1.6s 平滑完成） */
function updateDoorLight(dt){
  if (!state.doorOpen || !doorGroup) return;
  if (doorOpenT >= 1) return;
  doorOpenT = Math.min(1, doorOpenT + dt / 1.6);
  const e = doorOpenT * doorOpenT * (3 - 2 * doorOpenT);       /* smoothstep */
  doorGroup.rotation.y = -1.9 * e;                              /* 开门约 109° */
  doorLightMesh.material.opacity = 0.45 + 0.55 * e;             /* 门口白面 */
  doorGlowMesh.material.opacity   = 0.75 * e;                   /* 外侧辉光 */
  doorFloorMesh.material.opacity  = 0.9 * e;                    /* 地面投射 */
  doorPointLight.intensity        = 7 * e;                      /* 照进考场 */
}

/* 准星是否指着白光区域（用于反色，保证可读） */
function aimingAtWhiteLight(){
  if (!state.doorOpen || doorOpenT < 0.12 || !doorLightMesh) return false;
  raycaster.setFromCamera(CENTER, camera);
  raycaster.far = 16;
  return raycaster.intersectObject(doorLightMesh, false).length > 0;
}

function initGuardLights(){
  for (let i = 0; i < 2; i++){
    const l = new THREE.PointLight(0xff2211, 0, 7, 2);
    l.userData.noTensionDim = true;   /* 紧张值调光时跳过，强度由闪烁驱动 */
    scene.add(l);
    guardLights.push(l);
  }
}

/* guards：按距离排序后的前两名（可为 null） */
function updateGuardLights(guards, t){
  for (let i = 0; i < guardLights.length; i++){
    const l = guardLights[i];
    const g = guards[i];
    if (g && g.userData.alive){
      g.group.add(l);                                  // 自动从上一个父节点摘离
      l.position.set(0, 1.84, 0.02);
      l.intensity = (0.9 + 2.4 * (g.userData.blink || 0)) * (1 + 0.5 * t);
    } else {
      l.intensity = 0;                                // 保留在场景里，避免 shader 重编译
    }
  }
}

/* 剩余可派出名额（纯函数，便于测试） */
function guardPoolRemaining(){
  return Math.max(0, GUARD_MAX_TOTAL - (state.guardsSpawned || 0));
}

function aliveGuardCount(){
  let n = 0;
  for (const g of securityGuards) if (g.userData.alive) n++;
  return n;
}

/* 清理已死亡的保安，防止数组无限增长导致每帧遍历膨胀 */
function pruneDeadGuards(){
  for (let i = securityGuards.length - 1; i >= 0; i--){
    if (!securityGuards[i].userData.alive) securityGuards.splice(i, 1);
  }
}

/* 保安种类掷骰：随击倒数逐步解锁。heavy 两段血、慢而大；fast 快而脆 */
function rollGuardType(){
  const k = state.guardKills;
  const r = Math.random();
  if (k >= 8 && r < 0.20) return 'heavy';
  if (k >= 4 && r < 0.46) return 'fast';
  return 'normal';
}

function spawnTwoGuards(){
  if (state.ended) return;
  pruneDeadGuards();

  /* 名额耗尽：不再派出新保安 */
  const n = Math.min(2, guardPoolRemaining());
  if (n <= 0) return;

  const baseAngles = [
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2 + Math.PI
  ];
  const speedBonus = Math.min(0.35, state.guardKills * 0.04);

  for (let i = 0; i < n; i++){
    let angle = baseAngles[i];
    const dist = GUARD_SPAWN_DIST + Math.random() * 1.2;
    let gx = state.pos.x + Math.cos(angle) * dist;
    let gz = state.pos.z + Math.sin(angle) * dist;
    /* 教室 / 竞技场边界动态取值 */
    const bnd = (typeof getWorldBounds === 'function')
      ? getWorldBounds() : { hw: 7.5, hd: 6.5 };
    gx = clamp(gx, -bnd.hw, bnd.hw);
    gz = clamp(gz, -bnd.hd, bnd.hd);

    let tries = 0;
    while (Math.hypot(gx - state.pos.x, gz - state.pos.z) < 3.6 && tries++ < 14){
      angle += 0.9;
      gx = clamp(state.pos.x + Math.cos(angle) * dist, -bnd.hw, bnd.hw);
      gz = clamp(state.pos.z + Math.sin(angle) * dist, -bnd.hd, bnd.hd);
    }

    const type = rollGuardType();
    const g = buildSecurityGuard(gx, gz, type,
      (state.arenaMode && typeof arenaScene !== 'undefined') ? arenaScene : undefined);
    /* 重装：慢但两段血；快速：快但脆 */
    let spd = GUARD_SPEED_BASE;
    if (type === 'heavy') spd = 0.42;
    else if (type === 'fast') spd = 0.92;
    g.userData = {
      speed: spd + speedBonus,
      alive: true,
      type: type,
      hp: type === 'heavy' ? 2 : 1
    };
    securityGuards.push(g);
    state.guardsSpawned = (state.guardsSpawned || 0) + 1;
  }
}

/* ---------- 构建世界 ---------- */
function buildWorld(){
  buildRoom();
  buildDesk(0, -3, true);

  const seats = [
    { x: -4.5, z: -3.0, color: 0x3b5ba5 },
    { x:  4.5, z: -3.0, color: 0x8a4a6b },
    { x: -4.5, z:  2.5, color: 0x4a7a5a },
    { x:  0.0, z:  2.5, color: 0x7a6a3a },
    { x:  4.5, z:  2.5, color: 0x5a4a8a }
  ];
  const NPC_NAMES = ['小明', '小红', '小刚', '小强', '小丽'];
  seats.forEach((s, i) => {
      buildDesk(s.x, s.z, true);
      const p = buildPerson(s.x, s.z + 0.92, s.color, Math.PI);
      p.userData = {
        id: i, name: NPC_NAMES[i],
        seatX: s.x, seatZ: s.z + 0.92,
        state: 'seated', anger: 0, baseRot: Math.PI, timer: 0
      };
      npcs.push(p);
  });

  teacher = buildPerson(2.4, 0, 0x2f3a4d, 0, 'stand');
  teacher.userData = { mode: 'patrol' };
}
