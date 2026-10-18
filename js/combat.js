'use strict';
/* =========================================================
   combat —— 殴打老师 / 保安 AI / 全员收尾
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   打老师 / 打保安
   ========================================================= */
function punchTeacher(byRanged){
  if (state.view !== 'world' || state.ended || state.frozen) return;
  if (!teacher || teacher.userData.leaving) return;
  teacher.userData.leaving = true;

  if (!byRanged){
    /* 近战拳打才需要贴身与扇形约束；投掷物命中由弹道本身证明，不限距离 */
    const d = Math.hypot(state.pos.x - teacher.group.position.x,
                         state.pos.z - teacher.group.position.z);
    if (d > 2.4){
      teacher.userData.leaving = false;
      toast('你离监考老师太远了。', 1400);
      return;
    }
    /* 同样受视角扇形窗口约束 */
    if (!inAttackArc(teacher.group.position.x, teacher.group.position.z)){
      teacher.userData.leaving = false;
      toast('你一拳打向了空气——对准老师再来。', 1300);
      return;
    }
  }

  const dx = state.pos.x - teacher.group.position.x;
  const dz = state.pos.z - teacher.group.position.z;
  teacher.group.rotation.y = Math.atan2(dx, dz);
  teacher.armL.rotation.x = -1.4;
  teacher.armR.rotation.x = -1.4;

  if (!byRanged &&
      typeof weaponSwing === 'function' &&
      (typeof weaponCanSwing !== 'function' || weaponCanSwing())){
    weaponSwing();
  }
  audio.punch();

  /* 打击感：全身部件爆散 + 视角回弹 + 命中顿帧 */
  spawnBodyDebris(teacher.group, { speed: 3.2 });
  kickView(0.045, (Math.random() - 0.5) * 0.05);
  hitStop = 0.07;

  const wpT = typeof weaponParams === 'function' ? weaponParams() : null;
  toast(`\u{1F44A} 你的${wpT ? wpT.name : '拳头'}招呼在了监考老师身上……`, 1600);
  unlockAch('teacher_hit');
  /* 监考已倒：从这一刻起同学也可以打了 */
  state.teacherDown = true;
  /* 亮出血条 */
  revealHp();

  setTimeout(() => {
    if (teacher){
      scene.remove(teacher.group);
      teacher = null;
    }
    toast('监考老师夺门而出，叫来了保安！', 2200);
    audio.beep(880, 0.15, 0.05, 'sawtooth');
    audio.beep(440, 0.25, 0.05, 'sawtooth');

    setTimeout(() => {
      if (state.ended) return;
      spawnTwoGuards();
      toast('\u26A0 两名保安从门口冲了进来！', 2600);
      audio.beep(140, 0.4, 0.07, 'sawtooth');
    }, 700);
  }, 800);
}

/* ---------- 攻击判定窗口 ----------
   距离之外再加视角扇形：只有落在准星前 GUARD_PUNCH_ARC 弧度内的
   目标才算"在拳范围内"。半角 0.9rad ≈ 51°，比 360° 球判定收紧很多。 */
const GUARD_PUNCH_ARC = 0.4;

function inAttackArc(x, z, arc){
  arc = arc || GUARD_PUNCH_ARC;                // 未指定时用拳头默认弧
  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
  const tx = x - state.pos.x, tz = z - state.pos.z;
  const len = Math.hypot(tx, tz);
  if (len < 1e-4) return true;                 // 贴身也算
  return (fx * tx + fz * tz) / len > Math.cos(arc);
}

/* 统计当前拳范围内（距离 + 扇形）的活保安 */
/* rangeExtra/arcExtra：由武器传入（weapons.js），未装备武器时为 0 */
function guardsInPunchRange(rangeExtra, arcExtra){
  const out = [];
  for (const g of securityGuards){
    if (!g.userData.alive) continue;
    const d = Math.hypot(state.pos.x - g.group.position.x,
                         state.pos.z - g.group.position.z);
    /* 连击 \u00d710 拳威：拳锋范围向外扩 */
    const rangeBonus = typeof comboRangeBonus === 'function' ? comboRangeBonus() : 0;
    if (d <= GUARD_PUNCH_RANGE + 0.3 + rangeBonus + (rangeExtra || 0) &&
        inAttackArc(g.group.position.x, g.group.position.z, arcExtra || undefined)) out.push(g);
  }
  return out;
}

