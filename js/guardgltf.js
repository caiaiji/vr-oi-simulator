/* ============================================================
   guardgltf.js —— 带骨架的 GLTF 保安（Soldier.glb 重绘版）
   - 启动即异步加载模型；未就绪时自动回退程序化方块人
   - 实例方案：深克隆 loader 已绑定好的整个场景子树（骨骼 +
     SkinnedMesh + Character 的 0.01 缩放全部原样保留），每实例
     一套独立骨骼，蒙皮绑定状态与 loader 完全一致，尺寸天然真实
   - 对外接口与旧 buildSecurityGuard 完全一致：
     group / armL / armR / legL / legR / calfL / calfR / head /
     body / warnLight / glow / phase，供 combat.js 步态逻辑直接驱动
   ============================================================ */

const GUARD_GLTF = {
  ready: false,
  failed: false,
  sceneTemplate: null
};

/* 加载一次模型，缓存完整场景模板（含骨骼绑定） */
function initGuardGLTF(){
  /* GLTF 模型已停用：在部分环境蒙皮渲染崩坏（只剩腿桶悬浮在场上），
     按用户决定全部回退胶囊体拟人版建模。此函数保留仅作占位。 */
  GUARD_GLTF.failed = true;
  GUARD_GLTF.ready = false;
}

/* 深克隆一棵 Object3D 子树（Scene→Group / Bone / SkinnedMesh / Mesh），
   递归保留 transform 与父子链，返回克隆根，src→dst 映射存 map */
function cloneGLTFTree(src, map){
  let dst;
  if (src.isBone){
    dst = new THREE.Bone();
  } else if (src.isSkinnedMesh || src.isMesh){
    const mats = (Array.isArray(src.material) ? src.material : [src.material]).map((m) => m.clone());
    dst = src.isSkinnedMesh ? new THREE.SkinnedMesh(src.geometry, mats) : new THREE.Mesh(src.geometry, mats);
  } else {
    dst = new THREE.Group();
  }
  dst.name = src.name;
  dst.position.copy(src.position);
  dst.quaternion.copy(src.quaternion);
  dst.scale.copy(src.scale);
  dst.visible = src.visible;
  dst.castShadow = src.castShadow;
  dst.receiveShadow = src.receiveShadow;
  map.set(src, dst);
  for (const c of src.children) dst.add(cloneGLTFTree(c, map));
  return dst;
}

/* 保安制服配色（与方块人保持一致的类型差异） */
function guardTintColors(type){
  if (type === 'heavy') return 0x5a262e;
  if (type === 'fast') return 0x2c4722;
  return 0x2a4a72;
}
function guardGlowColor(type){
  if (type === 'heavy') return 0xff6a33;
  if (type === 'fast') return 0xffb020;
  return 0xff4444;
}

