/* =========================================================================
   豊島ダウンヒル - CoderDojo用プロトタイプ
   構成:
   1. CONFIG      … ★改造ポイント1（速さ・色・ライフ数など）
   2. COURSE      … ★改造ポイント2（坂道のカーブをつくる）
   3. シーン構築   … 空・海・棚田・道路・ガードレールをつくる
   4. プレイヤー   … スケーターを組み立てて うごかす
   5. スポナー     … 障害物とレモンをコースにならべる
   6. 当たり判定   … ★改造ポイント3（新しいルールはここに追加）
   7. HUD         … 進捗バー・レモン数・ライフの表示
   8. ゲームループ … 毎フレームの更新と描画
   9. 入力        … キーボード・タッチ操作
   ========================================================================= */


/* ------------------------- 1. CONFIG ★かえてみよう ------------------------- */
const CONFIG = {
  speed: 42,             // 前にすすむ速さ (大きくすると速くなる)
  steerAccel: 130,        // 左右にうごく加速度
  steerFriction: 0.86,    // 手をはなしたときの減速 (0〜1、小さいほどすぐ止まる)
  steerMax: 24,           // 左右移動の最高速度
  roadWidth: 9.6,         // JA香川県 豊島支店前の県道に近い道路幅
  laneSpacing: 3.2,       // 3つの走行位置を、現地の幅へ収める
  lives: 3,               // ライフ数
  obstacleDensity: 0.32,  // 障害物の出やすさ (0〜1、大きいほど増える)
  lemonSpacing: [16, 30], // レモン/障害物のだいたいの間隔 [さいしょう, さいだい]
  jacketColor: 0x4aa8e8,  // パーカーの色 (0xRRGGBB)
  boardColor: 0xe07a2e,   // スケボーの色
  slopeRate: 0.24,        // 坂の基本勾配（約13.5度）
  slopeWave: 0.24,        // 急坂区間で追加する落ち込み（最大勾配は約25.6度）
  slopeWaveLength: 230,   // 縦カーブ1つ分の長さ
  startSlopeRate: 0.08,   // スタート直後は緩くし、海へ飛び込む見え方を防ぐ
  slopeRampLength: 100,   // この距離をかけて本来の急勾配へ移る
  finishFlattenLength: 145, // 港の駐車場へ入る手前から坂をなだらかにする
  finishSlopeRate: 0.018, // ゴール地点はほぼ平ら（海へ飛び出さない）
  poseBlendTime: 0.12,    // 左右の姿勢が切りかわる速さ（秒）
  cameraBank: 0.075,      // カメラの左右のかたむき
  cameraFovBoost: 6,      // 走りだしたときの画角のひろがり
  cameraShake: 0.055,     // 走行中の細かなゆれ
  hitShake: 0.38,         // ぶつかったときのカメラゆれ
  cameraHeight: 3.45,     // カメラを高くして、手前の路面を広く見せる
  cameraBack: 5.8,        // プレイヤーから後ろへ離す距離
  cameraLookAhead: 14,    // 坂の先を見る距離
  cameraLookLift: 4.25,   // 注視点を上げ、プレイヤーを画面下側に置く
  windParticles: innerWidth < 700 ? 42 : 76,
  edgeSoftZone: 0.8,      // 道のはしで反発しはじめる幅
  edgeSpring: 46,         // 道の内側へもどす力
  edgeDamping: 0.78,      // 道のはしで横すべりを弱める量
  edgeBounce: 0.2,        // 道のはしでの小さな跳ね返り
  slopeBlendLength: 34,   // 区間ごとの勾配を、この距離でなめらかにつなぐ
  crestLift: 2.6,         // 坂の頂上でカメラを持ち上げる量（海だけが見える演出）
  crestLookAhead: 7,      // 頂上で注視点をさらに遠くへ送る距離
  steepFovBoost: 7,       // 急な下りで画角をひろげる量
  poleSpacing: 38,        // 電柱をたてる間隔
  guidePostSpacing: 7,    // 大カーブの黄色ポールの間隔
  raftCount: 9,           // 海にうかぶ養殖いかだの数
  ridgeLayers: 3,         // 対岸の山なみのレイヤー数
};

/* ------------------------- 2. COURSE ★かえてみよう -------------------------
   curve:    カーブの角度（プラスで右カーブ、マイナスで左カーブ、単位は度）
   length:   そのカーブの長さ
   slope:    その区間の坂のきつさ（省略すると CONFIG.slopeRate）
   bigCurve: true にすると「速度落せ」の路面文字と標識セットが手前に出る
   ぜんぶ curve: 0 にすると まっすぐな坂道になる                            */
const COURSE = [
  // JA香川県 豊島支店から海へ下る県道255号付近。頂上の大カーブから港までを抽象化。
  { curve: 0,    length: 88,  slope: 0.05 },  // 集落を抜ける。まだ ゆるい
  { curve: 12,   length: 68,  slope: 0.11 },  // 視界がひらけて、海が見えはじめる
  { curve: 96,   length: 232, slope: 0.30, bigCurve: true },  // ★頂上の大カーブ（10%勾配の標識）
  { curve: -34,  length: 96,  slope: 0.36 },  // 切りかえして 一気に下る
  { curve: -88,  length: 214, slope: 0.26, bigCurve: true },  // ★海側へ大きく回りこむ
  { curve: 46,   length: 128, slope: 0.30 },
  { curve: -52,  length: 132, slope: 0.24 },  // 棚田のS字
  { curve: 78,   length: 186, slope: 0.20, bigCurve: true },  // ★みかん畑の大カーブ
  { curve: -40,  length: 120, slope: 0.26 },
  { curve: 24,   length: 104, slope: 0.14 },
  { curve: -16,  length: 96,  slope: 0.09 },
  { curve: 0,    length: 176, slope: 0.05 },  // 海ぎわを走って港へ
];

// 大カーブの位置をコースから割り出す（標識やポールの配置に使う）
function findBigCurves(course) {
  const found = [];
  let d = 0;
  for (const seg of course) {
    if (seg.bigCurve || Math.abs(seg.curve) >= 60) {
      found.push({ start: d, end: d + seg.length, dir: Math.sign(seg.curve) || 1 });
    }
    d += seg.length;
  }
  return found;
}
let bigCurves = [];


/* ------------------------- three.js 基本セットアップ ------------------------- */
const wrap = document.getElementById('canvasWrap');
const scene = new THREE.Scene();

/* ------------------------- 画像（assets）のよみこみ -------------------------
   画像がなくても動く。ある場合だけ、単色のかわりに絵を貼る                */
const loader = new THREE.TextureLoader();
const TEX = {};
function loadTex(key, file, repeat, fallbackFile) {
  loader.load(
    'assets/' + file,
    tex => {
      if (repeat) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat[0], repeat[1]);
      }
      TEX[key] = tex;
      if (typeof onTextureReady === 'function') onTextureReady(key, tex);
    },
    undefined,
    () => {
      // 新しい幻想素材が見つからない場合も、元の素材でゲームを続ける。
      if (fallbackFile) loadTex(key, fallbackFile, repeat);
    }
  );
}

// 空: 画像がよみこめるまでは グラデーションを出しておく
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1d63c8');
  grad.addColorStop(0.55, '#4fa8e8');
  grad.addColorStop(1, '#cfeef7');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 512);
  return new THREE.CanvasTexture(c);
}
scene.background = makeSkyTexture();
// 遠景が白く抜けないよう、パノラマの海色へなじむ青い空気遠近にする。
scene.fog = new THREE.Fog(0x74c9df, 260, 2200);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 4000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
wrap.appendChild(renderer.domElement);
scene.add(camera);

const speedVignette = document.getElementById('speedVignette');
const impactFlash = document.getElementById('impactFlash');
const pickupFlash = document.getElementById('pickupFlash');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x58b04c, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 0.42);
sun.position.set(80, 140, 60);
scene.add(sun);

// カメラの手前を流れる風の線。画像を使わないので軽く、画面サイズにも追従する。
function buildWindLines() {
  const count = reduceMotion ? 0 : CONFIG.windParticles;
  const positions = new Float32Array(count * 6);
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: (Math.random() - 0.5) * 16,
      y: (Math.random() - 0.5) * 9,
      z: -3 - Math.random() * 30,
      speed: 13 + Math.random() * 18,
      length: 0.35 + Math.random() * 1.1,
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xdff9ff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 20;
  camera.add(lines);
  return { lines, geometry, material, particles };
}

const wind = buildWindLines();


/* ------------------------- パス（坂道の骨格）を組み立てる ------------------------- */
const DL = 2; // サンプリング間隔

function buildPath(course) {
  const courseLength = course.reduce((sum, seg) => sum + seg.length, 0);

  // 1歩ずつの「曲がる量」と「その場所の坂のきつさ」をならべる
  const steps = [];
  for (const seg of course) {
    const n = Math.max(1, Math.round(seg.length / DL));
    const dHeading = THREE.MathUtils.degToRad(seg.curve) / n;
    const base = seg.slope !== undefined ? seg.slope : CONFIG.slopeRate;
    for (let i = 0; i < n; i++) steps.push({ dHeading, base });
  }

  // 区間のつなぎ目で道がカクッと折れないよう、坂のきつさをならす
  const window = Math.max(1, Math.round(CONFIG.slopeBlendLength / DL));
  const eased = new Array(steps.length);
  for (let i = 0; i < steps.length; i++) {
    let sum = 0;
    for (let k = -window; k <= window; k++) {
      sum += steps[THREE.MathUtils.clamp(i + k, 0, steps.length - 1)].base;
    }
    eased[i] = sum / (window * 2 + 1);
  }

  // 実際に道をすすめながら、位置と坂のきつさを記録する
  let heading = 0, x = 0, z = 0, y = 0, travelled = 0;
  const points = [{ x, y, z, heading, grade: eased[0] }];
  for (let i = 0; i < steps.length; i++) {
    const slopePhase = (travelled % CONFIG.slopeWaveLength) / CONFIG.slopeWaveLength;
    const fullGrade = eased[i] + CONFIG.slopeWave * Math.pow(Math.sin(Math.PI * slopePhase), 2);
    const rampT = THREE.MathUtils.smoothstep(Math.min(1, travelled / CONFIG.slopeRampLength), 0, 1);
    let grade = THREE.MathUtils.lerp(CONFIG.startSlopeRate, fullGrade, rampT);
    const remaining = Math.max(0, courseLength - travelled);
    const finishT = THREE.MathUtils.smoothstep(Math.min(1, remaining / CONFIG.finishFlattenLength), 0, 1);
    grade = THREE.MathUtils.lerp(CONFIG.finishSlopeRate, grade, finishT);
    heading += steps[i].dHeading;
    x += Math.sin(heading) * DL;
    z -= Math.cos(heading) * DL;
    y -= grade * DL;
    travelled += DL;
    points.push({ x, y, z, heading, grade });
  }
  return points;
}