/* 用引用而非索引：避免数组被 prune 后索引错位 */
let lastReplenishToastAt = 0;   // 补员 toast 节流（连杀只弹一条）
/* 击倒单个保安（扫拳的单元）。返回 false 表示本回合已结束（隐藏结局） */
function killGuard(g, dmg, kb){
  if (!g || !g.userData.alive) return true;
  dmg = dmg || 1;
  kb = kb || 0;
  /* 重装保安：伤害不足则踉跄击退不掉命（椅子/键盘一击破防） */
  const hp = g.userData.hp || 1;
  if (hp > dmg){
    g.userData.hp = hp - dmg;
    if (typeof staggerGuard === 'function') staggerGuard(g, dmg >= 2);
    return true;
  }
  g.userData.alive = false;
  /* 先炸散再移除组：部件已摘到场景里，带物理飞走 */
  spawnBodyDebris(g.group, { speed: 3.9 + kb });
  if (g.group.parent) g.group.parent.remove(g.group);
  state.guardKills++;
  /* 连击 / 飘字 / 掉落补给 */
  if (typeof arcadeHookKill === 'function') arcadeHookKill(g);
  if (state.guardKills >= GUARD_MAX_TOTAL && !state.arenaMode){
    openFinalDoor();
    return false;
  }
  /* 竞技场不分名额、不打补员：波次推进交给 arena.js 的钩子 */
  if (state.arenaMode && typeof arenaHookKill === 'function'){
    arenaHookKill();
  }
  /* 教室：每倒一名补一批替补（近战 AOE / 投掷等所有击杀路径统一补员） */
  if (!state.arenaMode && typeof spawnTwoGuards === 'function'){
    const dl = 900 + Math.min(state.guardKills, 3) * 130;
    setTimeout(() => {
      if (state.ended) return;
      spawnTwoGuards();
      /* 连杀会并发触发补员，toast 节流避免刷屏 */
      const now = performance.now();
      if (now - lastReplenishToastAt > 1000){
        lastReplenishToastAt = now;
        toast('门口又冲进来两名替补保安……', 1700);
      }
      audio.beep(200, 0.3, 0.06, 'sawtooth');
    }, dl);
  }
  return true;
}

/* 打完全部保安：不直接结算，开门 + 弹"警告"，等玩家自己走出去 */
function openFinalDoor(){
  if (state.doorOpen || state.ended) return;
  openTheDoor();
  audio.beep(880, 0.3, 0.06, 'sine');
  setTimeout(() => audio.beep(1320, 0.4, 0.05, 'sine'), 260);
  toast('走廊尽头那扇门，开了。', 3000);
  /* 慢放 0.4s 再弹窗，让开门的动作先被看见 */
  setTimeout(() => {
    if (state.ended) return;
    openDialog({
      title: '\u26A0 警告',
      text: '门开了。\n\n' +
            '不是考场这一扇——是走廊尽头那扇从来打不开的门。\n' +
            '它开的时候没有声音，只有光。白得不像这个考场里该有的东西。\n\n' +
            '保安们停下了动作，齐刷刷望向那个方向，然后让开了路。\n' +
            '广播里只剩电流噪音。你听见过这样的召唤吗？',
      options: [{ label: '去看看', cb: dlg => closeDialog(dlg) }]
    });
  }, 1400);
}

/* 真的走出白光：此时才结算 */
function walkOutOfTheRoom(){
  if (state.ended) return;
  /* 白光不是终点：传送进竞技场继续决斗；没有竞技场模块时退回旧结局 */
  if (typeof enterArena === 'function'){
    enterArena();
    return;
  }
  endByTotalVictory();
}