/* 实例化一名 GLTF 保安 */
function makeGLTFGuard(x, z, type, parent){
  type = type || 'normal';
  const root = new THREE.Group();
  root.position.set(x, 0, z);

  /* 姿态节点：bob/tilt/扭动作用整身，不动骨骼 rest position */
  const charNode = new THREE.Group();
  root.add(charNode);

  /* 深克隆模板场景（含 Character 0.01 缩放）挂到姿态节点 */
  const map = new Map();
  const model = cloneGLTFTree(GUARD_GLTF.sceneTemplate, map);
  charNode.add(model);

  /* 克隆骨架与模板结构逐点一致；重算世界矩阵后按模板 bindMatrix 重绑 */
  charNode.updateMatrixWorld(true);
  const skinneds = [];
  model.traverse((o) => { if (o.isSkinnedMesh) skinneds.push(o); });

  let bodyMesh = null, visorMesh = null;
  skinneds.forEach((sm) => {
    const rawBones = sm.skeleton ? sm.skeleton.bones : [];
    const bones = [];
    for (const b of rawBones){
      const nb = map.get(b);
      if (nb) bones.push(nb);
    }
    if (!bones.length){
      map.forEach((v) => { if (v.isBone) bones.push(v); });
    }
    sm.bind(new THREE.Skeleton(bones), sm.bindMatrix);
    /* 投掷/近战 raycast 初筛依赖 geometry 包围球 */
    if (sm.geometry && !sm.geometry.boundingSphere) sm.geometry.computeBoundingSphere();
    if (!bodyMesh) bodyMesh = sm;
    else visorMesh = sm;
  });

  const tint = guardTintColors(type);

  /* 主体：平涂制服色，去掉军事纹理，与游戏平涂风格统一 */
  if (bodyMesh){
    (Array.isArray(bodyMesh.material) ? bodyMesh.material : [bodyMesh.material]).forEach((mm) => {
      mm.map = null;
      mm.color = new THREE.Color(tint);
      mm.roughness = 0.82;
      mm.metalness = 0.06;
      mm.needsUpdate = true;
    });
  }
  /* 护目镜：深色玻璃质感 */
  if (visorMesh){
    (Array.isArray(visorMesh.material) ? visorMesh.material : [visorMesh.material]).forEach((mm) => {
      mm.map = null;
      mm.color = new THREE.Color(0x1a222c);
      mm.roughness = 0.18;
      mm.metalness = 0.75;
      mm.needsUpdate = true;
    });
  }

  /* 命名骨骼引用（Mixamo 标准名），供 combat.js 步态直接驱动 */
  const byName = {};
  model.traverse((o) => { if (o.isBone) byName[o.name] = o; });
  const getBone = (nm) => byName[nm] || byName['mixamorig:' + nm] || byName['mixamorig' + nm];
  const armL = getBone('LeftArm');
  const armR = getBone('RightArm');
  const legL = getBone('LeftUpLeg');
  const legR = getBone('RightUpLeg');
  const calfL = getBone('LeftLeg');
  const calfR = getBone('RightLeg');
  const head = getBone('Head');
  const foreL = getBone('LeftForeArm');
  const foreR = getBone('RightForeArm');

  /* 初始姿态：垂臂更贴躯干 + 微屈肘，避免 T-pose 平举手 */
  if (armL) armL.rotation.set(-1.52, 0, -0.10);
  if (armR) armR.rotation.set(-1.52, 0, 0.10);
  if (foreL) foreL.rotation.set(-0.30, 0, 0.06);
  if (foreR) foreR.rotation.set(-0.30, 0, -0.06);

  /* 肩部护垫：桥接躯干与上臂的接缝，消除“手臂悬浮”的观感。
     模型是厘米量纲（1 单位 = 1cm），垫块按比例挂在左右上臂骨上 */
  const padMats = [new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint).multiplyScalar(0.72), roughness: 0.9, metalness: 0.05
  })];
  const padGeo = new THREE.CylinderGeometry(6.5, 8.5, 26, 8);
  const capGeo = new THREE.SphereGeometry(8, 8, 5);
  const upArmL = getBone('LeftArm'), upArmR = getBone('RightArm');
  if (upArmL){
    const pad = new THREE.Mesh(padGeo, padMats);
    pad.rotation.z = Math.PI / 2;
    pad.position.set(-4, 0, 0);
    pad.castShadow = true;
    upArmL.add(pad);
    const cap = new THREE.Mesh(capGeo, padMats);
    cap.position.set(-4, -13, 0);
    upArmL.add(cap);
  }
  if (upArmR){
    const pad = new THREE.Mesh(padGeo, padMats);
    pad.rotation.z = Math.PI / 2;
    pad.position.set(-4, 0, 0);
    pad.castShadow = true;
    upArmR.add(pad);
    const cap = new THREE.Mesh(capGeo, padMats);
    cap.position.set(-4, -13, 0);
    upArmR.add(cap);
  }

  /* 头顶预警灯 + 光晕：挂头骨，随头转 */
  let warnLight = null, glow = null;
  if (head){
    warnLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3333 })
    );
    /* 头骨局部是厘米量纲（模型自带 0.01 缩放），灯也按同量纲给 */
    warnLight.position.set(0, 34, 5);
    head.add(warnLight);
    glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({
        color: guardGlowColor(type), transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    glow.position.copy(warnLight.position);
    head.add(glow);
  }

  if (typeof addContactShadow === 'function') addContactShadow(root, 0.52);

  (parent || scene).add(root);

  /* 体型差直接压在外层节点，Character 的 0.01 在克隆体内侧生效 */
  root.scale.setScalar(type === 'heavy' ? 1.16 : type === 'fast' ? 0.95 : 1);
  root.userData.isGLTF = true;

  return {
    group: root, armL, armR, legL, legR, calfL, calfR,
    head, body: charNode, warnLight, glow,
    phase: Math.random() * Math.PI * 2,
    isGLTF: true
  };
}

/* 统一入口：与同学/老师同一套方块人建模（buildPersonGuard） */
function buildSecurityGuard(x, z, type, parent){
  return buildPersonGuard(x, z, type, parent);
}

initGuardGLTF();