function sampleAt(path, dist) {
  const maxDist = (path.length - 1) * DL;
  dist = Math.max(0, Math.min(dist, maxDist));
  const idx = dist / DL;
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, path.length - 1);
  const t = idx - i0;
  const p0 = path[i0], p1 = path[i1];
  const x = THREE.MathUtils.lerp(p0.x, p1.x, t);
  const y = THREE.MathUtils.lerp(p0.y, p1.y, t);
  const z = THREE.MathUtils.lerp(p0.z, p1.z, t);
  const heading = THREE.MathUtils.lerp(p0.heading, p1.heading, t);
  const grade = THREE.MathUtils.lerp(p0.grade, p1.grade, t);
  const right = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
  const forward = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
  return { pos: new THREE.Vector3(x, y, z), right, forward, heading, grade, pitch: Math.atan(grade) };
}


/* ------------------------- 3. シーン構築 ------------------------- */
const worldGroup = new THREE.Group();
scene.add(worldGroup);

// つねにカメラを向く板（雲など）
let billboards = [];

/* 何周も走るゲームなので、コースを組みなおすたびに古い形と材質を捨てる。
   捨てないと、周回のたびにメモリが増えつづけて だんだん重くなる。
   ただし「使いまわす部品」は捨ててはいけないので、別にしておく。      */
const SHARED_GEO = new Map();
const SHARED_MAT = new Map();
function sharedGeo(key, make) {
  if (!SHARED_GEO.has(key)) SHARED_GEO.set(key, make());
  return SHARED_GEO.get(key);
}
function sharedMat(key, make) {
  if (!SHARED_MAT.has(key)) SHARED_MAT.set(key, make());
  return SHARED_MAT.get(key);
}
function clearWorld() {
  const keepGeo = new Set(SHARED_GEO.values());
  const keepMat = new Set(SHARED_MAT.values());
  const keepTex = new Set(Object.values(TEX));   // よみこんだ画像そのものは残す
  worldGroup.traverse(o => {
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !keepGeo.has(o.geometry)) o.geometry.dispose();
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || keepMat.has(m)) continue;
      // タイル用に複製したテクスチャは、材質といっしょに捨てる
      if (m.map && !keepTex.has(m.map)) m.map.dispose();
      m.dispose();
    }
  });
  worldGroup.clear();
  // 画像の貼りかえ先リストも作りなおす（捨てた材質を持ちつづけないため）
  for (const key in TEX_TARGETS) delete TEX_TARGETS[key];
}
let motionActors = { trees: [], grass: [], boats: [], clouds: [], seas: [] };
const bursts = [];

function rememberMotion(actor, collection, phase = Math.random() * Math.PI * 2) {
  actor.userData.motionBaseY = actor.position.y;
  actor.userData.motionBaseX = actor.position.x;
  actor.userData.motionPhase = phase;
  motionActors[collection].push(actor);
}

function createBurst(position, color, count = 18) {
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0.6;
    positions[i * 3 + 2] = 0;
    velocities.push(new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      1.4 + Math.random() * 3.2,
      (Math.random() - 0.5) * 4
    ));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size: 0.18,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.position.copy(position);
  scene.add(points);
  bursts.push({ points, velocities, life: 0.62 });
}

/* テクスチャが読めたら、登録ずみのマテリアルに貼りかえる。
   repeat: [横, たて] の くりかえし数（タイル素材のとき指定）        */
const TEX_TARGETS = {};   // key -> [{material, repeat}, ...]
function useTex(key, material, repeat) {
  (TEX_TARGETS[key] = TEX_TARGETS[key] || []).push({ material, repeat });
  if (TEX[key]) applyTex(TEX[key], material, repeat);
  return material;
}
function applyTex(tex, material, repeat) {
  let t = tex;
  if (repeat) {
    t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  material.map = t;
  material.color.setHex(0xffffff);
  material.needsUpdate = true;
}
function onTextureReady(key, tex) {
  if (key === 'sky') {
    skyDome.material.map = tex;
    skyDome.material.color.setHex(0xffffff);
    skyDome.material.needsUpdate = true;
    skyDome.visible = true;
    return;
  }
  for (const { material, repeat } of (TEX_TARGETS[key] || [])) applyTex(tex, material, repeat);

  // 板ポリで作りなおしたい素材は、あとから組み立てなおす
  if (key === 'skater' || key === 'skaterLeft' || key === 'skaterRight') {
    pendingRebuild.player = true;
  } else {
    pendingRebuild[key] = true;
  }
}

// 画像がとどいたら組み立てなおす（ゲームループの中から安全に呼ぶ）
const pendingRebuild = {};
function applyPendingRebuilds() {
  if (pendingRebuild.player && TEX.skater) {
    pendingRebuild.player = false;
    if (player) scene.remove(player);
    player = buildPlayer();
  }
  const sceneryKeys = [
    'shop', 'cloud', 'ground', 'fantasyGrass', 'fantasyGrassB', 'fantasyGrassC',
    'fantasyTreeA', 'fantasyTreeB', 'fantasyTerrace', 'fantasyBranch',
    'fantasyObstacle', 'fantasyTruck', 'fantasyBus', 'fantasyHedge',
    'fantasyGrove', 'fantasySlope', 'harborMirror', 'harborSeawall',
    'harborCars', 'harborShelter', 'harborParking',
  ];
  if (sceneryKeys.some(key => pendingRebuild[key])) {
    for (const key of sceneryKeys) pendingRebuild[key] = false;
    if (state.path) rebuildLevel();
  }
}

// 空のドーム（画像がよみこめたら表示される）
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(1800, 32, 16),
  new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false })
);
skyDome.visible = false;
scene.add(skyDome);

loadTex('sky', 'sky_sea_panorama.jpg', undefined, 'sky_fantasy.jpg');
loadTex('sea', 'sea_surface_fantasy_v2.jpg', undefined, 'sea_tile.jpg');
loadTex('road', 'road_asphalt_teshima.jpg', undefined, 'road_stone_tile.jpg');
loadTex('wall', 'stone_wall_tile.jpg');
loadTex('ground', 'ground_fantasy_tile.jpg');
loadTex('shop', 'shop_front.jpg');
loadTex('cloud', 'cloud_cumulus.webp');
loadTex('fantasyGrass', 'grass_fantasy.webp');
loadTex('fantasyGrassB', 'grass_fantasy_b.webp');
loadTex('fantasyGrassC', 'grass_fantasy_c.webp');
loadTex('fantasyTreeA', 'tree_fantasy_a.webp');
loadTex('fantasyTreeB', 'tree_fantasy_b.webp');
loadTex('fantasyTerrace', 'terrace_fantasy.webp');
loadTex('fantasyBranch', 'branch_fantasy.webp');
loadTex('fantasyObstacle', 'obstacle_fantasy.webp');
loadTex('fantasyTruck', 'truck_fantasy.webp');
loadTex('fantasyBus', 'bus_fantasy.webp');
loadTex('fantasyHedge', 'hedge_fantasy.webp');
loadTex('fantasyGrove', 'grove_fantasy.webp');
loadTex('fantasySlope', 'slope_fantasy.webp');
loadTex('harborMirror', 'harbor_mirror.webp');
loadTex('harborSeawall', 'harbor_seawall.webp');
loadTex('harborCars', 'harbor_cars.webp');
loadTex('harborShelter', 'harbor_shelter.webp');
loadTex('harborParking', 'harbor_parking_tile.jpg');
loadTex('skater', 'skater_back.webp');
loadTex('skaterLeft', 'skater_left_v2.webp', undefined, 'skater_left.webp');
loadTex('skaterRight', 'skater_right.webp');

function buildRibbon(path, offsetLeft, offsetRight, material, yLift = 0, uvRepeat = 0) {
  const verts = [];
  const uvs = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = sampleAt(path, i * DL);
    const b = sampleAt(path, (i + 1) * DL);
    const aL = a.pos.clone().addScaledVector(a.right, offsetLeft); aL.y += yLift;
    const aR = a.pos.clone().addScaledVector(a.right, offsetRight); aR.y += yLift;
    const bL = b.pos.clone().addScaledVector(b.right, offsetLeft); bL.y += yLift;
    const bR = b.pos.clone().addScaledVector(b.right, offsetRight); bR.y += yLift;
    verts.push(aL.x, aL.y, aL.z, aR.x, aR.y, aR.z, bL.x, bL.y, bL.z);
    verts.push(bL.x, bL.y, bL.z, aR.x, aR.y, aR.z, bR.x, bR.y, bR.z);
    if (uvRepeat) {
      const v0 = (i * DL) / uvRepeat, v1 = ((i + 1) * DL) / uvRepeat;
      uvs.push(0, v0, 1, v0, 0, v1);
      uvs.push(0, v1, 1, v0, 1, v1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  if (uvRepeat) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// 道からはなれた側だけ、ゆるやかに波打たせる高さ。
// 道路そのものは平らのままなので、走りやすさは変わらない。
function groundWave(d, seed = 0) {
  return Math.sin(d * 0.041 + seed) * 1.45 + Math.sin(d * 0.113 + seed * 2.1) * 0.62;
}

// 横方向にも高さを変える帯。道路脇の土手を水平な板ではなく斜面にする。
// wave を true にすると、外側のふちだけ うねる。
function buildSlopedRibbon(path, offsetLeft, offsetRight, material, yLeft, yRight, uvRepeat = 0, wave = 0) {
  const verts = [];
  const uvs = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = sampleAt(path, i * DL);
    const b = sampleAt(path, (i + 1) * DL);
    const da = i * DL, db = (i + 1) * DL;
    // うねりは「道から遠いほう」のふちにだけ足す
    const waveOuterA = wave ? groundWave(da, offsetLeft) * wave : 0;
    const waveOuterB = wave ? groundWave(db, offsetLeft) * wave : 0;
    const aL = a.pos.clone().addScaledVector(a.right, offsetLeft); aL.y += yLeft + waveOuterA;
    const aR = a.pos.clone().addScaledVector(a.right, offsetRight); aR.y += yRight;
    const bL = b.pos.clone().addScaledVector(b.right, offsetLeft); bL.y += yLeft + waveOuterB;
    const bR = b.pos.clone().addScaledVector(b.right, offsetRight); bR.y += yRight;
    verts.push(aL.x, aL.y, aL.z, aR.x, aR.y, aR.z, bL.x, bL.y, bL.z);
    verts.push(bL.x, bL.y, bL.z, aR.x, aR.y, aR.z, bR.x, bR.y, bR.z);
    if (uvRepeat) {
      const v0 = (i * DL) / uvRepeat, v1 = ((i + 1) * DL) / uvRepeat;
      uvs.push(0, v0, 1, v0, 0, v1, 0, v1, 1, v0, 1, v1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  if (uvRepeat) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// 道にそった「たての壁」（石垣などに使う）
function buildWall(path, offset, height, material, yBase = 0, uvRepeat = 0) {
  const verts = [];
  const uvs = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = sampleAt(path, i * DL);
    const b = sampleAt(path, (i + 1) * DL);
    const aP = a.pos.clone().addScaledVector(a.right, offset);
    const bP = b.pos.clone().addScaledVector(b.right, offset);
    verts.push(aP.x, aP.y + yBase, aP.z, aP.x, aP.y + yBase + height, aP.z, bP.x, bP.y + yBase, bP.z);
    verts.push(bP.x, bP.y + yBase, bP.z, aP.x, aP.y + yBase + height, aP.z, bP.x, bP.y + yBase + height, bP.z);
    if (uvRepeat) {
      const u0 = (i * DL) / uvRepeat, u1 = ((i + 1) * DL) / uvRepeat;
      uvs.push(u0, 0, u0, 1, u1, 0);
      uvs.push(u1, 0, u0, 1, u1, 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  if (uvRepeat) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  material.side = THREE.DoubleSide;
  return new THREE.Mesh(geo, material);
}


/* ------------------------- 風景の部品 ------------------------- */
function makeCloudCluster(rng, tall = false) {
  // 画像があれば1枚絵の板（つねにカメラを向く）
  if (TEX.cloud) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: TEX.cloud, transparent: true, depthWrite: false, fog: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, tall ? 2.4 : 1.6), mat);
    g.add(plane);
    g.userData.billboard = true;
    return g;
  }
  const g = new THREE.Group();
  const matWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const matShade = new THREE.MeshBasicMaterial({ color: 0xdcedf5, fog: false });
  const n = tall ? 10 : 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.6 + rng() * 0.9;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), i % 4 === 3 ? matShade : matWhite);
    puff.position.set((rng() - 0.5) * 3.2, tall ? rng() * 2.6 : rng() * 0.9, (rng() - 0.5) * 1.6);
    puff.scale.y = 0.72;
    g.add(puff);
  }
  return g;
}

function makeSceneryPlane(texture, width, height, y = height * 0.45) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0xffffff,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  plane.position.y = y;
  plane.userData.billboard = true;
  return plane;
}

function makeTree(rng) {
  const treeTextures = [TEX.fantasyTreeA, TEX.fantasyTreeB].filter(Boolean);
  if (treeTextures.length) {
    const texture = treeTextures[Math.floor(rng() * treeTextures.length)];
    const windTree = texture === TEX.fantasyTreeB;
    return makeSceneryPlane(texture, windTree ? 5.8 : 6.6, windTree ? 7.4 : 7.1, windTree ? 3.55 : 3.42);
  }
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, 1.1, 6),
    new THREE.MeshLambertMaterial({ color: 0x6d4a2f })
  );
  trunk.position.y = 0.55;
  g.add(trunk);
  const greens = [0x3e9c3d, 0x57b446, 0x2f8a44];
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.7 + rng() * 0.5, 8, 6),
      new THREE.MeshLambertMaterial({ color: greens[i % 3] })
    );
    leaf.position.set((rng() - 0.5) * 0.9, 1.3 + rng() * 0.8, (rng() - 0.5) * 0.9);
    g.add(leaf);
  }
  return g;
}