/* 一拳扫倒拳范围内所有保安（不是只有一个） */
function punchGuardsArc(){
  /* 武器冷却门控：挥空也算一次（挥击动画照播） */
  if (typeof weaponCanSwing === 'function' && !weaponCanSwing()) return;
  const wp = typeof weaponParams === 'function' ? weaponParams() : null;
  if (typeof weaponSwing === 'function') weaponSwing();

  const rangeExtra = wp ? wp.range - GUARD_PUNCH_RANGE : 0;
  const victims = guardsInPunchRange(rangeExtra, wp ? wp.arc : 0);

  /* 投掷类武器：没有贴身目标时发射弹道（weapons.js）。
     椅子是近战/投掷两用：身边有保安就走下方抡人逻辑，
     否则整把丢出去，砸落处群伤。 */
  if (wp && wp.throwable && typeof punchThrow === 'function'
      && !(wp.id === 'chair' && victims.length > 0)){
    punchThrow(wp);
    return;
  }

  if (!victims.length){
    toast(wp ? '\u{1F4A8} 你的' + wp.name + '抡了个空。' : '你的拳头抡了个空。', 1100);
    return;
  }

  let n = 0;
  for (const g of victims){
    const wasAlive = g.userData.alive;
    const cont = killGuard(g, wp ? wp.dmg : 1, wp ? wp.kb : 0);
    if (!cont) break;    // 触发隐藏结局，停止结算
    /* 重装保安挨一拳仍站着，不计入击倒数 */
    if (!g.userData.alive && wasAlive) n++;
  }
  if (state.ended) return;

  /* 街机钩子：多杀播报 / 同学应援 */
  if (typeof arcadeHookPunch === 'function') arcadeHookPunch(n);

  if (n > 0){
    /* 打击感：视角回弹 + 顿帧（比打老师更重），多杀更猛；重武器更沉 */
    audio.punch();
    kickView(0.06 + (wp ? Math.min(0.03, wp.amp * 0.02) : 0), (Math.random() - 0.5) * 0.06);
    hitStop = 0.09 + Math.min(0.06, n * 0.02);
    if (wp && wp.kb >= 2) hitStop += 0.03;
    if (typeof comboHitStopBonus === 'function') hitStop += comboHitStopBonus();

    const launch = wp ? wp.launch : '一拳挥出';
    toast(n > 1 ? `\u{1F44A} ${launch}，${n} 名保安被放倒！` : `\u{1F44A} ${launch}，撂倒了一个保安！`, 1500);
    checkGuardKillMilestones(state.guardKills);
    /* 一整拳只掷一次警告，避免连杀弹出一堆面板 */
    maybeGuardWarning();

    /* 补员已下沉到 killGuard：每倒一名补一批替补，
       近战 AOE 与投掷等击杀路径统一生效，不用在这里重复触发 */
  } else {
    /* 整拳全打在重装保安身上：踉跄但没人倒下 */
    audio.beep(110, 0.16, 0.06, 'square');
    kickView(0.045, (Math.random() - 0.5) * 0.05);
    hitStop = 0.05;
    toast('\u{1F44A} 重装保安硬吃一拳，晃了晃没倒！', 1500);
  }
}

/* =========================================================
   保安 AI + 碰撞
   ========================================================= */