// 生成画像の草むら。1枚をサイズ違いで使い、海風にそよぐ道端をつくる。
function makeFantasyGrass(rng) {
  const variants = [TEX.fantasyGrass, TEX.fantasyGrassB, TEX.fantasyGrassC].filter(Boolean);
  if (!variants.length) return null;
  const texture = variants[Math.floor(rng() * variants.length)];
  const lowVariant = texture === TEX.fantasyGrassB;
  const windVariant = texture === TEX.fantasyGrassC;
  const grass = makeSceneryPlane(
    texture,
    windVariant ? 7.2 : lowVariant ? 6.8 : 5.8,
    windVariant ? 2.8 : lowVariant ? 3.0 : 3.9,
    windVariant ? 1.12 : lowVariant ? 1.18 : 1.45
  );
  grass.scale.setScalar(0.72 + rng() * 0.58);
  return grass;
}

function makeShop(rng) {
  // 画像があれば 商店の正面いちまい絵
  if (TEX.shop) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: TEX.shop, transparent: true, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(10, 7.5), mat);
    plane.position.y = 3.75;
    g.add(plane);
    return g;
  }
  const g = new THREE.Group();
  const woods = [0x6b4a33, 0x7a5a3e, 0x54402c];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3, 4),
    new THREE.MeshLambertMaterial({ color: woods[Math.floor(rng() * 3)] })
  );
  body.position.y = 1.5;
  g.add(body);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(4.6, 1.6, 4),
    new THREE.MeshLambertMaterial({ color: 0x4a4f5a })
  );
  roof.position.y = 3.8;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  // ひさし と かんばん
  const awning = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.15, 1.4), new THREE.MeshLambertMaterial({ color: 0xd85a30 }));
  awning.position.set(0, 2.35, 2.4);
  g.add(awning);
  const signColors = [0xf2efe4, 0xd85a30, 0xf2c027];
  for (let i = 0; i < 3; i++) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.06), new THREE.MeshLambertMaterial({ color: signColors[i] }));
    sign.position.set(-1.8 + i * 1.8, 1.5, 2.05);
    g.add(sign);
  }
  return g;
}

// リンク地点のJA支店を抽象化した、低い白壁と青い帯の建物。
function makeIslandBranch() {
  if (TEX.fantasyBranch) {
    const g = new THREE.Group();
    g.add(makeSceneryPlane(TEX.fantasyBranch, 12.5, 8.3, 3.35));
    g.userData.billboard = true;
    return g;
  }
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f1e9 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x3d8fc0 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x40525b });
  const body = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.35, 4.2), white);
  body.position.y = 1.18;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.24, 4.7), dark);
  roof.position.y = 2.48;
  const band = new THREE.Mesh(new THREE.BoxGeometry(7.24, 0.38, 4.24), blue);
  band.position.y = 1.75;
  g.add(body, roof, band);
  for (let i = -2; i <= 2; i++) {
    const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.72, 0.04), dark);
    windowMesh.position.set(i * 1.15, 1.05, 2.13);
    g.add(windowMesh);
  }
  const parking = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 9), new THREE.MeshLambertMaterial({ color: 0x777c7d }));
  parking.position.set(0, 0.02, 5.4);
  g.add(parking);
  for (let i = -1; i <= 1; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 2.3), new THREE.MeshLambertMaterial({ color: i === 0 ? 0xe8ecee : 0x83a9b6 }));
    car.position.set(i * 2.4, 0.36, 5.5);
    g.add(car);
  }
  return g;
}

/* --------- 道ばたの標識・電柱（すべてコードで描く。画像はいらない） --------- */

// 文字や記号を描いた板をつくる小道具
function makePaintedPlane(width, height, draw, opts = {}) {
  const px = opts.px || 256;
  const c = document.createElement('canvas');
  c.width = Math.round(px * (opts.aspect || width / height));
  c.height = px;
  const ctx = c.getContext('2d');
  draw(ctx, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: opts.depthWrite !== false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

function makeSignPost(height = 2.6, color = 0x9aa3a8) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.065, height, 6),
    new THREE.MeshLambertMaterial({ color })
  );
  post.position.y = height / 2;
  return post;
}

// 黄色いひし形の警戒標識（カーブ／勾配）
function makeDiamondSign(draw, height = 2.7) {
  const g = new THREE.Group();
  g.add(makeSignPost(height));
  const plate = makePaintedPlane(0.95, 0.95, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 4);
    const s = w * 0.62;
    ctx.fillStyle = '#f5c518';
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.lineWidth = w * 0.03;
    ctx.strokeStyle = '#2b2b2b';
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    draw(ctx, w, h);
  }, { px: 256, aspect: 1 });
  plate.position.y = height + 0.35;
  g.add(plate);
  return g;
}

function makeCurveSign(dir) {
  return makeDiamondSign((ctx, w, h) => {
    // 曲がる向きの矢印
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(dir >= 0 ? 1 : -1, 1);
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = w * 0.075;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.13, h * 0.2);
    ctx.quadraticCurveTo(w * 0.16, h * 0.14, w * 0.13, -h * 0.16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.13, -h * 0.24);
    ctx.lineTo(w * 0.04, -h * 0.09);
    ctx.lineTo(w * 0.22, -h * 0.09);
    ctx.closePath();
    ctx.fillStyle = '#2b2b2b';
    ctx.fill();
    ctx.restore();
  });
}

function makeGradeSign() {
  return makeDiamondSign((ctx, w, h) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    // 下り坂の三角
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -h * 0.02);
    ctx.lineTo(w * 0.2, -h * 0.02);
    ctx.lineTo(w * 0.2, h * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.font = `bold ${Math.round(h * 0.17)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('10%', 0, -h * 0.1);
    ctx.restore();
  });
}

// SLOW DOWN / 減速 の青看板
function makeSlowDownSign() {
  const g = new THREE.Group();
  for (const x of [-0.42, 0.42]) {
    const post = makeSignPost(1.5, 0xe9eaea);
    post.position.x = x;
    g.add(post);
  }
  const plate = makePaintedPlane(1.25, 1.5, (ctx, w, h) => {
    ctx.fillStyle = '#1552a8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = w * 0.045;
    ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(h * 0.19)}px sans-serif`;
    ctx.fillText('SLOW', w / 2, h * 0.37);
    ctx.fillText('DOWN', w / 2, h * 0.57);
    ctx.font = `bold ${Math.round(h * 0.16)}px sans-serif`;
    ctx.fillText('減速', w / 2, h * 0.81);
  }, { px: 320 });
  plate.position.y = 2.05;
  g.add(plate);
  return g;
}

// オレンジのカーブミラー
function makeCurveMirror() {
  const g = new THREE.Group();
  const orange = new THREE.MeshLambertMaterial({ color: 0xe8622a });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 4.1, 8), orange);
  pole.position.y = 2.05;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), orange);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.4, 4.0, 0);
  g.add(arm);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.075, 8, 20), orange);
  ring.position.set(0.85, 3.95, 0);
  g.add(ring);
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 20),
    new THREE.MeshLambertMaterial({ color: 0x5d6a70, side: THREE.DoubleSide, emissive: 0x20282c })
  );
  glass.position.set(0.85, 3.95, 0.02);
  g.add(glass);
  return g;
}

/* カーブの外側にならぶ、黄色い頭の視線誘導ポール。
   本数が多いので、同じ形をまとめて1回で描く（InstancedMesh）。      */
function buildGuidePosts(spots) {
  const group = new THREE.Group();
  if (!spots.length) return group;
  const parts = [
    { geo: sharedGeo('guidePost', () => new THREE.CylinderGeometry(0.055, 0.055, 1.0, 6)),
      mat: sharedMat('guidePost', () => new THREE.MeshLambertMaterial({ color: 0xf2f2ee })), y: 0.5 },
    { geo: sharedGeo('guideHead', () => new THREE.SphereGeometry(0.11, 8, 6)),
      mat: sharedMat('guideHead', () => new THREE.MeshBasicMaterial({ color: 0xf5c518 })), y: 1.05 },
  ];
  const m = new THREE.Matrix4();
  for (const part of parts) {
    const inst = new THREE.InstancedMesh(part.geo, part.mat, spots.length);
    spots.forEach((p, i) => {
      m.makeTranslation(p.x, p.y + part.y, p.z);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }
  return group;
}

// 電柱（田舎道の空気は これでほぼ決まる）。形は使いまわす。
function makeUtilityPole() {
  const g = new THREE.Group();
  const mat = sharedMat('poleWood', () => new THREE.MeshLambertMaterial({ color: 0x9c9a94 }));
  const pole = new THREE.Mesh(sharedGeo('poleShaft', () => new THREE.CylinderGeometry(0.11, 0.16, 7.4, 7)), mat);
  pole.position.y = 3.7;
  g.add(pole);
  const armGeo = sharedGeo('poleArm', () => new THREE.BoxGeometry(1.5, 0.09, 0.09));
  for (const y of [6.5, 5.7]) {
    const arm = new THREE.Mesh(armGeo, mat);
    arm.position.y = y;
    g.add(arm);
  }
  g.userData.wireTop = 6.5;
  return g;
}

// 電柱どうしをつなぐ、たわんだ電線
function makeWire(from, to, top, sag = 0.9) {
  const a = from.clone(); a.y += top;
  const b = to.clone(); b.y += top;
  const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(10));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2f3336 }));
}