function updateGuards(realDt, t){
  if (state.ended || state.frozen || state.view !== 'world') return;

  let minDist = Infinity;
  nearestGuardDist = Infinity;
  /* 距离最近的两名保安：用于挂载红色警灯（点光源有上限） */
  const near = [null, null];
  const nearD = [Infinity, Infinity];

  for (let i = 0; i < securityGuards.length; i++){
    const g = securityGuards[i];
    if (!g.userData.alive) continue;

    const pos = g.group.position;
    const dx = state.pos.x - pos.x;
    const dz = state.pos.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < minDist) minDist = d;

    if (d < nearD[0]){ nearD[1] = nearD[0]; near[1] = near[0]; nearD[0] = d; near[0] = g; }
    else if (d < nearD[1]){ nearD[1] = d; near[1] = g; }

    if (d < GUARD_HIT_RADIUS){
      if (!handleGuardCatch(g)) return;
    }

    if (d > 0.01){
      const sp = g.userData.speed * realDt;
      let nx = pos.x + (dx / d) * sp;
      let nz = pos.z + (dz / d) * sp;
      /* 竞技场绕障：直行被挡就选定一侧坚定绕行，不顶墙罚站也不来回抖 */
      if (state.arenaMode &&
          (collides(nx, pos.z, 0.3) || collides(pos.x, nz, 0.3))){
        if (!g.userData.avertT || g.userData.avertT <= 0){
          if (g.userData.avertDir === undefined){
            /* 首次撞墙：按挡路障碍相对玩家连线的位置选绕行侧 */
            let side = (Math.random() < 0.5) ? 1 : -1;
            let best = null, bestD = Infinity;
            for (let k = 0; k < obstacles.length; k++){
              const o = obstacles[k];
              if (Math.abs(nx - o.x) < o.hw + 0.3 &&
                  Math.abs(nz - o.z) < o.hd + 0.3){
                const oD = Math.hypot(o.x - pos.x, o.z - pos.z);
                if (oD < bestD){ best = o; bestD = oD; }
              }
            }
            if (best){
              const cross = (dx / d) * (best.z - pos.z) - (dz / d) * (best.x - pos.x);
              if (Math.abs(cross) > 0.15 * d) side = cross > 0 ? 1 : -1;
            }
            g.userData.avertDir = side;
          }
          /* 方向已定：仍被挡就同向续期，绝不原地来回摆 */
          g.userData.avertT = 2.5 + Math.random() * 1.2;
        }
        g.userData.avertT -= realDt;
        const ang = Math.atan2(dx, dz) + g.userData.avertDir * 1.25;
        nx = pos.x - Math.sin(ang) * sp;
        nz = pos.z - Math.cos(ang) * sp;
      }
      if (!collides(nx, pos.z, 0.3)) pos.x = nx;
      if (!collides(pos.x, nz, 0.3)) pos.z = nz;
      g.group.rotation.y = Math.atan2(dx, dz);
    }

    const v = Math.sin(t * 3.5 + g.phase) * 0.25;
    g.armL.rotation.x = -0.25 + v;
    g.armR.rotation.x = -0.25 - v;
    g.head.rotation.y = Math.sin(t * 2 + g.phase) * 0.25;

    if (g.warnLight){
      const blink = 0.5 + 0.5 * Math.sin(t * 6 + g.phase);
      g.warnLight.material.color.setRGB(1, blink * 0.4, blink * 0.4);
      g.userData.blink = blink;
    }
    if (g.glow){
      /* 加法光晕跟着闪烁，紧张态下更亮更大 */
      const b = g.userData.blink || 0;
      const tn = getTension();
      g.glow.material.opacity = 0.16 + 0.42 * b + 0.30 * tn;
      g.glow.scale.setScalar(1 + 0.5 * b + 0.6 * tn);
    }
  }

  /* 红色警灯挂到最近的两名保安头顶（无保安时强度归零） */
  updateGuardLights(near, getTension());
  nearestGuardDist = minDist;
}

/* 最近活保安的距离（供紧张值系统读取；无保安为 Infinity） */
let nearestGuardDist = Infinity;

function endByGuards(){
  if (state.ended) return;
  state.ended = true;
  hideAllPanels();
  for (const g of securityGuards) if (g.group.parent) g.group.parent.remove(g.group);
  securityGuards.length = 0;

  audio.beep(110, 0.5, 0.08, 'sawtooth');
  audio.beep(80, 0.7, 0.06, 'sawtooth');

  $('endTitle').textContent = '被 保 安 抓 走';
  $('endSub').textContent = '两名保安一左一右架住了你，你被拖出了考场。';
  showEnding(0, '你在考场上公然殴打监考老师，性质恶劣。\n' +
    '本次比赛成绩作废，并记入诚信档案。\n\n' +
    '遵守考场纪律，人人有责。\n下次别再打老师了。');
}

/* 保安抓住玩家：有血条就扣 1 格，没有血条直接结局。
   受击无敌改为玩家侧 1 秒：任何保安都能抓，但玩家 1 秒内只掉一格。
   返回 false 表示本局已经结束。 */
function handleGuardCatch(g){
  const now = state.worldTime;    /* 用世界时钟：慢放期间受击间隔同样被拉长 */
  if (state.hpVisible && state.hp > 0){
    if (now - state.lastDamageAt < PLAYER_HURT_INVULN / 1000) return true;
    state.lastDamageAt = now;
    if (!damagePlayer(g, now)){
      endByGuards();
      return false;
    }
    return true;
  }
  endByGuards();
  return false;
}

/* =========================================================
   击杀里程碑 + 保安警告窗
   ---------------------------------------------------------
   - 击杀 10 / 20 / 50 / 100 解锁对应成就；
   - 从第 10 杀起，每次击杀有 GUARD_WARN_CHANCE 概率弹出保安队
     警告窗（3D 悬浮弹窗，必须交互消除）。文案按击杀数分四档，
     语气逐渐升级：口头提醒 → 正式警告 → 纪律处理 → 最后通牒；
   - 选项含"配合"与两条随机叛逆台词。配合：违抗计数清零；
     嘴硬：违抗计数 +1（直接推高紧张值，见 tension.js）并立刻
     叫来更多保安。
   ========================================================= */
const GUARD_WARN_MIN_KILLS = 10;   // 从第几杀开始可能弹窗
const GUARD_WARN_CHANCE    = 0.1; // 每次击杀的触发概率

const GUARD_WARN_LINES = [
  /* 档 0（10-19）：口头提醒 */
  [
    '同学，请停止攻击工作人员，配合我们维护考场秩序。',
    '保安同志正在赶来。请你放下拳头，我们可以当作什么都没发生。',
    '考场监控已全程记录。现在停手，还来得及。',
    '同学，打人不能加分。有话好好说，先放下手。'
  ],
  /* 档 1（20-49）：正式警告 */
  [
    '最后一次警告。继续袭击工作人员，我们将按考场纪律处理你。',
    '你的行为已构成扰乱考试秩序，我们有权取消你的成绩。',
    '考场秩序由我们负责，你的拳头不负责。立刻停手。',
    '再说一次：放下拳头。这是通知，不是请求。'
  ],
  /* 档 2（50-99）：纪律处理 */
  [
    '拒不配合者，我们有权取消成绩并禁赛三年。这是正式通知。',
    '你已经打倒了足够多的工作人员。收手，或者承担后果。',
    '考场外已经叫好了人。你要继续，我们就只能继续。',
    '《NOI 竞赛纪律》第三十一条：你现在每挥一拳，都在给自己记一笔。'
  ],
  /* 档 3（100+）：最后通牒 */
  [
    '现在立刻双手抱头蹲下，放弃抵抗，否则我们将动用物理。',
    '最后一次。抱头，蹲下，别逼我们把这考场拆了。',
    '你是考生，不是选手队。停下，或者我们让你停下。',
    '给你十秒。之后发生的事情，写在通报里会很难看。'
  ]
];

const GUARD_WARN_DEFY = ['那就试试', '我才不呢', '有本事来抓我啊',
                         '等我先把这题写完', '你们人多了不起？'];

/* 纯函数：按击杀数选警告档位（0=口头提醒 … 3=最后通牒） */
function guardWarnTier(kills){
  if (kills < 20)  return 0;
  if (kills < 50)  return 1;
  if (kills < 100) return 2;
  return 3;
}

/* 纯函数：本次是否触发警告窗 */
function guardWarnRoll(kills, rng){
  if (kills < GUARD_WARN_MIN_KILLS) return false;
  return rng() < GUARD_WARN_CHANCE;
}