// 路面の「速度落せ」ペイント
function makeRoadText(text, width) {
  const chars = [...text];
  const plane = makePaintedPlane(width, width * 2.6, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(246,244,236,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = h / (chars.length + 0.6);
    ctx.font = `bold ${Math.round(size * 0.92)}px "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
    chars.forEach((ch, i) => {
      // 手前から読めるよう、進行方向に長く引きのばす
      ctx.save();
      ctx.translate(w / 2, size * (i + 0.8));
      ctx.scale(1, 1.35);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  }, { px: 512, aspect: 1 / 2.6, depthWrite: false });
  plane.material.depthWrite = false;
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

// 島の民家（白い壁＋こげ茶の切妻屋根）。集落はこれをかたまりで置く。
function makeHouse(rng) {
  // 3種類の形を使いまわし、大きさのばらつきは scale で出す（描画を軽くする）
  const variant = Math.floor(rng() * 3);
  const w = 4.0, d = 3.6, h = 2.5;
  const g = new THREE.Group();
  const wallTints = [0xeee7d8, 0xe3dcc9, 0xd9d2bd];
  const body = new THREE.Mesh(
    sharedGeo('houseBody', () => new THREE.BoxGeometry(w, h, d)),
    sharedMat('houseWall' + variant, () => new THREE.MeshLambertMaterial({ color: wallTints[variant] }))
  );
  body.position.y = h / 2;
  g.add(body);
  // 切妻屋根。三角柱を横に倒してつくる。
  const roof = new THREE.Mesh(
    sharedGeo('houseRoof', () => new THREE.CylinderGeometry(d * 0.72, d * 0.72, w * 1.06, 3)),
    sharedMat('houseRoof', () => new THREE.MeshLambertMaterial({ color: 0x4a4038, flatShading: true }))
  );
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.y = h + d * 0.28;
  g.add(roof);
  const win = new THREE.Mesh(
    sharedGeo('houseWindow', () => new THREE.BoxGeometry(1.6, 0.7, 0.06)),
    sharedMat('houseWindow', () => new THREE.MeshLambertMaterial({ color: 0x3d4a52 }))
  );
  win.position.set(0, h * 0.55, d / 2 + 0.03);
  g.add(win);
  g.scale.set(0.85 + rng() * 0.5, 0.9 + rng() * 0.35, 0.85 + rng() * 0.5);
  return g;
}

// 海にうかぶ養殖いかだ
function makeRaft(rng) {
  // 遠くの海に浮かぶ小さな影なので、板1枚＋浮き2つで十分。
  const g = new THREE.Group();
  const deck = new THREE.Mesh(
    sharedGeo('raftDeck', () => new THREE.BoxGeometry(9.5, 0.24, 13)),
    sharedMat('raftDeck', () => new THREE.MeshLambertMaterial({ color: 0x2c3d4a }))
  );
  g.add(deck);
  const buoyGeo = sharedGeo('raftBuoy', () => new THREE.SphereGeometry(0.5, 6, 5));
  const buoyMat = sharedMat('raftBuoy', () => new THREE.MeshLambertMaterial({ color: 0xe4e0d2 }));
  for (const z of [-5.6, 5.6]) {
    const buoy = new THREE.Mesh(buoyGeo, buoyMat);
    buoy.position.set((rng() - 0.5) * 6, 0.12, z);
    g.add(buoy);
  }
  return g;
}

function makeBoat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.6), new THREE.MeshLambertMaterial({ color: 0xf4f1e8 }));
  hull.position.y = 0.25;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 1.1), new THREE.MeshLambertMaterial({ color: 0x4aa8e8 }));
  cabin.position.set(0, 0.8, -0.5);
  g.add(hull, cabin);
  return g;
}

function makeFerry() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 18), new THREE.MeshLambertMaterial({ color: 0xf6f3ec }));
  hull.position.y = 1.1;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.6, 12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  deck.position.y = 3.0;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.05, 0.5, 18.05), new THREE.MeshLambertMaterial({ color: 0xd85a30 }));
  stripe.position.y = 1.9;
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0x1f5b8c }));
  funnel.position.set(0, 4.4, -2);
  g.add(hull, deck, stripe, funnel);
  return g;
}

function buildScenery(path, totalLength) {
  const roadHalf = CONFIG.roadWidth / 2;
  const rng = mulberry32(2026);
  const end = sampleAt(path, totalLength);
  const seaY = end.pos.y - 1.45;                                  // 防波壁の向こうの海面
  const coast = end.pos.clone().addScaledVector(end.forward, 520); // 海面は駐車場より十分先

  // 現地の県道に合わせた、濃い青灰色のアスファルト。
  const roadMat = useTex('road', new THREE.MeshLambertMaterial({ color: 0x596166 }), [2.4, totalLength / 11]);
  worldGroup.add(buildRibbon(path, -roadHalf, roadHalf, roadMat, 0, totalLength));

  // 現地の白い外側線と、中央の短い破線。
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e4 });
  worldGroup.add(buildRibbon(path, -roadHalf + 0.22, -roadHalf + 0.34, lineMat, 0.035));
  worldGroup.add(buildRibbon(path, roadHalf - 0.34, roadHalf - 0.22, lineMat, 0.035));
  const dashGeo = new THREE.BoxGeometry(0.13, 0.025, 3.4);
  for (let d = 8; d < totalLength; d += 11) {
    const s = sampleAt(path, d);
    const dash = new THREE.Mesh(dashGeo, lineMat);
    dash.position.copy(s.pos);
    dash.position.y += 0.04;
    dash.rotation.order = 'YXZ';
    dash.rotation.y = -s.heading;
    dash.rotation.x = -s.pitch;
    worldGroup.add(dash);
  }

  // ストリートビューで目立つ、坂の入口の白い減速用シェブロン。
  const chevronGeo = new THREE.BoxGeometry(2.35, 0.026, 0.22);
  for (let d = 26; d < 82; d += 13) {
    const s = sampleAt(path, d);
    const mark = new THREE.Group();
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(chevronGeo, lineMat);
      bar.position.x = side * 0.95;
      bar.rotation.y = side * 0.48;
      mark.add(bar);
    }
    mark.position.copy(s.pos);
    mark.position.y += 0.045;
    mark.rotation.order = 'YXZ';
    mark.rotation.y = -s.heading;
    mark.rotation.x = -s.pitch;
    worldGroup.add(mark);
  }

  // 道路脇を3段に分ける。大きな平面1枚ではなく、高低差のある草地と石垣にする。
  const grassMat = useTex('ground', new THREE.MeshLambertMaterial({ color: 0x63b24f }), [11, totalLength / 12]);
  worldGroup.add(buildRibbon(path, -roadHalf - 7, -roadHalf, grassMat, -0.06, totalLength));
  worldGroup.add(buildSlopedRibbon(path, -roadHalf - 24, -roadHalf - 7, grassMat, 2.0, 0.82, totalLength, 0.55));
  worldGroup.add(buildSlopedRibbon(path, -roadHalf - 58, -roadHalf - 24, grassMat, 4.1, 2.0, totalLength, 1.0));
  // 右の草地を擁壁までつなぎ、間から低い海面がのぞく隙間を完全にふさぐ。
  worldGroup.add(buildRibbon(path, roadHalf, roadHalf + 5.2, grassMat, -0.06, totalLength));

  // 白線の外には短い砂利肩を置き、大きな草画像がアスファルトへ触れない余白をつくる。
  const shoulderMat = new THREE.MeshLambertMaterial({ color: 0x9aa59d });
  worldGroup.add(buildRibbon(path, -roadHalf - 0.72, -roadHalf, shoulderMat, -0.015));
  worldGroup.add(buildRibbon(path, roadHalf, roadHalf + 0.72, shoulderMat, -0.015));

  // 現地と同じ銀色のガードレールを両側に通す。
  const railMat = new THREE.MeshLambertMaterial({ color: 0xb8c5ca, emissive: 0x152126 });
  // ガードレールの支柱は本数が多いので、まとめて1回で描く。
  const postGeo = sharedGeo('railPost', () => new THREE.BoxGeometry(0.12, 0.72, 0.12));
  const railMatrix = new THREE.Matrix4();
  for (const side of [-1, 1]) {
    const offset = side * (roadHalf + 0.28);
    worldGroup.add(buildWall(path, offset, 0.16, railMat, 0.58));
    const spots = [];
    for (let d = 2; d < totalLength; d += 6.5) {
      const s = sampleAt(path, d);
      spots.push(s.pos.clone().addScaledVector(s.right, offset));
    }
    const posts = new THREE.InstancedMesh(postGeo, railMat, spots.length);
    spots.forEach((p, i) => {
      railMatrix.makeTranslation(p.x, p.y + 0.35, p.z);
      posts.setMatrixAt(i, railMatrix);
    });
    posts.instanceMatrix.needsUpdate = true;
    worldGroup.add(posts);
  }

  // 両側の段差を石積みで見せ、横方向の奥行きをはっきりさせる。
  const stoneMatR = useTex('wall', new THREE.MeshLambertMaterial({ color: 0xbdb49e }), [totalLength / 6, 1]);
  worldGroup.add(buildWall(path, -roadHalf - 7, 0.92, stoneMatR, -0.06, totalLength));
  worldGroup.add(buildWall(path, roadHalf + 5.2, 1.15, stoneMatR, -0.05, totalLength));
  worldGroup.add(buildSlopedRibbon(path, roadHalf + 17, roadHalf + 5.2, grassMat, 2.3, 1.02, totalLength, 0.6));
  worldGroup.add(buildSlopedRibbon(path, roadHalf + 45, roadHalf + 17, grassMat, 4.8, 2.3, totalLength, 1.15));

  // 電柱と電線を右側にとおす。日本の田舎道らしさは これが効く。
  let prevPole = null;
  for (let d = 22; d < totalLength - 40; d += CONFIG.poleSpacing) {
    const s = sampleAt(path, d);
    const pole = makeUtilityPole();
    const pp = s.pos.clone().addScaledVector(s.right, roadHalf + 1.9);
    pole.position.set(pp.x, pp.y, pp.z);
    pole.rotation.y = -s.heading;
    worldGroup.add(pole);
    if (prevPole) worldGroup.add(makeWire(prevPole, pole.position, pole.userData.wireTop));
    prevPole = pole.position.clone();
  }

  // 大カーブの手前に、路面の「速度落せ」と標識セットをまとめて置く。
  for (const curve of bigCurves) {
    const outer = -curve.dir;   // カーブの外側（写真のミラーとポールがある側）

    const textS = sampleAt(path, Math.max(12, curve.start - 46));
    const roadText = makeRoadText('速度落せ', CONFIG.roadWidth * 0.42);
    roadText.position.copy(textS.pos);
    roadText.position.y += 0.05;
    roadText.rotation.order = 'YXZ';
    roadText.rotation.y = -textS.heading;
    roadText.rotation.x = -Math.PI / 2 - textS.pitch;
    worldGroup.add(roadText);

    const signSpots = [
      { at: curve.start - 34, build: () => makeCurveSign(curve.dir), side: outer, off: roadHalf + 1.4 },
      { at: curve.start - 30, build: makeGradeSign, side: outer, off: roadHalf + 1.4, lift: -1.15 },
      { at: curve.start - 20, build: makeSlowDownSign, side: outer, off: roadHalf + 2.2 },
      { at: curve.start + 8,  build: makeCurveMirror, side: outer, off: roadHalf + 2.6 },
    ];
    for (const spot of signSpots) {
      if (spot.at < 6) continue;
      const s = sampleAt(path, spot.at);
      const obj = spot.build();
      const p = s.pos.clone().addScaledVector(s.right, spot.side * spot.off);
      obj.position.set(p.x, p.y + (spot.lift || 0), p.z);
      // 標識はどちら側に立てても、走ってくるプレイヤーの方を向かせる
      obj.rotation.y = -s.heading;
      worldGroup.add(obj);
    }

    // カーブ外側に黄色ポールをならべる（まとめて1回で描く）
    const postSpots = [];
    for (let d = curve.start; d < curve.end; d += CONFIG.guidePostSpacing) {
      const s = sampleAt(path, d);
      postSpots.push(s.pos.clone().addScaledVector(s.right, outer * (roadHalf + 0.95)));
    }
    worldGroup.add(buildGuidePosts(postSpots));
  }

  // 木（右の段の上にランダムに）
  for (let d = 12; d < totalLength; d += 16 + rng() * 14) {
    const s = sampleAt(path, d);
    const tree = makeTree(rng);
    const p = s.pos.clone().addScaledVector(s.right, roadHalf + 5 + rng() * 18);
    tree.position.set(p.x, p.y + 1.3, p.z);
    tree.scale.setScalar(0.8 + rng() * 0.9);
    worldGroup.add(tree);
    if (tree.userData.billboard) billboards.push(tree);
    rememberMotion(tree, 'trees', rng() * Math.PI * 2);
  }

  // 幻想的な草むらを両側へ重ね、平らな緑の帯に奥行きと光を足す。
  if (TEX.fantasyGrass) {
    for (let d = 7; d < totalLength; d += 8 + rng() * 7) {
      const s = sampleAt(path, d);
      for (const side of [-1, 1]) {
        if (rng() < 0.1) continue;
        const grass = makeFantasyGrass(rng);
        const offset = side < 0 ? roadHalf + 3.4 + rng() * 4.2 : roadHalf + 8.2 + rng() * 6.0;
        const p = s.pos.clone().addScaledVector(s.right, side * offset);
        grass.position.x += p.x;
        grass.position.y += p.y + (side > 0 ? 1.25 : 0.25);
        grass.position.z += p.z;
        worldGroup.add(grass);
        billboards.push(grass);
        rememberMotion(grass, 'grass', rng() * Math.PI * 2);
      }
    }
  }

  // 新しい横長素材を距離と高さをずらして重ね、同じ草1枚の反復を目立たなくする。
  const layeredScenery = [
    { texture: TEX.fantasyHedge, width: 16, height: 5.3, step: 25, near: 13.2, lift: 0.55 },
    { texture: TEX.fantasySlope, width: 21, height: 7.2, step: 76, near: 16.5, lift: 1.2 },
    { texture: TEX.fantasyGrove, width: 25, height: 11.4, step: 54, near: 28, lift: 2.25 },
  ];
  for (const layer of layeredScenery) {
    if (!layer.texture) continue;
    for (let d = 105 + rng() * 20; d < totalLength - 95; d += layer.step + rng() * layer.step * 0.35) {
      const s = sampleAt(path, d);
      for (const side of [-1, 1]) {
        if (layer.texture === TEX.fantasySlope && side < 0 && rng() < 0.45) continue;
        const sprite = makeSceneryPlane(layer.texture, layer.width, layer.height, layer.height * 0.43);
        const offset = layer.near + rng() * (layer.texture === TEX.fantasyGrove ? 12 : 5);
        const p = s.pos.clone().addScaledVector(s.right, side * offset);
        sprite.position.x += p.x;
        sprite.position.y += p.y + layer.lift + (side > 0 ? 0.65 : 0);
        sprite.position.z += p.z;
        sprite.scale.setScalar(0.86 + rng() * 0.38);
        worldGroup.add(sprite);
        billboards.push(sprite);
        if (layer.texture !== TEX.fantasySlope) rememberMotion(sprite, 'grass', rng() * Math.PI * 2);
      }
    }
  }

  // スタート付近右側の支店建物と駐車場。
  const branchS = sampleAt(path, 58);
  const branch = makeIslandBranch();
  const branchP = branchS.pos.clone().addScaledVector(branchS.right, roadHalf + 11.5);
  branch.position.set(branchP.x, branchP.y + 0.12, branchP.z);
  if (branch.userData.billboard) {
    billboards.push(branch);
  } else {
    branch.rotation.y = -branchS.heading - Math.PI / 2;
  }
  worldGroup.add(branch);

  // 木造のお店は、集落のなかに1〜2軒だけ置いて主役にしない。
  for (let d = 300; d < totalLength - 120; d += 340 + rng() * 120) {
    const s = sampleAt(path, d);
    const shop = makeShop(rng);
    const p = s.pos.clone().addScaledVector(s.right, roadHalf + 7.5);
    shop.position.set(p.x, p.y + 1.15, p.z);
    shop.rotation.y = -s.heading - Math.PI / 2;
    worldGroup.add(shop);
  }

  // 民家は「かたまり」で置く。集落はまとまるもの。
  // 出発の集落 → 山の中腹は無人 → 港が近づくとまた家が増える、という密度の変化をつくる。
  const villages = [
    { at: 30,                 count: 7,  spread: 46, side: 1 },
    { at: totalLength - 250,  count: 6,  spread: 52, side: 1 },
    { at: totalLength - 140,  count: 9,  spread: 62, side: 1 },
    { at: totalLength - 120,  count: 4,  spread: 44, side: -1 },
  ];
  for (const village of villages) {
    for (let i = 0; i < village.count; i++) {
      const d = village.at + (rng() - 0.5) * village.spread;
      if (d < 8 || d > totalLength - 40) continue;
      const s = sampleAt(path, d);
      const house = makeHouse(rng);
      // 道からの距離をばらつかせ、奥行きのある集落にする
      const offset = village.side * (roadHalf + 8 + rng() * 22);
      const p = s.pos.clone().addScaledVector(s.right, offset);
      const lift = village.side > 0 ? 1.2 : -0.4;
      house.position.set(p.x, p.y + lift, p.z);
      // 家の向きは道と平行を基本に、すこしだけ ばらけさせる
      house.rotation.y = -s.heading + (rng() - 0.5) * 0.6;
      worldGroup.add(house);
    }
  }

  // 現地写真と同じく、畑は道路右側の斜面へ段々に並べる。
  if (TEX.fantasyTerrace) {
    for (let d = 34; d < totalLength * 0.72; d += 44 + rng() * 18) {
      const s = sampleAt(path, d);
      const terrace = makeSceneryPlane(TEX.fantasyTerrace, 17 + rng() * 4, 8.2 + rng() * 1.2, 3.2);
      const p = s.pos.clone().addScaledVector(s.right, roadHalf + 13 + rng() * 8);
      terrace.position.x += p.x;
      terrace.position.y += p.y + 0.85;
      terrace.position.z += p.z;
      terrace.scale.setScalar(0.88 + rng() * 0.28);
      worldGroup.add(terrace);
      billboards.push(terrace);
    }
  } else {
    const terraceGeo = new THREE.BoxGeometry(11, 0.38, 13);
    const terraceMat = new THREE.MeshLambertMaterial({ color: 0x8fc45e });
    for (let d = 30; d < totalLength * 0.6; d += 34) {
      const s = sampleAt(path, d);
      const box = new THREE.Mesh(terraceGeo, terraceMat);
      const p = s.pos.clone().addScaledVector(s.right, roadHalf + 11);
      box.position.set(p.x, p.y + 0.1, p.z);
      box.rotation.y = -s.heading;
      worldGroup.add(box);
    }
  }

  // 最後の60mは、道路と同じ高さにつながる港の駐車場。海面は防波壁の先だけに置く。
  const parkingS = sampleAt(path, totalLength - 30);
  const parking = new THREE.Group();
  parking.position.copy(parkingS.pos);
  parking.rotation.order = 'YXZ';
  parking.rotation.y = -parkingS.heading;
  parking.rotation.x = -parkingS.pitch;
  const parkingMat = useTex('harborParking', new THREE.MeshLambertMaterial({ color: 0xa9c3cd }), [3, 6]);
  const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(76, 0.12, 68), parkingMat);
  quayDeck.position.y = -0.11;
  parking.add(quayDeck);
  const parkingDeck = new THREE.Mesh(new THREE.BoxGeometry(34, 0.16, 64), parkingMat);
  parkingDeck.position.y = -0.04;
  parking.add(parkingDeck);

  // 駐車枠と横断するゴールライン。矢印ではなく、海辺で安全に止まれる余白を見せる。
  const parkingLineMat = new THREE.MeshBasicMaterial({ color: 0xf7f5e8 });
  for (const side of [-1, 1]) {
    for (let z = -19; z <= 14; z += 11) {
      const bayLine = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 8.2), parkingLineMat);
      bayLine.position.set(side * 11.5, 0.07, z);
      parking.add(bayLine);
    }
  }
  const finishLine = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.028, 0.7), parkingLineMat);
  finishLine.position.set(0, 0.075, -24.5);
  parking.add(finishLine);
  for (let x = -5.5; x <= 5.5; x += 1.1) {
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.03, 0.72),
      new THREE.MeshBasicMaterial({ color: Math.round(x / 1.1) % 2 ? 0x247ea9 : 0xf8d950 })
    );
    tile.position.set(x, 0.09, -24.5);
    parking.add(tile);
  }
  worldGroup.add(parking);

  function addHarborSprite(texture, width, height, distance, sideOffset, lift = 0) {
    if (!texture) return;
    const s = sampleAt(path, distance);
    const sprite = makeSceneryPlane(texture, width, height, height * 0.45);
    const p = s.pos.clone().addScaledVector(s.right, sideOffset);
    sprite.position.x += p.x;
    sprite.position.y += p.y + lift;
    sprite.position.z += p.z;
    worldGroup.add(sprite);
    billboards.push(sprite);
  }

  // 添付写真の港らしさを、カーブミラー・車・待合所・低い防波壁でまとめる。
  addHarborSprite(TEX.harborCars, 13, 5.2, totalLength - 37, 10.2, 0.1);
  addHarborSprite(TEX.harborShelter, 14.5, 8.5, totalLength - 31, -12.4, 0.05);
  addHarborSprite(TEX.harborMirror, 4.1, 6.4, totalLength - 11, 6.8, 0.05);
  if (TEX.harborSeawall) {
    const wall = makeSceneryPlane(TEX.harborSeawall, 39, 7.8, 2.55);
    const wallP = end.pos.clone().addScaledVector(end.forward, 8);
    wall.position.x += wallP.x;
    wall.position.y += wallP.y - 0.15;
    wall.position.z += wallP.z;
    worldGroup.add(wall);
    billboards.push(wall);
  }

  // 海は防波壁の向こうから始まる長方形に変更。円形の海が道路の下へ回り込むのを防ぐ。
  const seaGroup = new THREE.Group();
  seaGroup.position.copy(end.pos);
  seaGroup.rotation.y = -end.heading;
  const deepSea = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 8000),
    useTex('sea', new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), [9, 9])
  );
  deepSea.rotation.x = -Math.PI / 2;
  // 遠端をカメラの描画距離より先へ送り、海の板が山形に見える境界をなくす。
  deepSea.position.set(0, seaY - end.pos.y, -2000);
  seaGroup.add(deepSea);
  motionActors.seas.push(deepSea);
  // 海面を2枚重ねると遠景でZ-fighting（ちらつき）が起きるため、
  // 色の変化は模様入りテクスチャ1枚だけで表現する。
  worldGroup.add(seaGroup);

  // 港のフェリーと小舟は防波壁より沖に配置する。
  const ferry = makeFerry();
  const ferryP = end.pos.clone().addScaledVector(end.forward, 130).addScaledVector(end.right, -42);
  ferry.position.set(ferryP.x, seaY + 0.2, ferryP.z);
  worldGroup.add(ferry);
  rememberMotion(ferry, 'boats', 0.4);
  for (let i = 0; i < 3; i++) {
    const boat = makeBoat();
    const boatP = end.pos.clone().addScaledVector(end.forward, 105 + rng() * 170).addScaledVector(end.right, (rng() - 0.5) * 170);
    boat.position.set(boatP.x, seaY + 0.3, boatP.z);
    boat.rotation.y = rng() * Math.PI * 2;
    worldGroup.add(boat);
    rememberMotion(boat, 'boats', rng() * Math.PI * 2);
  }

  // 防波壁の先に大小の島影を重ね、海を単色の帯に見せない。
  const islandMat = new THREE.MeshLambertMaterial({ color: 0x568e83 });
  for (const [side, ahead, r] of [
    [-420, 470, 72], [-270, 610, 48], [-145, 430, 32], [-35, 780, 92],
    [85, 520, 41], [210, 640, 58], [330, 450, 38], [470, 720, 76],
  ]) {
    const islP = end.pos.clone().addScaledVector(end.forward, ahead).addScaledVector(end.right, side);
    const isl = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.4, 7), islandMat);
    isl.position.set(islP.x, seaY + 1, islP.z);
    worldGroup.add(isl);
  }

  // 対岸の山なみ。遠い層ほど空の色に近づけると、いっきに奥ゆきが出る。
  const ridgeTints = [0x6d9cb8, 0x87b0c6, 0x9fc2d2];
  for (let layer = 0; layer < CONFIG.ridgeLayers; layer++) {
    const ahead = 1250 + layer * 420;
    const scale = 1 + layer * 0.45;
    // 霧の色を焼きこんだ単色。fog を切らないと遠すぎて消えてしまう。
    const ridgeMat = new THREE.MeshBasicMaterial({ color: ridgeTints[layer] || 0x9fc2d2, fog: false });
    for (let i = -7; i <= 7; i++) {
      const r = (95 + rng() * 85) * scale;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(r, r * (0.28 + rng() * 0.16), 6), ridgeMat);
      const rp = end.pos.clone()
        .addScaledVector(end.forward, ahead + (rng() - 0.5) * 220)
        .addScaledVector(end.right, i * 175 * scale + (rng() - 0.5) * 90);
      peak.position.set(rp.x, seaY, rp.z);
      worldGroup.add(peak);
    }
  }

  // 養殖いかだ。海面に黒い点列があるだけで「生きている瀬戸内海」になる。
  for (let i = 0; i < CONFIG.raftCount; i++) {
    const raft = makeRaft(rng);
    const rp = end.pos.clone()
      .addScaledVector(end.forward, 190 + rng() * 520)
      .addScaledVector(end.right, (rng() - 0.5) * 620);
    raft.position.set(rp.x, seaY + 0.25, rp.z);
    raft.rotation.y = rng() * Math.PI;
    worldGroup.add(raft);
    rememberMotion(raft, 'boats', rng() * Math.PI * 2);
  }

  // 右手にそびえる壇山の稜線。「平らな緑」を断ち切る。
  const mountainMat = new THREE.MeshLambertMaterial({ color: 0x4f7f45, flatShading: true });
  for (let d = 60; d < totalLength; d += 120) {
    const s = sampleAt(path, d);
    for (let k = 0; k < 2; k++) {
      const r = 46 + rng() * 34;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, r * (0.5 + rng() * 0.3), 7), mountainMat);
      // 山のふもとが道路へせり出さないよう、半径のぶんだけ必ず右へ逃がす
      const offset = roadHalf + 46 + r + k * 58 + rng() * 30;
      const hp = s.pos.clone().addScaledVector(s.right, offset);
      hill.position.set(hp.x, s.pos.y - 6 + k * 4, hp.z);
      worldGroup.add(hill);
    }
  }

  // 雲（コースぞいの空にちらばせる）
  for (let i = 0; i < 12; i++) {
    const s = sampleAt(path, rng() * totalLength);
    const cloud = makeCloudCluster(rng);
    const side = rng() < 0.5 ? -1 : 1;
    const p = s.pos.clone().addScaledVector(s.right, side * (140 + rng() * 240));
    // 坂の標高と一緒に雲まで下げない。海面上の白い塊に見えない高さへ固定する。
    cloud.position.set(p.x, s.pos.y + 145 + rng() * 65, p.z);
    cloud.scale.setScalar(7 + rng() * 11);
    worldGroup.add(cloud);
    if (cloud.userData.billboard) billboards.push(cloud);
    rememberMotion(cloud, 'clouds', rng() * Math.PI * 2);
  }

  // ゴールの先にそびえる入道雲
  const bigCloud = makeCloudCluster(rng, true);
  const bp = coast.clone().addScaledVector(end.forward, 240);
  bigCloud.position.set(bp.x, end.pos.y + 165, bp.z);
  bigCloud.scale.setScalar(28);
  worldGroup.add(bigCloud);
  if (bigCloud.userData.billboard) billboards.push(bigCloud);
  rememberMotion(bigCloud, 'clouds', 1.2);

  // 港の景色を隠さない低いゴールマーカー。駐車場の白線で安全に停止する。
  const gs = sampleAt(path, totalLength - 5.5);
  const goalMarkers = new THREE.Group();
  const postMat = new THREE.MeshLambertMaterial({ color: 0xf4efe0 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.7, 8), postMat);
    post.position.set(side * 6.2, 1.35, 0);
    goalMarkers.add(post);
    const pennant = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, 1.4, 3),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0x2aa7ca : 0xf3ce3d, side: THREE.DoubleSide })
    );
    pennant.position.set(side * 6.2, 2.18, 0);
    pennant.rotation.z = side * Math.PI / 2;
    goalMarkers.add(pennant);
  }
  goalMarkers.position.copy(gs.pos);
  goalMarkers.rotation.y = -gs.heading;
  worldGroup.add(goalMarkers);
}


/* ------------------------- 4. プレイヤー ------------------------- */
function buildPlayer() {
  // 入力を120msでなめらかに補間し、中央・左・右のうち1枚だけを表示する。
  // 左右画像がなくても、中央画像だけで今までどおり動く。
  if (TEX.skater) {
    const g = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(1.9, 2.85);
    const poseTextures = {
      center: TEX.skater,
      left: TEX.skaterLeft || TEX.skater,
      // 強い左カーブ画像を右だけ反転し、左右で同じ荷重量を保証する。
      right: TEX.skaterLeft || TEX.skaterRight || TEX.skater,
    };
    const poseMeshes = {};
    for (const [pose, texture] of Object.entries(poseTextures)) {
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.08,
        opacity: pose === 'center' ? 1 : 0,
        depthWrite: false,
      });
      const plane = new THREE.Mesh(geometry, mat);
      if (pose === 'right' && TEX.skaterLeft) plane.scale.x = -1;
      plane.position.y = 1.35;
      plane.renderOrder = pose === 'center' ? 3 : 4;
      g.add(plane);
      poseMeshes[pose] = plane;
    }
    g.userData.spriteMode = true;
    g.userData.poseMeshes = poseMeshes;
    g.userData.basePlaneY = 1.35;
    scene.add(g);
    return g;
  }

  // +Z がすすむ向き。カメラは後ろから背中を見る
  const g = new THREE.Group();

  const jacketMat = new THREE.MeshLambertMaterial({ color: CONFIG.jacketColor });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
  const shortsMat = new THREE.MeshLambertMaterial({ color: 0x23232a });
  const accentMat = new THREE.MeshLambertMaterial({ color: 0x6a3fb5 });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xa8d84a });
  const strapMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  const boardMat = new THREE.MeshLambertMaterial({ color: CONFIG.boardColor });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x40c4d8 });

  // スケボー
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 1.5), boardMat);
  board.position.y = 0.26;
  g.add(board);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 1.3), new THREE.MeshLambertMaterial({ color: 0xd85a30 }));
  stripe.position.y = 0.315;
  g.add(stripe);
  for (const [x, z] of [[-0.19, 0.52], [0.19, 0.52], [-0.19, -0.52], [0.19, -0.52]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.12, z);
    g.add(wheel);
  }

  // 前後にひらいたスタンスの足と むらさきスニーカー
  const shoeF = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.36), accentMat);
  shoeF.position.set(0, 0.36, 0.32);
  const shoeB = shoeF.clone();
  shoeB.position.z = -0.34;
  g.add(shoeF, shoeB);
  const legF = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.44, 0.15), skinMat);
  legF.position.set(0, 0.64, 0.3);
  legF.rotation.x = -0.15;
  const legB = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.44, 0.15), skinMat);
  legB.position.set(0, 0.64, -0.31);
  legB.rotation.x = 0.2;
  g.add(legF, legB);

  // 黒いハーフパンツ（サイドにむらさきライン）
  const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.52), shortsMat);
  shorts.position.y = 0.98;
  g.add(shorts);
  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.48), accentMat);
    line.position.set(side * 0.22, 0.98, 0);
    g.add(line);
  }

  // 水色のもこもこブルゾン（すこし前かがみ）
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.62, 0.46), jacketMat);
  torso.position.set(0, 1.42, -0.02);
  torso.rotation.x = 0.12;
  g.add(torso);

  // うで（うしろに ながす）
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), jacketMat);
    arm.position.set(side * 0.37, 1.28, -0.08);
    arm.rotation.x = 0.55;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skinMat);
    hand.position.set(side * 0.37, 1.05, -0.22);
    g.add(hand);
  }

  // 背中のショルダーストラップ（ななめがけ）
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.04), strapMat);
  strap.position.set(0, 1.42, -0.27);
  strap.rotation.z = 0.55;
  g.add(strap);

  // あたま と きみどりのニットぼう
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat);
  head.position.y = 1.9;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 10), capMat);
  cap.scale.y = 0.75;
  cap.position.y = 1.99;
  g.add(cap);

  scene.add(g);
  return g;
}


/* ------------------------- 障害物・アイテムの見た目 ------------------------- */
function makePictureObstacle(texture, width, height, halfWidth, type) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0xffffff,
  });
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  picture.position.y = height * 0.49;
  g.add(picture);
  g.userData.halfWidth = halfWidth;
  g.userData.type = type;
  return g;
}

function makeTruck() {
  if (TEX.fantasyTruck) return makePictureObstacle(TEX.fantasyTruck, 2.55, 2.55, 0.95, 'truck');
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 3.0), new THREE.MeshLambertMaterial({ color: 0xdedad2 }));
  body.position.y = 0.75;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.0), new THREE.MeshLambertMaterial({ color: 0x4aa8e8 }));
  cab.position.set(0, 1.1, 0.95);
  g.add(body, cab);
  for (const [x, z] of [[-0.85, 1.0], [0.85, 1.0], [-0.85, -1.1], [0.85, -1.1]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 12), new THREE.MeshLambertMaterial({ color: 0x2c2c2a }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.32, z);
    g.add(wheel);
  }
  g.userData.halfWidth = 0.95; g.userData.type = 'truck';
  return g;
}

function makeBus() {
  if (TEX.fantasyBus) return makePictureObstacle(TEX.fantasyBus, 3.15, 2.75, 1.25, 'bus');
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 5.0), new THREE.MeshLambertMaterial({ color: 0xf2ead8 }));
  body.position.y = 1.15;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.35, 5.02), new THREE.MeshLambertMaterial({ color: 0xd85a30 }));
  stripe.position.y = 0.75;
  g.add(body, stripe);
  for (const [x, z] of [[-1.05, 1.7], [1.05, 1.7], [-1.05, -1.7], [1.05, -1.7]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12), new THREE.MeshLambertMaterial({ color: 0x2c2c2a }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    g.add(wheel);
  }
  g.userData.halfWidth = 1.25; g.userData.type = 'bus';
  return g;
}

function makeCrate() {
  if (TEX.fantasyObstacle) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      map: TEX.fantasyObstacle,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: 0xffffff,
    });
    const picture = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), mat);
    picture.position.y = 1.22;
    g.add(picture);
    g.userData.halfWidth = 0.72; g.userData.type = 'crate';
    return g;
  }
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xba7517 });
  for (const [x, y, z] of [[0, 0.3, 0], [0.35, 0.3, 0.1], [-0.3, 0.85, -0.05]]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), mat);
    box.position.set(x, y, z);
    g.add(box);
  }
  g.userData.halfWidth = 0.55; g.userData.type = 'crate';
  return g;
}

function makeLemon() {
  const g = new THREE.Group();
  const lemon = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf5e04a }));
  lemon.scale.set(1, 0.85, 1.3);
  lemon.position.y = 1.0;
  g.add(lemon);
  g.userData.halfWidth = 0.4; g.userData.spin = true; g.userData.baseY = 1.0;
  return g;
}

function makeStrawberry() {
  const g = new THREE.Group();
  const berry = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe24b4a }));
  berry.position.y = 1.0;
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 6), new THREE.MeshLambertMaterial({ color: 0x639922 }));
  leaf.position.y = 1.24;
  g.add(berry, leaf);
  g.userData.halfWidth = 0.4; g.userData.spin = true; g.userData.baseY = 1.0; g.userData.bonus = true;
  return g;
}

const OBSTACLE_BUILDERS = [makeTruck, makeBus, makeCrate];


/* ------------------------- 5. スポナー ------------------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spawnItems(path, totalLength, level) {
  const rng = mulberry32(1234 + level * 97);
  const items = [];
  let d = 60;
  const [minGap, maxGap] = CONFIG.lemonSpacing;
  while (d < totalLength - 90) {
    const lane = Math.floor(rng() * 3) - 1;
    let group;
    if (rng() < CONFIG.obstacleDensity) {
      const build = OBSTACLE_BUILDERS[Math.floor(rng() * OBSTACLE_BUILDERS.length)];
      group = build();
      group.userData.kind = 'obstacle';
    } else {
      group = makeLemon();
      group.userData.kind = 'lemon';
    }
    const s = sampleAt(path, d);
    const p = s.pos.clone().addScaledVector(s.right, lane * CONFIG.laneSpacing);
    group.position.set(p.x, p.y, p.z);
    group.rotation.order = 'YXZ';
    group.rotation.y = Math.PI - s.heading;
    if (group.userData.kind === 'obstacle') group.rotation.x = s.pitch;
    group.userData.dist = d;
    group.userData.laneX = lane * CONFIG.laneSpacing;
    worldGroup.add(group);
    items.push(group);
    d += minGap + rng() * (maxGap - minGap);
  }
  // ボーナスいちご
  for (let i = 1; i * 480 < totalLength - 150; i++) {
    const bd = 150 + i * 480 + rng() * 80;
    const lane = Math.floor(rng() * 3) - 1;
    const berry = makeStrawberry();
    const s = sampleAt(path, bd);
    const p = s.pos.clone().addScaledVector(s.right, lane * CONFIG.laneSpacing);
    berry.position.set(p.x, p.y, p.z);
    berry.userData.dist = bd;
    berry.userData.laneX = lane * CONFIG.laneSpacing;
    berry.userData.kind = 'lemon';
    worldGroup.add(berry);
    items.push(berry);
  }
  return items;
}


/* ------------------------- ゲーム状態 ------------------------- */
const state = {
  level: 1,
  distance: 0,
  totalLength: 0,
  lemons: 0,
  lives: CONFIG.lives,
  xOffset: 0,
  xVel: 0,
  visualSteer: 0,
  cameraBank: 0,
  cameraShakeT: 0,
  crest: 0,
  lap: 1,
  bestLemons: 0,
  speedScale: 1,
  impactFlash: 0,
  pickupFlash: 0,
  invincibleT: 0,
  running: false,
  path: null,
  items: [],
};

let player = buildPlayer();

// 画像がとどいたあと、いまのレベルを組み立てなおす（進行状況はそのまま）
function rebuildLevel() {
  const keepDistance = state.distance;
  const keepLemons = state.lemons;
  const keepLives = state.lives;
  const wasRunning = state.running;
  startLevel(state.level);
  state.distance = keepDistance;
  state.lemons = keepLemons;
  state.lives = keepLives;
  state.running = wasRunning;
  renderLives();
}

function startLevel(level) {
  clearWorld();
  state.items = [];
  billboards = [];
  motionActors = { trees: [], grass: [], boats: [], clouds: [], seas: [] };

  // レベルは増やさず、同じ坂を何周でも走れるようにする。
  const course = COURSE.map(seg => ({ ...seg }));
  bigCurves = findBigCurves(course);
  state.path = buildPath(course);
  state.totalLength = (state.path.length - 1) * DL;
  buildScenery(state.path, state.totalLength);
  state.items = spawnItems(state.path, state.totalLength, level);

  state.level = 1;
  state.distance = 0;
  state.xOffset = 0;
  state.xVel = 0;
  state.visualSteer = 0;
  state.cameraBank = 0;
  state.cameraShakeT = 0;
  state.crest = 0;
  state.impactFlash = 0;
  state.pickupFlash = 0;
  state.lives = CONFIG.lives;
  state.invincibleT = 0;

  // リトライ時に前のゴール地点から長く補間しないよう、カメラも即座に戻す。
  const startCam = sampleAt(state.path, 0).pos.clone();
  startCam.y += CONFIG.cameraHeight;
  camera.position.copy(startCam);
  const startLook = sampleAt(state.path, CONFIG.cameraLookAhead).pos.clone();
  startLook.y += CONFIG.cameraLookLift;
  camera.lookAt(startLook);
  camera.fov = 62;
  camera.updateProjectionMatrix();

  document.getElementById('progressLabel').textContent = state.lap > 1 ? `${state.lap} 周目` : '港へ';
  renderLives();
}


/* ------------------------- 7. HUD ------------------------- */
function renderLives() {
  const box = document.getElementById('livesBox');
  box.innerHTML = '';
  for (let i = 0; i < CONFIG.lives; i++) {
    const span = document.createElement('span');
    span.textContent = i < state.lives ? '❤️' : '🖤';
    box.appendChild(span);
  }
}

function updateHUD() {
  const pct = Math.min(100, (state.distance / state.totalLength) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('lemonCount').textContent = state.lemons;
}


/* ------------------------- 6. 当たり判定 ★あたらしいルールはここに追加 ------------------------- */
const COLLIDE_WINDOW = 1.4;

function checkCollisions() {
  for (const item of state.items) {
    if (item.userData.hit) continue;
    const dd = item.userData.dist - state.distance;
    if (Math.abs(dd) > COLLIDE_WINDOW) continue;
    const dx = item.userData.laneX - state.xOffset;
    if (Math.abs(dx) > (item.userData.halfWidth + 0.4)) continue;

    if (item.userData.kind === 'lemon') {
      item.userData.hit = true;
      createBurst(item.position.clone(), item.userData.bonus ? 0xff5b72 : 0xffe45c, item.userData.bonus ? 28 : 16);
      worldGroup.remove(item);
      state.lemons += item.userData.bonus ? 10 : 1;
      state.pickupFlash = item.userData.bonus ? 0.8 : 0.42;
    } else if (state.invincibleT <= 0) {
      state.lives -= 1;
      state.invincibleT = 1.2;
      state.cameraShakeT = CONFIG.hitShake;
      state.impactFlash = 1;
      state.xVel += dx < 0 ? 6 : -6;
      createBurst(item.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xff5a46, 24);
      renderLives();
      if (state.lives <= 0) {
        endGame(false);
      }
    }
  }
}


/* ------------------------- 8. ゲームループ ------------------------- */
const clock = new THREE.Clock();

function updateWind(dt) {
  const positions = wind.geometry.attributes.position.array;
  for (let i = 0; i < wind.particles.length; i++) {
    const particle = wind.particles[i];
    particle.z += particle.speed * dt;
    particle.x -= state.visualSteer * dt * 2.2;
    if (particle.z > -1) {
      particle.x = (Math.random() - 0.5) * 16;
      particle.y = (Math.random() - 0.5) * 9;
      particle.z = -28 - Math.random() * 8;
    }
    const o = i * 6;
    positions[o] = particle.x;
    positions[o + 1] = particle.y;
    positions[o + 2] = particle.z;
    positions[o + 3] = particle.x - state.visualSteer * 0.24;
    positions[o + 4] = particle.y + 0.02;
    positions[o + 5] = particle.z - particle.length;
  }
  wind.geometry.attributes.position.needsUpdate = true;
  const targetOpacity = state.running ? 0.34 : 0;
  wind.material.opacity += (targetOpacity - wind.material.opacity) * (1 - Math.exp(-dt * 5));
}

function updateSceneryMotion(time, dt) {
  for (const tree of motionActors.trees) {
    tree.rotation.z = Math.sin(time * 1.7 + tree.userData.motionPhase) * 0.025;
    tree.rotation.x = Math.cos(time * 1.25 + tree.userData.motionPhase) * 0.012;
  }
  for (const grass of motionActors.grass) {
    grass.position.y = grass.userData.motionBaseY + Math.sin(time * 1.8 + grass.userData.motionPhase) * 0.035;
    grass.rotation.z = Math.sin(time * 2.2 + grass.userData.motionPhase) * 0.012;
  }
  for (const boat of motionActors.boats) {
    boat.position.y = boat.userData.motionBaseY + Math.sin(time * 1.25 + boat.userData.motionPhase) * 0.16;
    boat.rotation.z = Math.sin(time * 0.9 + boat.userData.motionPhase) * 0.012;
  }
  for (const cloud of motionActors.clouds) {
    cloud.position.x = cloud.userData.motionBaseX + Math.sin(time * 0.08 + cloud.userData.motionPhase) * 2.2;
  }
  for (const sea of motionActors.seas) {
    const map = sea.material.map;
    if (!map) continue;
    map.offset.x = (map.offset.x + dt * 0.006) % 1;
    map.offset.y = (map.offset.y + dt * 0.003) % 1;
  }
}

function updateBursts(dt) {
  for (let b = bursts.length - 1; b >= 0; b--) {
    const burst = bursts[b];
    burst.life -= dt;
    const positions = burst.points.geometry.attributes.position.array;
    for (let i = 0; i < burst.velocities.length; i++) {
      const velocity = burst.velocities[i];
      velocity.y -= 6.5 * dt;
      positions[i * 3] += velocity.x * dt;
      positions[i * 3 + 1] += velocity.y * dt;
      positions[i * 3 + 2] += velocity.z * dt;
    }
    burst.points.geometry.attributes.position.needsUpdate = true;
    burst.points.material.opacity = Math.max(0, burst.life / 0.62);
    if (burst.life <= 0) {
      scene.remove(burst.points);
      burst.points.geometry.dispose();
      burst.points.material.dispose();
      bursts.splice(b, 1);
    }
  }
}

function updateScreenFeedback(dt) {
  state.impactFlash = Math.max(0, state.impactFlash - dt * 3.8);
  state.pickupFlash = Math.max(0, state.pickupFlash - dt * 3.5);
  impactFlash.style.opacity = (state.impactFlash * 0.55).toFixed(3);
  pickupFlash.style.opacity = (state.pickupFlash * 0.48).toFixed(3);
  speedVignette.style.opacity = state.running ? '0.72' : '0';
}

function updateSpritePose(time) {
  if (!player.userData.spriteMode) return;
  const meshes = player.userData.poseMeshes;
  // 入力直後から画像が変わるよう、左右姿勢のしきい値を低くする。
  const activePose = state.visualSteer < -0.12 ? 'left' : state.visualSteer > 0.12 ? 'right' : 'center';
  const bob = state.running ? Math.sin(time * 15) * 0.022 + Math.sin(time * 31) * 0.006 : 0;
  for (const [pose, mesh] of Object.entries(meshes)) {
    const active = pose === activePose;
    mesh.visible = active;
    mesh.material.opacity = active ? 1 : 0;
    mesh.position.y = player.userData.basePlaneY + bob;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  applyPendingRebuilds();

  // 雲などの板は つねにカメラを向ける
  for (const b of billboards) b.quaternion.copy(camera.quaternion);

  // アイテムの浮遊アニメーション
  const time = performance.now() * 0.001;
  const t = time * 3;
  for (const item of state.items) {
    if (item.userData.spin && !item.userData.hit) {
      item.rotation.y += dt * 2;
      item.position.y = item.userData.baseY !== undefined
        ? sampleAt(state.path, item.userData.dist).pos.y + item.userData.baseY + Math.sin(t + item.userData.dist) * 0.06
        : item.position.y;
    }
  }

  updateSceneryMotion(time, dt);
  updateWind(dt);
  updateBursts(dt);
  updateScreenFeedback(dt);

  // 操作そのものより少しだけ遅れて体が倒れこむ。
  const poseBlend = 1 - Math.exp(-dt / CONFIG.poseBlendTime);
  state.visualSteer += (input.steer - state.visualSteer) * poseBlend;

  if (state.running) {
    state.distance += CONFIG.speed * state.speedScale * dt;
    if (state.invincibleT > 0) state.invincibleT -= dt;

    // 60fps以外でも同じ手ざわりになる時間ベースの摩擦。
    state.xVel *= Math.pow(CONFIG.steerFriction, dt * 60);
    state.xVel += input.steer * CONFIG.steerAccel * dt;
    state.xVel = THREE.MathUtils.clamp(state.xVel, -CONFIG.steerMax, CONFIG.steerMax);
    state.xOffset += state.xVel * dt;
    const half = CONFIG.roadWidth / 2 - 0.4;
    const edgeStart = half - CONFIG.edgeSoftZone;
    if (Math.abs(state.xOffset) > edgeStart) {
      const side = Math.sign(state.xOffset);
      const edgeAmount = Math.abs(state.xOffset) - edgeStart;
      state.xVel -= side * edgeAmount * CONFIG.edgeSpring * dt;
      state.xVel *= Math.pow(CONFIG.edgeDamping, dt * 60);
    }
    if (Math.abs(state.xOffset) > half) {
      const side = Math.sign(state.xOffset);
      state.xOffset = side * half;
      state.xVel = -side * Math.min(4, Math.abs(state.xVel) * CONFIG.edgeBounce);
      state.cameraShakeT = Math.max(state.cameraShakeT, 0.08);
    }

    checkCollisions();
    updateHUD();

    if (state.distance >= state.totalLength) {
      endGame(true);
    }
  }

  // プレイヤー配置（むきは ヨー=進行方向 / ピッチ=坂なり / ロール=左右のかたむき）
  const s = sampleAt(state.path, state.distance);
  const p = s.pos.clone().addScaledVector(s.right, state.xOffset);
  player.position.set(p.x, p.y, p.z);
  updateSpritePose(time);
  if (player.userData.spriteMode) {
    // 3姿勢の切り替えに、ごく小さなロールを足して入力との一体感を出す。
    player.quaternion.copy(camera.quaternion);
    player.rotateZ(-state.visualSteer * 0.035 + state.xVel * 0.0025);
  } else {
    player.rotation.order = 'YXZ';
    player.rotation.y = Math.PI - s.heading;
    player.rotation.x = s.pitch;
    player.rotation.z = state.visualSteer * 0.12 + state.xVel * 0.006;
  }
  player.visible = state.invincibleT <= 0 || Math.floor(t * 20) % 2 === 0;

  // 坂の頂上（この先で急に落ちこむ場所）を見つけて、カメラを持ち上げる。
  // 一瞬だけ道の先が消えて、海だけが正面に広がる。
  const aheadGrade = sampleAt(state.path, state.distance + 14).grade;
  const crestTarget = THREE.MathUtils.clamp((aheadGrade - s.grade) * 9, 0, 1);
  state.crest += (crestTarget - state.crest) * (1 - Math.exp(-dt * 4));

  // カメラ追従
  const camS = sampleAt(state.path, state.distance - CONFIG.cameraBack);
  const camPos = camS.pos.clone().addScaledVector(camS.right, state.xOffset * 0.6);
  camPos.y += CONFIG.cameraHeight + state.crest * CONFIG.crestLift;
  const rideShake = state.running && !reduceMotion ? CONFIG.cameraShake : 0;
  if (state.cameraShakeT > 0) state.cameraShakeT = Math.max(0, state.cameraShakeT - dt);
  const hitRatio = CONFIG.hitShake > 0 ? state.cameraShakeT / CONFIG.hitShake : 0;
  const shake = rideShake + hitRatio * 0.28;
  camPos.x += Math.sin(time * 36) * shake;
  camPos.y += Math.sin(time * 47 + 1.3) * shake * 0.55;
  camPos.z += Math.sin(time * 41 + 0.5) * shake * 0.45;
  camera.position.lerp(camPos, 1 - Math.pow(0.001, dt));
  const lookAheadS = sampleAt(state.path, state.distance + CONFIG.cameraLookAhead + state.crest * CONFIG.crestLookAhead);
  const lookAhead = lookAheadS.pos.clone().addScaledVector(lookAheadS.right, state.xOffset * 0.3);
  // 道路より少し水平寄りを見ると、前方へ落ちていく坂の傾斜が伝わる。
  lookAhead.y += CONFIG.cameraLookLift;
  camera.lookAt(lookAhead);
  const curveBank = THREE.MathUtils.clamp((lookAheadS.heading - s.heading) * 2.5, -1, 1);
  const targetBank = -state.visualSteer * CONFIG.cameraBank - curveBank * 0.025;
  state.cameraBank += (targetBank - state.cameraBank) * (1 - Math.exp(-dt * 7));
  camera.rotateZ(state.cameraBank);
  // 急な下りほど画角をひろげ、落ちていく加速感を出す。
  const steepT = THREE.MathUtils.clamp((s.grade - CONFIG.slopeRate) / 0.22, 0, 1);
  const targetFov = 62 + (state.running ? CONFIG.cameraFovBoost + steepT * CONFIG.steepFovBoost : 0);
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-dt * 3.5));
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
}


/* ------------------------- 9. 入力 ------------------------- */
const input = { steer: 0 };
const keys = new Set();

window.addEventListener('keydown', e => {
  if (e.key.startsWith('Arrow')) e.preventDefault();
  keys.add(e.key);
  updateSteerFromKeys();
});
window.addEventListener('keyup', e => {
  keys.delete(e.key);
  updateSteerFromKeys();
});
function updateSteerFromKeys() {
  let s = 0;
  if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) s -= 1;
  if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) s += 1;
  input.steer = s;
  // 押した瞬間に左右画像へ切り替え、離したあとの中央復帰だけを滑らかにする。
  if (s !== 0) state.visualSteer = s;
}

let touchSide = 0;
renderer.domElement.addEventListener('pointerdown', e => {
  renderer.domElement.setPointerCapture(e.pointerId);
  touchSide = e.clientX < innerWidth / 2 ? -1 : 1;
  input.steer = touchSide;
  state.visualSteer = touchSide;
});
renderer.domElement.addEventListener('pointerup', () => { input.steer = 0; });
renderer.domElement.addEventListener('pointercancel', () => { input.steer = 0; });
window.addEventListener('blur', () => {
  keys.clear();
  input.steer = 0;
});


/* ------------------------- 画面遷移 ------------------------- */
function showOverlay(id) {
  for (const el of document.querySelectorAll('.overlay')) el.classList.add('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function endGame(cleared) {
  state.running = false;
  input.steer = 0;
  keys.clear();
  state.bestLemons = Math.max(state.bestLemons, state.lemons);
  if (cleared) {
    document.getElementById('clearLemons').textContent = state.lemons;
    document.getElementById('clearLap').textContent = state.lap;
    document.getElementById('clearBest').textContent = state.bestLemons;
    showOverlay('clearScreen');
  } else {
    document.getElementById('finalLemons').textContent = state.lemons;
    document.getElementById('finalBest').textContent = state.bestLemons;
    showOverlay('gameOverScreen');
  }
}

// 何周でも同じ坂を走る。周をかさねると すこしだけ速くなる。
function runLap(nextLap) {
  state.lap = nextLap;
  state.lemons = 0;
  state.speedScale = 1 + Math.min(0.45, (nextLap - 1) * 0.08);
  startLevel(1);
  state.running = true;
}

document.getElementById('startBtn').addEventListener('click', () => {
  runLap(1);
  document.getElementById('startScreen').classList.add('hidden');
});
document.getElementById('retryBtn').addEventListener('click', () => {
  runLap(state.lap);
  document.getElementById('gameOverScreen').classList.add('hidden');
});
document.getElementById('nextBtn').addEventListener('click', () => {
  runLap(state.lap + 1);
  document.getElementById('clearScreen').classList.add('hidden');
});

// 起動直後は道だけ見せておく
startLevel(1);
state.running = false;
animate();