function checkGuardKillMilestones(k){
  if (k >= 5)   unlockAch('guard_5');
  if (k >= 10)  unlockAch('guard10');
  if (k >= 20)  unlockAch('guard20');
  if (k >= 50)  unlockAch('guard50');
  if (k >= 100) unlockAch('guard100');
}

function maybeGuardWarning(){
  if (state.arenaMode) return;   /* 竞技场没有通报处，只有下一波 */
  if (!guardWarnRoll(state.guardKills, Math.random)) return;

  /* 通报弹出：整个世界放慢到 0.1x（考试计时不受影响），
     选项落地后恢复原速 */
  beginSlowMo();

  const lines = GUARD_WARN_LINES[guardWarnTier(state.guardKills)];
  const line = lines[Math.floor(Math.random() * lines.length)];
  /* 两条不重复的叛逆台词 + 一个配合选项 */
  const pool = GUARD_WARN_DEFY.slice();
  const defyA = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  const defyB = pool[Math.floor(Math.random() * pool.length)];

  slowMoDlg = openDialog({
    title: '\u26A0 保安队 · 第 ' + state.guardKills + ' 次通报',
    text: line,
    options: [
      {
        label: defyA,
        cb: dlg => defyGuardWarning(dlg)
      },
      {
        label: defyB,
        cb: dlg => defyGuardWarning(dlg)
      }
    ]
  });
}

/* 嘴硬的代价：违抗计数 +1（推高紧张值）+ 立刻叫来更多保安 */
function defyGuardWarning(dlg){
  endSlowMo();
  closeDialog(dlg);
  state.defiance = (state.defiance || 0) + 1;
  toast('对面沉默了两秒——然后更多脚步声涌了进来。', 2200);
  audio.beep(180, 0.25, 0.06, 'sawtooth');
  spawnTwoGuards();
}

/* =========================================================
   隐藏结局 · 一人军队（击倒全部 200 名保安）
   ========================================================= */
function endByTotalVictory(){
  if (state.ended) return;
  state.ended = true;
  hideAllPanels();
  for (const g of securityGuards) if (g.group.parent) g.group.parent.remove(g.group);
  securityGuards.length = 0;
  unlockAch('army');

  $('endTitle').textContent = '无 人 能 挡';
  $('endSub').textContent = '第 200 名保安倒下了。然后，你走进了那片白光。';
  showEnding(state.totalScore,
    '门在身后合上。没有风，没有声音，也没有人追出来。\n\n' +
    '你站在光里回头看：两百具叠在一起的制服，帽檐、徽章、对讲机散了一地。\n' +
    '监考老师不知什么时候已经跑了，教务处的电话打到了天亮。\n' +
    '来的人不认识你，只认识这个考场。他们后来把整层楼封了，\n' +
    '只在记录里写：那个考生赢了，然后走了。\n\n' +
    '《NOI 竞赛纪律》最后一页写着：\n' +
    '“纪律需要人来执行。如果执行纪律的人都不够了，\n' +
    '那考场里就只剩下一条纪律：别惹写代码的人。”\n\n' +
    '隐藏结局 · 一人军队　　击倒保安 200 / 200');
  clearSave();
}

function hideAllPanels(){
  /* 3D 悬浮弹窗也要收场（弹窗不再是 DOM，无法用 classList 隐藏） */
  dismissDialogs();
  ['hud', 'pauseMenu', 'codeUI', 'paperUI', 'corridorUI',
   'bathroomUI', 'npcComputerUI', 'minimapWrap', 'comboWrap', 'buffWrap', 'weaponHud', 'turnBadge', 'arenaHud']
    .forEach(id => { const e = $(id); if (e) e.classList.add('hidden'); });
  /* 投掷物清理 */
  if (typeof clearThrows === 'function') clearThrows();
  /* 街机强化层的残留元素一并清理 */
  const _f = $('floatLayer'); if (_f) _f.innerHTML = '';
  const _k = $('killfeed'); if (_k) _k.innerHTML = '';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
}
