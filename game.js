/* =========================================================================
   豊島ダウンヒル - CoderDojo用プロトタイプ
   構成:
   1. settings.js … ★改造する数字（速さ・カメラ・コース）
   2. physics.js  … 入力から速さ・位置を計算する
   3. シーン構築   … 空・海・棚田・道路・ガードレールをつくる
   4. プレイヤー   … スケーターを組み立てて うごかす
   5. 景観配置      … 現地らしい標識・家・畑をならべる
   6. 走行演出      … ★改造ポイント3（動きの演出はここに追加）
   7. HUD         … 港までの進み具合を表示
   8. ゲームループ … 毎フレームの更新と描画
   9. 入力        … キーボード・タッチ操作
   ========================================================================= */


/* ------------------------- 1. CONFIG ★かえてみよう ------------------------- */
// 改造用の CONFIG / COURSE は settings.js にまとめています。

// 大カーブの位置をコースから割り出す（標識やポールの配置に使う）
function findBigCurves(course) {
  const found = [];
  let d = 0;
  for (const seg of course) {
    if (seg.bigCurve || Math.abs(seg.curve) >= 60) {
      found.push({ start: d, end: d + seg.length, dir: Math.sign(seg.curve) || 1, photoCurve: !!seg.photoCurve });
    }
    d += seg.length;
  }
  return found;
}
let bigCurves = [];

// 写真の大カーブは、背の高い景色を置かず道路と海の輪郭を見せる特別区間。
function isPhotoCurveVista(distance, before = 115, after = 70) {
  const curve = bigCurves.find(item => item.photoCurve);
  return !!curve && distance >= curve.start - before && distance <= curve.end + after;
}


/* ------------------------- three.js 基本セットアップ ------------------------- */
const wrap = document.getElementById('canvasWrap');
const scene = new THREE.Scene();

/* ------------------------- 画像（assets）のよみこみ -------------------------
   画像がなくても動く。ある場合だけ、単色のかわりに絵を貼る                */
const loader = new THREE.TextureLoader();
const TEX = {};
// よみこみ中の画像の枚数。ぜんぶそろうまでスタートを待たせる。
// 走っている最中に画像がとどくと、世界を組みなおすことになるため。
let texPending = 0;
let onAllTexturesReady = null;
function texArrived() {
  texPending = Math.max(0, texPending - 1);
  if (texPending === 0 && onAllTexturesReady) onAllTexturesReady();
}
function loadTex(key, file, repeat, fallbackFile) {
  texPending++;
  loader.load(
    'assets/' + file,
    tex => {
      // 坂を浅い角度から見ると草地が線状に潰れるため、斜め方向の縮小表示を補正する。
      if (renderer?.capabilities) {
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
      if (repeat) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat[0], repeat[1]);
      }
      TEX[key] = tex;
      if (typeof onTextureReady === 'function') onTextureReady(key, tex);
      texArrived();
    },
    undefined,
    () => {
      // 新しい幻想素材が見つからない場合も、元の素材でゲームを続ける。
      // 代わりのよみこみを始めた「あと」で数を減らす（とちゅうで0にしないため）。
      if (fallbackFile) loadTex(key, fallbackFile, repeat);
      texArrived();
    }
  );
}

// 空: 画像がよみこめるまでは グラデーションを出しておく
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1288ec');
  grad.addColorStop(0.55, '#61c6ff');
  grad.addColorStop(1, '#ddf7ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 512);
  return new THREE.CanvasTexture(c);
}
scene.background = makeSkyTexture();
// 空のグラデーションと霧を同じ水色へ寄せ、水平線の境界をなじませる。
scene.fog = new THREE.Fog(0xd2eef7, 520, 3600);

// 近すぎる描画面（0.1）は遠い海岸の奥行き精度を浪費する。
// 手前2ユニットには景色を置かず、海と岸の前後判定を安定させる。
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 2, 4000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
wrap.appendChild(renderer.domElement);
scene.add(camera);

const speedVignette = document.getElementById('speedVignette');
const impactFlash = document.getElementById('impactFlash');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x58b04c, 0.62));
const sun = new THREE.DirectionalLight(0xfff8df, 0.52);
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

// 海の時間はゲームと共有する。一時停止時も波の位相が飛ばない。
const oceanTime = { value: 0 };
function shadeOcean(material) {
  material.onBeforeCompile = shader => {
    shader.uniforms.oceanTime = oceanTime;
    shader.vertexShader = 'varying vec3 oceanWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      oceanWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    `);
    shader.fragmentShader = 'varying vec3 oceanWorld;\nuniform float oceanTime;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      vec2 water = oceanWorld.xz;
      float w1 = dot(water, vec2(0.18, 0.11)) + oceanTime * 0.65;
      float w2 = dot(water, vec2(-0.09, 0.24)) - oceanTime * 0.48;
      float rippleFade = 1.0 - smoothstep(60.0, 600.0, distance(cameraPosition, oceanWorld));
      vec3 normalWater = normalize(vec3((-0.025*cos(w1)-0.012*cos(w2))*rippleFade, 1.0,
        (-0.015*cos(w1)+0.028*cos(w2))*rippleFade));
      vec3 viewWater = normalize(cameraPosition - oceanWorld);
      float fresnelWater = pow(1.0 - max(dot(normalWater, viewWater), 0.0), 4.0);
      vec3 sunWater = normalize(vec3(-0.35, 0.48, -0.6));
      float glint = pow(max(dot(normalWater, normalize(viewWater + sunWater)), 0.0), 96.0);
      float broadLight = 0.99 + (0.005*sin(w1) + 0.005*sin(w2))*rippleFade;
      // 絵の模様を少し残した穏やかな水色。遠くほど水平線の色へなじませる。
      float textureStrength = mix(0.42, 0.18, smoothstep(350.0, 2300.0, distance(cameraPosition, oceanWorld)));
      vec3 seaBase = mix(vec3(0.12,0.53,0.63), diffuseColor.rgb, textureStrength) * broadLight;
      diffuseColor.rgb = mix(seaBase, vec3(0.57,0.77,0.81), fresnelWater * 0.48);
      // 遠くの細かいハイライトは弱め、走行中のちらつきを抑える。
      float detailFade = 1.0 - smoothstep(180.0, 1100.0, distance(cameraPosition, oceanWorld));
      diffuseColor.rgb += vec3(0.85,0.88,0.73) * glint * 0.35 * detailFade;
    `);
  };
  material.customProgramCacheKey = () => 'setouchi-water-light-v3';
}

// 人物画像から独立した接地影。カメラへ向けず、実際の道路勾配に沿わせる。
const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 2.45),
  new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { strength: { value: 0.28 } },
    vertexShader: `varying vec2 shadowUv; void main(){ shadowUv=uv;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 shadowUv; uniform float strength;
      void main(){ float radius=length((shadowUv-0.5)*2.0);
      float alpha=(1.0-smoothstep(0.0,1.0,radius))*strength;
      gl_FragColor=vec4(0.035,0.055,0.065,alpha); }`
  }));
contactShadow.renderOrder = 1;
scene.add(contactShadow);


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
  const easedTurn = new Array(steps.length);
  for (let i = 0; i < steps.length; i++) {
    let sum = 0, turnSum = 0;
    for (let k = -window; k <= window; k++) {
      const step = steps[THREE.MathUtils.clamp(i + k, 0, steps.length - 1)];
      sum += step.base;
      turnSum += step.dHeading;
    }
    eased[i] = sum / (window * 2 + 1);
    easedTurn[i] = turnSum / (window * 2 + 1);
  }

  // 実際に道をすすめながら、位置と坂のきつさを記録する
  let heading = 0, x = 0, z = 0, y = 0, travelled = 0;
  const points = [{ x, y, z, heading, grade: eased[0], courseGrade: eased[0] }];
  for (let i = 0; i < steps.length; i++) {
    const slopePhase = (travelled % CONFIG.slopeWaveLength) / CONFIG.slopeWaveLength;
    const fullGrade = eased[i] + CONFIG.slopeWave * Math.pow(Math.sin(Math.PI * slopePhase), 2);
    const rampT = THREE.MathUtils.smoothstep(Math.min(1, travelled / CONFIG.slopeRampLength), 0, 1);
    let grade = THREE.MathUtils.lerp(CONFIG.startSlopeRate, fullGrade, rampT);
    const remaining = Math.max(0, courseLength - travelled);
    const finishT = THREE.MathUtils.smoothstep(Math.min(1, remaining / CONFIG.finishFlattenLength), 0, 1);
    grade = THREE.MathUtils.lerp(CONFIG.finishSlopeRate, grade, finishT);
    // COURSE に書いた勾配だけを取り出したもの（うねりを足す前）。
    // 「頂上で道が消える」演出は、うねりではなく COURSE の変わり目で出したい。
    let courseGrade = THREE.MathUtils.lerp(CONFIG.startSlopeRate, eased[i], rampT);
    courseGrade = THREE.MathUtils.lerp(CONFIG.finishSlopeRate, courseGrade, finishT);
    heading += easedTurn[i];
    x += Math.sin(heading) * DL;
    z -= Math.cos(heading) * DL;
    y -= grade * DL;
    travelled += DL;
    points.push({ x, y, z, heading, grade, courseGrade });
  }
  return points;
}

function sampleAt(path, dist) {
  // カメラの足元にも道を敷く。競技の開始位置は0のまま、負の距離は見える道路だけ。
  if (dist < 0) {
    const sample = sampleAt(path, 0);
    sample.pos.addScaledVector(sample.forward, dist);
    sample.pos.y -= sample.grade * dist;
    return sample;
  }
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
  const courseGrade = THREE.MathUtils.lerp(p0.courseGrade, p1.courseGrade, t);
  const right = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
  const forward = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
  return { pos: new THREE.Vector3(x, y, z), right, forward, heading, grade, courseGrade, pitch: Math.atan(grade) };
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
    if (renderer?.capabilities) {
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    t.wrapS = t.wrapT = material.userData.seamlessRepeat
      ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  material.map = t;
  // 地表などは画像の色を少し落ち着かせたいので、素材ごとの色味を残せるようにする。
  material.color.setHex(material.userData.textureTint || 0xffffff);
  material.needsUpdate = true;
}
function onTextureReady(key, tex) {
  if (key === 'sky') return; // 空はグラデーションで描く。
  for (const { material, repeat } of (TEX_TARGETS[key] || [])) applyTex(tex, material, repeat);

  // 板ポリで作りなおしたい素材は、あとから組み立てなおす
  if (key.startsWith('skater')) {
    pendingRebuild.player = true;
  } else {
    pendingRebuild[key] = true;
  }
}

// 画像がとどいたら組み立てなおす（ゲームループの中から安全に呼ぶ）
const pendingRebuild = {};
function applyPendingRebuilds() {
  if (state.running) return;
  if (pendingRebuild.player && TEX.skater) {
    pendingRebuild.player = false;
    if (player) {
      scene.remove(player);
      player.traverse(object => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        object.material.dispose();
      });
    }
    player = buildPlayer();
  }
  const sceneryKeys = [
    'shop', 'cloud', 'ground', 'fantasyGrass', 'fantasyGrassB', 'fantasyGrassC',
    'fantasyTreeA', 'fantasyTreeB', 'fantasyTerrace', 'fantasyBranch',
    'fantasyHedge',
    'fantasyGrove', 'fantasySlope', 'harborMirror', 'harborSeawall',
    'harborCars', 'harborShelter', 'harborParking', 'villageHouseA',
    'villageHouseB', 'meadowBankA', 'meadowBankB',
    'wildflowerVerge', 'stoneSteps', 'camphorTree', 'oliveGrove', 'gardenCottage', 'fishingShed',
  ];
  if (sceneryKeys.some(key => pendingRebuild[key])) {
    // よみこみ中は何度も組みなおさない。ぜんぶ届いてから1回にまとめる。
    if (texPending > 0 && !state.running) return;
    for (const key of sceneryKeys) pendingRebuild[key] = false;
    if (state.path) rebuildLevel();
  }
}

// 空のドーム（画像がよみこめたら表示される）
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(1800, 32, 16),
  new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 skyDirection;
      void main() { skyDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 skyDirection;
      void main() {
        vec3 direction = normalize(skyDirection);
        float height = pow(max(direction.y,0.0),0.55);
        vec3 color = mix(vec3(0.84,0.95,0.99),vec3(0.07,0.52,0.92),height);
        float sun = pow(max(dot(direction,normalize(vec3(-0.55,0.48,-0.7))),0.0),240.0);
        float glow = pow(max(dot(direction,normalize(vec3(-0.55,0.48,-0.7))),0.0),12.0);
        color += vec3(0.22,0.20,0.12)*glow + vec3(0.38,0.34,0.22)*sun;
        gl_FragColor = vec4(color,1.0);
      }`
  })
);
skyDome.visible = true;
scene.add(skyDome);

// 空はコードで描くので、空画像のダウンロードは不要。
loadTex('sea', 'sea_surface_setouchi_v3.webp', undefined, 'sea_surface_fantasy_v2.jpg');
loadTex('road', 'road_asphalt_teshima.jpg', undefined, 'road_stone_tile.jpg');
loadTex('wall', 'stone_wall_tile.jpg');
loadTex('ground', 'meadow_ground_v3.jpg', undefined, 'meadow_ground_v2.jpg');
loadTex('shop', 'shop_front.jpg');
loadTex('cloud', 'cloud_cumulus.webp');
loadTex('fantasyGrass', 'grass_fantasy.webp');
loadTex('fantasyGrassB', 'grass_fantasy_b.webp');
loadTex('fantasyGrassC', 'grass_fantasy_c.webp');
loadTex('fantasyTreeA', 'tree_fantasy_a.webp');
loadTex('fantasyTreeB', 'tree_fantasy_b.webp');
loadTex('fantasyTerrace', 'terrace_fantasy.webp');
loadTex('fantasyBranch', 'branch_fantasy.webp');
loadTex('fantasyHedge', 'hedge_fantasy.webp');
loadTex('fantasyGrove', 'grove_fantasy.webp');
loadTex('fantasySlope', 'slope_fantasy.webp');
loadTex('harborMirror', 'harbor_mirror.webp');
loadTex('harborSeawall', 'harbor_seawall.webp');
loadTex('harborCars', 'harbor_cars.webp');
loadTex('harborShelter', 'harbor_shelter.webp');
loadTex('harborParking', 'harbor_parking_tile.jpg');
loadTex('villageHouseA', 'village_house_b.webp');
loadTex('villageHouseB', 'village_house_c.webp');
loadTex('meadowBankA', 'meadow_bank_a.webp');
loadTex('meadowBankB', 'meadow_bank_b.webp');
loadTex('skater', 'skater_back.webp');
loadTex('wildflowerVerge', 'wildflower_verge_0828.webp');
loadTex('stoneSteps', 'stone_steps_0828.webp');
loadTex('camphorTree', 'camphor_tree_0828.webp');
loadTex('oliveGrove', 'olive_grove_0828.webp');
loadTex('gardenCottage', 'garden_cottage_0828.webp');
loadTex('fishingShed', 'fishing_shed_0828.webp');
loadTex('skaterBalanceA', 'skater_balance_a_alpha_0828.webp');

function buildRibbon(path, offsetLeft, offsetRight, material, yLift = 0, uvRepeat = 0) {
  const verts = [];
  const uvs = [];
  for (let i = -Math.ceil(32 / DL); i < path.length - 1; i++) {
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

// 隣接する帯は同じ境界座標から同じ高さを求める。帯ごとの位相差で穴を作らない。
function terrainRipple(d, offset) {
  const shoulder = CONFIG.roadWidth / 2 + (offset < 0 ? 7 : 5.2);
  const weight = THREE.MathUtils.smoothstep(Math.abs(offset) - shoulder, 0, 36);
  return weight * (Math.sin(d * 0.023 + offset * 0.035) * 0.55
    + Math.sin(d * 0.059 - offset * 0.018) * 0.18);
}

// 最初の右カーブは左が海側。外へ行くほど地面を下げ、遠景の海を大きく開く。
function seaVistaDrop(d, offset) {
  if (offset >= 0) return 0;
  const length = COURSE.reduce((sum, segment) => sum + segment.length, 0);
  const coastal = 1 - THREE.MathUtils.smoothstep(d, length - 320, length - 180);
  const lateral = THREE.MathUtils.smoothstep(Math.abs(offset), CONFIG.roadWidth / 2 + 1.2, CONFIG.roadWidth / 2 + 58);
  return -CONFIG.coastDrop * coastal * lateral;
}

// 港の手前は道が大きく曲がるため、カメラを向く板状の草木を置くと
// 海の上へ回り込んで見える。残り約250〜400mは視界を開けておく。
function isHarborVistaClear(distance, totalLength) {
  const remaining = totalLength - distance;
  return remaining >= 250 && remaining <= 400;
}

// 葉先のアルファは残し、画像矩形の端と根元だけをフェードさせる。
function softenSceneryEdges(material) {
  material.alphaTest = 0.025;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
      #ifdef USE_MAP
        float edgeX = min(vUv.x, 1.0 - vUv.x);
        float border = smoothstep(0.0, 0.035, edgeX)
          * smoothstep(0.0, 0.045, vUv.y)
          * smoothstep(0.0, 0.018, 1.0 - vUv.y);
        diffuseColor.a *= border;
      #endif
      #include <alphatest_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'scenery-soft-border-v1';
  return material;
}

// 横方向にも高さを変える帯。道路脇の土手を水平な板ではなく斜面にする。
// wave を true にすると、外側のふちだけ うねる。
// taper は「外がわのふちを どれだけ立ち上げるか」を距離から返す関数（0〜1）。
// 港では山を寝かせて海を見せたいので、そこだけ 0 に近づける。
function buildSlopedRibbon(path, offsetLeft, offsetRight, material, yLeft, yRight, uvRepeat = 0, wave = 0, taper = null) {
  const verts = [];
  const uvs = [];
  for (let i = -Math.ceil(32 / DL); i < path.length - 1; i++) {
    const a = sampleAt(path, i * DL);
    const b = sampleAt(path, (i + 1) * DL);
    const da = i * DL, db = (i + 1) * DL;
    const tA = taper ? taper(da) : 1;
    const tB = taper ? taper(db) : 1;
    // 港では高さだけを寝かせる。幅まで縮めると帯が尖り、海との切れ目になる。
    const offA = offsetLeft;
    const offB = offsetLeft;
    const yOutA = THREE.MathUtils.lerp(yRight, yLeft, tA);
    const yOutB = THREE.MathUtils.lerp(yRight, yLeft, tB);
    // うねりは「道から遠いほう」のふちにだけ足す
    const waveOuterA = terrainRipple(da, offA);
    const waveOuterB = terrainRipple(db, offB);
    const aL = a.pos.clone().addScaledVector(a.right, offA); aL.y += yOutA + waveOuterA + seaVistaDrop(da, offA);
    const aR = a.pos.clone().addScaledVector(a.right, offsetRight); aR.y += yRight + terrainRipple(da, offsetRight) + seaVistaDrop(da, offsetRight);
    const bL = b.pos.clone().addScaledVector(b.right, offB); bL.y += yOutB + waveOuterB + seaVistaDrop(db, offB);
    const bR = b.pos.clone().addScaledVector(b.right, offsetRight); bR.y += yRight + terrainRipple(db, offsetRight) + seaVistaDrop(db, offsetRight);
    /* 左側の帯は外側offsetが小さく、右側の帯は外側offsetが大きい。
       同じ頂点順で作ると右側だけ裏面になり、上から見たとき農地が消えて
       奥の海が透ける。左右どちらでも法線が空へ向く順に三角形を並べる。 */
    const outerIsLeft = offA <= offsetRight && offB <= offsetRight;
    const v0 = uvRepeat ? (i * DL) / uvRepeat : 0;
    const v1 = uvRepeat ? ((i + 1) * DL) / uvRepeat : 0;
    if (outerIsLeft) {
      verts.push(aL.x, aL.y, aL.z, aR.x, aR.y, aR.z, bL.x, bL.y, bL.z);
      verts.push(bL.x, bL.y, bL.z, aR.x, aR.y, aR.z, bR.x, bR.y, bR.z);
      if (uvRepeat) uvs.push(0,v0, 1,v0, 0,v1, 0,v1, 1,v0, 1,v1);
    } else {
      verts.push(aR.x, aR.y, aR.z, aL.x, aL.y, aL.z, bR.x, bR.y, bR.z);
      verts.push(bR.x, bR.y, bR.z, aL.x, aL.y, aL.z, bL.x, bL.y, bL.z);
      if (uvRepeat) uvs.push(1,v0, 0,v0, 1,v1, 1,v1, 0,v0, 0,v1);
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
  for (let i = -Math.ceil(32 / DL); i < path.length - 1; i++) {
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
    const mat = softenSceneryEdges(new THREE.MeshBasicMaterial({ map: TEX.cloud, transparent: true, opacity: 0.82, depthWrite: false, fog: false }));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, tall ? 2.4 : 1.6), mat);
    // 同じ絵の使いまわしなので、半分は左右反転して並びの繰り返しを目立たなくする
    if (rng() < 0.5) plane.scale.x = -1;
    g.add(plane);
    g.userData.billboard = true;
    g.userData.sky = true;   // 空にうかぶ板だけは、カメラのかたむきごと向く
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
  softenSceneryEdges(mat);
  plane.position.y = y;
  plane.userData.billboard = true;
  return plane;
}

function makeTree(rng) {
  if (TEX.camphorTree && rng() < 0.4) return makePaintedProp(TEX.camphorTree, 11.4);
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
  if (TEX.wildflowerVerge && rng() < 0.42) return makePaintedProp(TEX.wildflowerVerge, 4.2);
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

function makeVillagePicture(textures, rng, width = 10.8, height = 8.0) {
  const available = textures.filter(Boolean);
  if (!available.length) return null;
  const texture = available[Math.floor(rng() * available.length)];
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.06,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  softenSceneryEdges(mat);
  plane.position.y = height * 0.46;
  g.add(plane);
  // 生成画像自体が3/4視点なので、カメラへ向けても正面一枚絵には見えない。
  g.userData.billboard = true;
  g.scale.setScalar(0.82 + rng() * 0.34);
  return g;
}

function makeShop(rng) {
  const depthHouse = makeVillagePicture([TEX.villageHouseA, TEX.villageHouseB, TEX.gardenCottage], rng, 11.8, 8.5);
  if (depthHouse) return depthHouse;
  // 新しい家が読めない場合だけ、従来の商店画像へ戻す。
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
  const pictureHouse = makeVillagePicture([TEX.villageHouseA, TEX.villageHouseB, TEX.gardenCottage], rng, 9.6, 7.2);
  if (pictureHouse) return pictureHouse;
  // 画像がない環境では、従来の軽量3D家へフォールバックする。
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
    sharedMat('houseRoof', () => new THREE.MeshLambertMaterial({ color: 0x4a4038 }))
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

// 絵の縦横比を守り、足元を原点にする。大きな板を斜めに倒して地面へ埋めない。
function makePaintedProp(texture, width) {
  const height = width * texture.image.height / texture.image.width;
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, alphaTest: 0.12, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(sharedGeo(`painted-${width}-${height}`, () => new THREE.PlaneGeometry(width, height)), material);
  softenSceneryEdges(material);
  mesh.position.y = height * 0.45;
  group.add(mesh);
  group.userData.billboard = true;
  group.userData.fadeMaterial = material;
  return group;
}

// 同じ木の壁を並べず、集落・木陰・港で違う絵に出会えるようにする。
function buildPaintedLandmarks(path, totalLength) {
  const rng = mulberry32(8282026);
  const half = CONFIG.roadWidth / 2;
  function place(texture, width, d, side, offset, lift = 0, moves = false) {
    if (!texture || d < 0 || d > totalLength || isPhotoCurveVista(d)
      || isHarborVistaClear(d, totalLength) || (side < 0 && d < totalLength - 260)) return;
    const s = sampleAt(path, d);
    const prop = makePaintedProp(texture, width);
    const scale = 0.9 + rng() * 0.16;
    // 板がカメラへ向いても道路へはみ出さないだけの余白を残す。
    const safeOffset = Math.max(offset, half + width * scale / 2 + 1.8);
    prop.position.copy(s.pos).addScaledVector(s.right, side * safeOffset);
    prop.position.y += lift;
    prop.scale.setScalar(scale);
    prop.userData.courseDistance = d;
    worldGroup.add(prop);
    billboards.push(prop);
    if (moves) rememberMotion(prop, 'grass', rng() * Math.PI * 2);
  }
  for (let d = 24, i = 0; d < totalLength - 100; d += 56 + rng() * 18, i++) {
    place(TEX.wildflowerVerge, 3.8, d, i % 2 ? 1 : -1, 9.1, 0.05, true);
  }
  for (let d = 108; d < totalLength - 180; d += 156) {
    place(TEX.stoneSteps, 8.2, d, 1, 13.8, 0.65);
  }
  for (const d of [188, 264, 392, 658, 756, 910, 1066, 1208]) {
    place(TEX.oliveGrove, 13, d, 1, 24, 1.8, true);
    place(TEX.oliveGrove, 10.5, d + 22, -1, 21, 1.0, true);
  }
  for (const d of [226, 318, 688, 782, 1100]) {
    place(TEX.camphorTree, 15, d, -1, 17.5, 0.55, true);
    place(TEX.camphorTree, 13, d + 34, 1, 23, 1.8, true);
  }
  for (const [d, side] of [[46, -1], [458, 1], [totalLength - 236, 1], [totalLength - 184, -1]]) {
    place(TEX.gardenCottage, 11, d, side, 17, 0.85);
    place(TEX.stoneSteps, 6.5, d - 9, side, 13, 0.45);
  }
  for (const [distance, side, offset] of [[125, 1, 21], [72, -1, 26], [22, 1, 30]]) {
    place(TEX.fishingShed, 10, totalLength - distance, side, offset, 0.2);
  }
}

// ゴール後の視線と舗装用。競技コース長は伸ばさず、見える道だけ終点の先へ続ける。
function sampleHarborAt(path, distance) {
  const length = (path.length - 1) * DL;
  const sample = sampleAt(path, distance);
  if (distance > length) {
    const extra = distance - length;
    const easing = Math.exp(-extra / 20);
    sample.pos.addScaledVector(sample.forward, extra);
    // 最後の勾配のまま150m延ばすと舗装が海面へ沈むので、20mで水平へなじませる。
    sample.pos.y -= sample.grade * 20 * (1 - easing);
    sample.grade *= easing;
    sample.pitch = Math.atan(sample.grade);
  }
  return sample;
}

function buildScenery(path, totalLength) {
  const roadHalf = CONFIG.roadWidth / 2;
  const rng = mulberry32(2026);
  const end = sampleAt(path, totalLength);
  const seaY = end.pos.y - 1.45;                                  // 防波壁の向こうの海面
  const coast = end.pos.clone().addScaledVector(end.forward, 520); // 海面は駐車場より十分先

  // 現地の県道に合わせた、濃い青灰色のアスファルト。
  const roadMat = useTex('road', new THREE.MeshStandardMaterial({ color: 0x596166,
    roughness: 0.94, metalness: 0 }), [2.4, totalLength / 11]);
  worldGroup.add(buildRibbon(path, -roadHalf, roadHalf, roadMat, 0, totalLength));

  // 現地の白い外側線と、中央の短い破線。
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e4 });
  worldGroup.add(buildRibbon(path, -roadHalf + 0.22, -roadHalf + 0.34, lineMat, 0.035));
  worldGroup.add(buildRibbon(path, roadHalf - 0.34, roadHalf - 0.22, lineMat, 0.035));
  const dashGeo = new THREE.BoxGeometry(0.13, 0.025, 3.4);
  for (let d = -25; d < totalLength; d += 11) {
    const s = sampleAt(path, d);
    const dash = new THREE.Mesh(dashGeo, lineMat);
    dash.position.copy(s.pos);
    dash.position.y += 0.04;
    dash.rotation.order = 'YXZ';
    dash.rotation.y = -s.heading;
    dash.rotation.x = -s.pitch;
    worldGroup.add(dash);
  }

  // 添付写真で目立つ白い減速用シェブロンを、海へ正対する直線から右大カーブへ並べる。
  const chevronGeo = new THREE.BoxGeometry(2.35, 0.026, 0.22);
  const photoCurve = bigCurves.find(curve => curve.photoCurve);
  if (photoCurve) {
    for (let d = photoCurve.start - 88; d < photoCurve.start + 68; d += 13) {
      const s = sampleAt(path, d);
      const mark = new THREE.Group();
      for (const side of [-1, 1]) {
        const bar = new THREE.Mesh(chevronGeo, lineMat);
        bar.position.x = side * 0.95;
        bar.rotation.y = side * 0.48;
        mark.add(bar);
      }
      // 写真と同じく、右へ曲がる道路の左車線側へ寄せる。
      mark.position.copy(s.pos).addScaledVector(s.right, -1.45);
      mark.position.y += 0.045;
      mark.rotation.order = 'YXZ';
      mark.rotation.y = -s.heading;
      mark.rotation.x = -s.pitch;
      worldGroup.add(mark);
    }
  }

  // 草地を共通の世界座標で描く。帯の境界で模様・色・縮尺をリセットしない。
  const tile = CONFIG.groundTileSize;
  const grassNearMat = new THREE.MeshLambertMaterial({ color: 0xc0cbaa });
  grassNearMat.userData.textureTint = 0xc0cbaa;
  grassNearMat.userData.seamlessRepeat = true;
  useTex('ground', grassNearMat, [1, 1]);
  grassNearMat.onBeforeCompile = shader => {
    shader.uniforms.groundTileSize = { value: tile };
    shader.vertexShader = 'varying vec2 landscapeXZ;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      landscapeXZ = (modelMatrix * vec4(position, 1.0)).xz;
    `);
    shader.fragmentShader = 'varying vec2 landscapeXZ;\nuniform float groundTileSize;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec2 terrainUV = landscapeXZ / groundTileSize;
        // 違う角度・大きさの模様を混ぜてタイルの周期を目立たなくする。
        vec4 groundA = mapTexelToLinear(texture2D(map, terrainUV));
        vec2 rotatedUV = mat2(0.8, -0.6, 0.6, 0.8) * terrainUV * 0.61 + vec2(0.37, 0.71);
        vec4 groundB = mapTexelToLinear(texture2D(map, rotatedUV));
        float patches = 0.5 + 0.5 * sin(landscapeXZ.x * 0.029 + sin(landscapeXZ.y * 0.017));
        vec3 soil = mix(groundA.rgb, groundB.rgb, 0.30 + 0.25 * patches);
        float lightPatch = sin(landscapeXZ.x * 0.041 + landscapeXZ.y * 0.019)
          * sin(landscapeXZ.y * 0.033 - landscapeXZ.x * 0.012);
        diffuseColor.rgb *= soil * (0.96 + lightPatch * 0.055);
      #endif
    `);
  };
  grassNearMat.customProgramCacheKey = () => 'continuous-landscape-v1';
  const grassMidMat = grassNearMat;
  const grassFarMat = grassNearMat;
  worldGroup.add(buildSlopedRibbon(path, -roadHalf - 7, -roadHalf, grassNearMat, -0.06, -0.06, totalLength));
  worldGroup.add(buildSlopedRibbon(path, -roadHalf - 24, -roadHalf - 7, grassMidMat, 2.0, -0.06, totalLength, 0.55));
  worldGroup.add(buildSlopedRibbon(path, -roadHalf - 58, -roadHalf - 24, grassFarMat, 4.1, 2.0, totalLength, 1.0));
  // 右の草地を擁壁までつなぎ、間から低い海面がのぞく隙間を完全にふさぐ。
  worldGroup.add(buildRibbon(path, roadHalf, roadHalf + 5.2, grassNearMat, -0.06, totalLength));

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
    for (let d = -30; d < totalLength; d += 6.5) {
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
  // 海側は斜面の高さを連続させ、浮いた石垣を置かない。
  worldGroup.add(buildWall(path, roadHalf + 5.2, 1.15, stoneMatR, -0.05, totalLength));
  worldGroup.add(buildSlopedRibbon(path, roadHalf + 17, roadHalf + 5.2, grassMidMat, 2.3, 1.02, totalLength, 0.6));
  worldGroup.add(buildSlopedRibbon(path, roadHalf + 45, roadHalf + 17, grassFarMat, 4.8, 2.3, totalLength, 1.15));
  /* 右カーブの「内がわ」では、曲がりの半径より外に点を置くと帯が八の字に裏返る。
     このコースの右カーブは いちばんきつい所で半径 137 しかないので、
     その地点で安全に出せる右側の距離を返す関数をつくっておく。            */
  const rightRoom = d => {
    const h0 = sampleAt(path, Math.max(0, d - 20)).heading;
    const h1 = sampleAt(path, Math.min(totalLength, d + 20)).heading;
    const turn = h1 - h0;              // 右カーブでプラス
    if (turn < 0.002) return 1e6;      // まっすぐ・左カーブなら制限なし
    return (40 / turn) * 0.55;         // 曲がりの半径の 55% までにとどめる
  };

  // 右手は島の内陸。ここで帯を切ると その先がぜんぶ海になり、
  // 「海にうかぶ細長い土手」を走っているように見えてしまう。山の裾までつなぐ。
  // 港では海を主役にしたいので最後の 260 ユニットで寝かせ、
  // 右カーブでは裏返らない範囲まで自動で引っこめる。
  /* 幅を場所ごとに変えると、せまくなった先端がクサビになって海の上に突き出る。
     そこで「どこでも折れない幅」に固定する。
     いちばんきつい右カーブの半径が 137 なので、その半分あたりの 70 までにする。
     高さを変えるだけの taper（港で寝かせる）なら、先端はできない。          */
  const inlandInner = roadHalf + 45;
  const inlandOuter = roadHalf + 70;
  const inlandTaper = d => THREE.MathUtils.smoothstep(Math.min(1, (totalLength - d) / 260), 0, 1);
  worldGroup.add(buildSlopedRibbon(path, inlandOuter, inlandInner, grassFarMat, 14, 4.8, totalLength, 2.4, inlandTaper));

  // 電柱と電線を右側にとおす。日本の田舎道らしさは これが効く。
  let prevPole = null;
  for (let d = 22; d < totalLength - 40; d += CONFIG.poleSpacing) {
    if (isPhotoCurveVista(d, 70, 40)) {
      prevPole = null;
      continue;
    }
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

    if (curve.photoCurve) {
      // 写真のカーブだけは太い銀色の上桟を左右へ連続させ、遠くからでも曲線を読めるようにする。
      const railGeo = new THREE.BoxGeometry(0.24, 0.2, DL + 0.45);
      const railMatHero = new THREE.MeshLambertMaterial({ color: 0xdce5e8, emissive: 0x1a262a });
      const dummy = new THREE.Object3D();
      for (const side of [-1, 1]) {
        const samples = [];
        for (let d = curve.start - 24; d < curve.end + 22; d += DL) samples.push(sampleAt(path, d));
        const rail = new THREE.InstancedMesh(railGeo, railMatHero, samples.length);
        samples.forEach((s, i) => {
          dummy.position.copy(s.pos).addScaledVector(s.right, side * (roadHalf + 0.38));
          dummy.position.y += 0.84;
          dummy.rotation.order = 'YXZ';
          dummy.rotation.y = -s.heading;
          dummy.rotation.x = -s.pitch;
          dummy.rotation.z = 0;
          dummy.updateMatrix();
          rail.setMatrixAt(i, dummy.matrix);
        });
        rail.instanceMatrix.needsUpdate = true;
        worldGroup.add(rail);
      }

      // 外側の右折標識を繰り返し、曲がる方向を一目で伝える。
      for (const d of [curve.start + 54, curve.start + 118]) {
        const s = sampleAt(path, d);
        const sign = makeCurveSign(curve.dir);
        const p = s.pos.clone().addScaledVector(s.right, outer * (roadHalf + 1.45));
        sign.position.copy(p);
        sign.rotation.y = -s.heading;
        sign.scale.setScalar(1.16);
        worldGroup.add(sign);
      }
    }
  }

  // 木（右の段の上にランダムに）
  for (let d = 12; d < totalLength; d += 16 + rng() * 14) {
    if (isPhotoCurveVista(d) || isHarborVistaClear(d, totalLength)) continue;
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
      if (isPhotoCurveVista(d, 85, 45) || isHarborVistaClear(d, totalLength)) continue;
      const s = sampleAt(path, d);
      for (const side of [-1, 1]) {
        if (side < 0 && d < totalLength - 260) continue;
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
    // near（道からの距離）は かならず width の半分より大きくする。
    // 近すぎる大きな板は、カーブでカメラの正面へ回りこんで視界をふさぐ。
    { texture: TEX.meadowBankA, width: 17, height: 6.4, step: 27, near: 15.5, lift: 0.58 },
    { texture: TEX.meadowBankB, width: 15, height: 5.4, step: 39, near: 19.0, lift: 0.94 },
    { texture: TEX.fantasyHedge, width: 16, height: 5.3, step: 25, near: 13.2, lift: 0.55 },
    { texture: TEX.fantasySlope, width: 21, height: 7.2, step: 76, near: 16.5, lift: 1.2 },
    { texture: TEX.fantasyGrove, width: 25, height: 11.4, step: 54, near: 28, lift: 2.25 },
  ];
  for (const layer of layeredScenery) {
    if (!layer.texture) continue;
    for (let d = 105 + rng() * 20; d < totalLength - 95; d += layer.step + rng() * layer.step * 0.35) {
      if (isPhotoCurveVista(d) || isHarborVistaClear(d, totalLength)) continue;
      const s = sampleAt(path, d);
      for (const side of [-1, 1]) {
        if (side < 0 && d < totalLength - 260) continue;
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

  buildPaintedLandmarks(path, totalLength);

  // スタート付近右側の支店建物と駐車場。
  if (!isPhotoCurveVista(58)) {
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
  }

  // 木造のお店は、集落のなかに1〜2軒だけ置いて主役にしない。
  for (let d = 300; d < totalLength - 120; d += 340 + rng() * 120) {
    if (isPhotoCurveVista(d)) continue;
    const s = sampleAt(path, d);
    const shop = makeShop(rng);
    const p = s.pos.clone().addScaledVector(s.right, roadHalf + 7.5);
    shop.position.set(p.x, p.y + 1.15, p.z);
    if (shop.userData.billboard) billboards.push(shop);
    else shop.rotation.y = -s.heading - Math.PI / 2;
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
      if (d < 8 || d > totalLength - 40 || isPhotoCurveVista(d)) continue;
      const s = sampleAt(path, d);
      const house = makeHouse(rng);
      // 道からの距離をばらつかせ、奥行きのある集落にする
      const offset = village.side * (roadHalf + 8 + rng() * 22);
      const p = s.pos.clone().addScaledVector(s.right, offset);
      const lift = village.side > 0 ? 1.2 : -0.4;
      house.position.set(p.x, p.y + lift, p.z);
      // 家の向きは道と平行を基本に、すこしだけ ばらけさせる
      if (house.userData.billboard) billboards.push(house);
      else house.rotation.y = -s.heading + (rng() - 0.5) * 0.6;
      worldGroup.add(house);
    }
  }

  // 現地写真と同じく、畑は道路右側の斜面へ段々に並べる。
  if (TEX.fantasyTerrace) {
    for (let d = 34; d < totalLength * 0.72; d += 44 + rng() * 18) {
      if (isPhotoCurveVista(d)) continue;
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
      if (isPhotoCurveVista(d)) continue;
      const s = sampleAt(path, d);
      const box = new THREE.Mesh(terraceGeo, terraceMat);
      const p = s.pos.clone().addScaledVector(s.right, roadHalf + 11);
      box.position.set(p.x, p.y + 0.1, p.z);
      box.rotation.y = -s.heading;
      worldGroup.add(box);
    }
  }

  // ゴールから150m先まで舗装を続ける。海の直前で止まるのではなく、大きな港の中で止まる。
  const apronStart = totalLength - 80;
  const apronEnd = totalLength + CONFIG.harborRunout;
  const parkingMat = useTex('harborParking', new THREE.MeshLambertMaterial({ color: 0xffffff }), [8, 12]);
  const runoutMat = useTex('road', new THREE.MeshLambertMaterial({ color: 0xffffff }), [3.4, 22]);
  function apronStrip(widthAt, from, to, material, lift) {
    const positions = [], uvs = [];
    for (let d = from; d < to; d += DL) {
      const next = Math.min(to, d + DL);
      const a = sampleHarborAt(path, d), b = sampleHarborAt(path, next);
      const al = a.pos.clone().addScaledVector(a.right, -widthAt(d) / 2);
      const ar = a.pos.clone().addScaledVector(a.right, widthAt(d) / 2);
      const bl = b.pos.clone().addScaledVector(b.right, -widthAt(next) / 2);
      const br = b.pos.clone().addScaledVector(b.right, widthAt(next) / 2);
      for (const p of [al, ar, bl, bl, ar, br]) positions.push(p.x, p.y + lift, p.z);
      const v0 = (d - from) / (to - from), v1 = (next - from) / (to - from);
      uvs.push(0,v0, 1,v0, 0,v1, 0,v1, 1,v0, 1,v1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    worldGroup.add(new THREE.Mesh(geometry, material));
  }
  apronStrip(() => CONFIG.harborWidth, apronStart, apronEnd, parkingMat, -0.07);
  // 既存道路の上に同じ面を重ねず、終点から先だけを延長する（ちらつき防止）。
  apronStrip(d => THREE.MathUtils.lerp(CONFIG.roadWidth, 20,
    THREE.MathUtils.smoothstep(d - totalLength, 0, 45)),
    totalLength, apronEnd - 16, runoutMat, 0);

  const parkingLineMat = new THREE.MeshBasicMaterial({ color: 0xf7f5e8 });
  function parkingMark(width, length, distance, offset, material = parkingLineMat, lift = 0.035) {
    const s = sampleHarborAt(path, distance);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(width, 0.018, length), material);
    mark.position.copy(s.pos).addScaledVector(s.right, offset);
    mark.position.y += lift;
    mark.rotation.order = 'YXZ';
    mark.rotation.y = -s.heading;
    mark.rotation.x = -s.pitch;
    worldGroup.add(mark);
  }
  for (const side of [-1, 1]) {
    for (let d = totalLength - 48; d < apronEnd - 28; d += 12) {
      for (const off of [23, 43, 63]) parkingMark(0.12, 9, d, side * off, parkingLineMat, -0.03);
    }
    parkingMark(0.14, 110, totalLength + 65, side * 10.5);
  }
  parkingMark(13, 0.75, totalLength - 5.5, 0);
  const blueFinish = new THREE.MeshBasicMaterial({ color: 0x247ea9 });
  for (let x = -6; x <= 6; x += 1.2) {
    parkingMark(0.6, 0.78, totalLength - 5.5, x, blueFinish, 0.058);
  }
  // 岸壁のすぐ手前にも縁石を置き、広い舗装と海の境界を明確にする。
  parkingMark(CONFIG.harborWidth, 0.55, apronEnd, 0,
    new THREE.MeshLambertMaterial({color:0xd2d4c5}), 0.23);

  function addHarborSprite(texture, width, height, distance, sideOffset, lift = 0) {
    if (!texture) return;
    const s = sampleHarborAt(path, distance);
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
  addHarborSprite(TEX.harborCars, 13, 5.2, totalLength + 26, 28, 0.1);
  addHarborSprite(TEX.harborCars, 13, 5.2, totalLength + 68, -40, 0.1);
  addHarborSprite(TEX.fishingShed, 11, 7.34, totalLength + 38, -28, 0.05);
  addHarborSprite(TEX.harborShelter, 14.5, 8.5, totalLength + 95, 43, 0.05);
  addHarborSprite(TEX.oliveGrove, 15, 10, totalLength + 72, 61, 0.2);
  if (TEX.harborSeawall) {
    // 岸壁のふちに合わせて置く。奥へ離すと、板の下に海がのぞいて宙に浮く。
    // 高さは目の高さ（3.45）より低くすること。高いと ゴールで海がぜんぶ隠れて、
    // せっかくの港とフェリーが1つも見えなくなる。
    const wall = makeSceneryPlane(TEX.harborSeawall, CONFIG.harborWidth, 7.2, 2.6);
    const wallP = sampleHarborAt(path, totalLength + CONFIG.harborRunout).pos;
    wall.position.x += wallP.x;
    wall.position.y += wallP.y - 1.5;
    wall.position.z += wallP.z;
    // 防波壁は「岸にそった構造物」なので、カメラを向かせてはいけない。
    // 向かせると 58 ユニットの板がどこを見ても正面に立ちはだかり、フェリーを隠す。
    wall.rotation.y = -end.heading;
    worldGroup.add(wall);
  }

  // 海は道路より低い水平面。出発地点と港の両方を覆う広さにする。
  const seaGroup = new THREE.Group();
  seaGroup.position.copy(end.pos);
  seaGroup.rotation.y = -end.heading;
  // 海の画像も折り返して連続させ、タイルの端の色差が直線として出るのを防ぐ。
  const seaMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  seaMaterial.userData.seamlessRepeat = true;
  shadeOcean(seaMaterial);
  const deepSea = new THREE.Mesh(
    new THREE.PlaneGeometry(16000, 16000),
    useTex('sea', seaMaterial, [22, 22])
  );
  deepSea.rotation.x = -Math.PI / 2;
  // 遠端をカメラの描画距離より先へ送り、海の板が山形に見える境界をなくす。
  deepSea.position.set(0, seaY - end.pos.y, 0);
  seaGroup.add(deepSea);
  deepSea.name = 'ocean-surface';
  motionActors.seas.push(deepSea);
  // 海面を2枚重ねると遠景でZ-fighting（ちらつき）が起きるため、
  // 色の変化は模様入りテクスチャ1枚だけで表現する。
  worldGroup.add(seaGroup);

  // 港のフェリーと小舟は防波壁より沖に配置する。
  // ゴールの主役。小さく遠いと点にしか見えないので、大きくして近くへ寄せる。
  const ferry = makeFerry();
  ferry.scale.setScalar(2.8);
  const ferryP = end.pos.clone().addScaledVector(end.forward, CONFIG.harborRunout + 70).addScaledVector(end.right, -34);
  ferry.position.set(ferryP.x, seaY + 0.4, ferryP.z);
  ferry.rotation.y = -end.heading + 0.3;
  worldGroup.add(ferry);
  rememberMotion(ferry, 'boats', 0.4);
  for (let i = 0; i < 3; i++) {
    const boat = makeBoat();
    const boatP = end.pos.clone().addScaledVector(end.forward, CONFIG.harborRunout + 90 + rng() * 170).addScaledVector(end.right, (rng() - 0.5) * 170);
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
  // 山をひとつずつ離して置くと「海にうかぶサメのひれ」に見えてしまう。
  // 半径を となり同士の間隔より大きくして重ね、ひとつづきの稜線にする。
  const ridgeTints = [0x8fb6c6, 0xa6c8d4, 0xbad7de];
  for (let layer = 0; layer < CONFIG.ridgeLayers; layer++) {
    const ahead = 1250 + layer * 420;
    const scale = 1 + layer * 0.45;
    const gap = 150 * scale;
    // 霧の色を焼きこんだ単色。fog を切らないと遠すぎて消えてしまう。
    const ridgeMat = new THREE.MeshBasicMaterial({ color: ridgeTints[layer] || 0xbad7de, fog: false });
    for (let i = -7; i <= 7; i++) {
      const r = gap * 1.15 + rng() * gap * 0.5;
      // 高さは半径の2割ほど。とがらせるほど「対岸の島」ではなく「岩」に見える。
      const peak = new THREE.Mesh(new THREE.ConeGeometry(r, r * (0.17 + rng() * 0.09), 6), ridgeMat);
      const rp = end.pos.clone()
        .addScaledVector(end.forward, ahead + (rng() - 0.5) * 160)
        .addScaledVector(end.right, i * gap + (rng() - 0.5) * 45);
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
  // MeshLambertMaterial は flatShading を持たない（警告が出るだけで効かない）ので Phong を使う。
  // 山は霧（260ユニットから）より手前に立つので、霧では ぼかせない。
  // かわりに 奥の列ほど空の色をまぜた緑にして、自前で かすませる。
  const mountainMats = [
    new THREE.MeshPhongMaterial({ color: 0x5f8d55, flatShading: true, shininess: 2 }),
    new THREE.MeshPhongMaterial({ color: 0x86a882, flatShading: true, shininess: 2 }),
  ];
  // 港の手前 300 ユニットには置かない（内陸の斜面を寝かせて海を見せる区間）
  for (let d = 60; d < totalLength - 300; d += 110) {
    const s = sampleAt(path, d);
    const room = rightRoom(d);
    for (let k = 0; k < 2; k++) {
      const r = 62 + rng() * 46;
      // とがらせるほど「山」ではなく「三角の板」に見える。低くて丸い稜線にする。
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, r * (0.32 + rng() * 0.16), 7), mountainMats[k]);
      // 内陸の斜面の外がわに置き、その裾から山が続いて見えるようにする
      const offset = roadHalf + 78 + r * 0.45 + k * 46 + rng() * 22;
      // 曲がりの内がわへ はみ出す山と、内陸の斜面が寝ている所の山は置かない
      // （どちらも「海の上に山が浮いている」ように見えてしまう）
      if (offset > room || inlandTaper(d) < 0.75) continue;
      const hp = s.pos.clone().addScaledVector(s.right, offset);
      // ふもとは内陸の斜面（高さ14）のうしろに隠し、いただきだけを出す。
      // 持ち上げすぎると海の上に浮き、沈めすぎると まったく見えなくなる。
      hill.position.set(hp.x, s.pos.y + 2 + k * 6, hp.z);
      worldGroup.add(hill);
    }
  }

  // 雲（コースぞいの空にちらばせる）
  for (let i = 0; i < 6; i++) {
    const s = sampleAt(path, rng() * totalLength);
    const cloud = makeCloudCluster(rng);
    const side = rng() < 0.5 ? -1 : 1;
    // 近すぎる雲は、ただの白い四角に見える。遠くへ置いて そのぶん大きくする。
    const p = s.pos.clone().addScaledVector(s.right, side * (280 + rng() * 360));
    // 坂の標高と一緒に雲まで下げない。海面上の白い塊に見えない高さへ固定する。
    cloud.position.set(p.x, s.pos.y + 180 + rng() * 90, p.z);
    cloud.scale.setScalar(24 + rng() * 24);
    worldGroup.add(cloud);
    if (cloud.userData.billboard) billboards.push(cloud);
    rememberMotion(cloud, 'clouds', rng() * Math.PI * 2);
  }

  // 出発地点から見える大きな夏雲。遠くに置き、道路の視界を空ける。
  for (const [x,z,y,size] of [[-520,-1120,240,135],[580,-1450,310,170],[-1150,-1800,340,190]]) {
    const cloud = makeCloudCluster(rng, true);
    cloud.position.set(x,y,z); cloud.scale.setScalar(size);
    worldGroup.add(cloud);
    if (cloud.userData.billboard) billboards.push(cloud);
    rememberMotion(cloud,'clouds',rng()*6.28);
  }

  // ゴールの先にそびえる入道雲
  const bigCloud = makeCloudCluster(rng, true);
  const bp = coast.clone().addScaledVector(end.forward, 460);
  bigCloud.position.set(bp.x, end.pos.y + 240, bp.z);
  bigCloud.scale.setScalar(48);
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
// 近景は立体モデルで奥行きを作る。岩と低木は一括描画し、画像の板を増やさない。
// 海面から盛り上がる島。輪を重ねた地形なので、円すいの尖りを作らない。
function buildPanoramaIslands(path, length) {
  const seaY = sampleAt(path, length).pos.y - 1.45;
  const rng = mulberry32(9132026);
  const islands = [
    [-310, -440, 120, 72, 42], [-570, -680, 200, 108, 85],
    [35, -940, 235, 110, 100], [-780, -1160, 285, 145, 125],
    [360, -1450, 320, 170, 120], [-310, -1780, 390, 200, 140],
    [-1270, -1900, 430, 200, 150], [810, -2050, 400, 220, 160],
  ];
  for (let n = 0; n < islands.length; n++) {
    const [x,z,rx,rz,height] = islands[n];
    const vertices = [], colors = [], indices = [];
    const rings = 14, slices = 64;
    const tint = new THREE.Color(n < 3 ? 0x4c8e85 : n < 6 ? 0x81b3ba : 0xa7cad0);
    const phase = rng() * 6.28;
    // 陸の端を海面より上に置き、その外周から海中へ垂直な裾を伸ばす。
    // 広く平たい三角形を海面と交差させないので、波打ち際が点滅しない。
    for (let r = 0; r <= rings + 1; r++) {
      const radius = Math.min(r, rings) / rings;
      const underwater = r > rings;
      for (let j = 0; j <= slices; j++) {
        const a = j / slices * Math.PI * 2;
        const shore = 1 + 0.10*Math.sin(a*3+phase) + 0.06*Math.cos(a*5-phase);
        const u = Math.cos(a)*radius, v = Math.sin(a)*radius;
        const peakA = Math.exp(-((u+0.28)**2*7+(v-0.03)**2*4));
        const peakB = Math.exp(-((u-0.30)**2*10+(v+0.08)**2*7));
        const h = (peakA*0.66+peakB*0.8) * (1-Math.pow(radius,6)) * height;
        vertices.push(x+Math.cos(a)*rx*radius*shore, seaY + (underwater ? -6 : 0.8 + h), z+Math.sin(a)*rz*radius*shore);
        const c = tint.clone().multiplyScalar(0.88+0.16*h/height);
        if (r >= rings) c.setHex(underwater ? 0x728f85 : 0xc7cfaf);
        colors.push(c.r,c.g,c.b);
        if (r <= rings && j < slices) {
          const i = r*(slices+1)+j;
          indices.push(i,i+1,i+slices+1, i+1,i+slices+2,i+slices+1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setIndex(indices); geo.computeVertexNormals();
    const island = new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));
    island.name = `panorama-island-${n}`;
    island.userData.seaLevel = seaY;
    worldGroup.add(island);
  }
}

function buildCoastalModels(path, length) {
  const rng = mulberry32(9112026);
  const stoneSpots = [], leafSpots = [];
  for (let d = 18; d < length - 110; d += 13) {
    for (const side of [-1, 1]) {
      const s = sampleAt(path, d + rng() * 5);
      const p = s.pos.clone().addScaledVector(s.right, side * (CONFIG.roadWidth / 2 + 1.6 + rng() * 1.5));
      p.y -= 0.06;
      stoneSpots.push({ p, scale: 0.22 + rng() * 0.35, heading: rng() * Math.PI });
      // 海が開くカーブでは草丈を低くする。
      const height = isPhotoCurveVista(d) ? 0.12 : 0.24 + rng() * 0.22;
      for (let j = 0; j < 3; j++) {
        const q = p.clone();
        q.x += (rng() - 0.5) * 0.8;
        q.z += (rng() - 0.5) * 0.8;
        leafSpots.push({p:q, height, width:0.25+rng()*0.3});
      }
    }
  }
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),stoneSpots.length);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.95}),leafSpots.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  stoneSpots.forEach((spot,i)=>{
    dummy.position.copy(spot.p); dummy.position.y += spot.scale * 0.26;
    dummy.scale.set(spot.scale,spot.scale*0.48,spot.scale*0.8);
    dummy.rotation.set(0.1,spot.heading,0.12); dummy.updateMatrix();
    stones.setMatrixAt(i,dummy.matrix);
    color.setHSL(0.12,0.08+rng()*0.06,0.34+rng()*0.15); stones.setColorAt(i,color);
  });
  leafSpots.forEach((spot,i)=>{
    dummy.position.copy(spot.p); dummy.position.y += spot.height*0.45;
    dummy.scale.set(spot.width,spot.height,spot.width*0.8);
    dummy.rotation.set(0,rng()*Math.PI,0); dummy.updateMatrix();
    leaves.setMatrixAt(i,dummy.matrix);
    color.setHSL(0.22+rng()*0.06,0.28+rng()*0.12,0.22+rng()*0.12); leaves.setColorAt(i,color);
  });
  stones.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
  worldGroup.add(stones,leaves);
}

function buildPlayer() {
  // ★画像を消したり重ねたりせず、1枚の人物を連続的に曲げる。
  // 半透明の姿勢画像を重ねると、切替途中で体が薄くなって点滅して見える。
  if (TEX.skater) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      map: TEX.skaterBalanceA || TEX.skater,
      transparent: true,
      opacity: 1,
      alphaTest: 0.001,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(1.9, 2.85, 12, 20);
    const rider = new THREE.Mesh(geometry, mat);
    rider.userData.restPositions = geometry.attributes.position.array.slice();
    rider.position.y = 1.35;
    rider.renderOrder = 4;
    rider.frustumCulled = false; // 変形後の肩も表示範囲の端で欠けないようにする。
    g.add(rider);
    g.userData.spriteMode = true;
    g.userData.riderMesh = rider;
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
  // 一枚絵なので、道の向きに固定するとカーブで斜めから見て うすくなる。
  // カメラのほうを向かせつつ、坂のかたむき（roadPitch）だけは残す。
  g.userData.billboard = true;
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
  const [minGap, maxGap] = CONFIG.obstacleSpacing;
  while (d < totalLength - 90) {
    // レモンを生成せず、同じ候補地点の一部にだけ障害物を置く。
    if (rng() < CONFIG.obstacleDensity) {
      const lane = Math.floor(rng() * 3) - 1;
      const build = OBSTACLE_BUILDERS[Math.floor(rng() * OBSTACLE_BUILDERS.length)];
      const group = build();
      group.userData.kind = 'obstacle';
      const s = sampleAt(path, d);
      const p = s.pos.clone().addScaledVector(s.right, lane * CONFIG.laneSpacing);
      group.position.set(p.x, p.y, p.z);
      group.rotation.order = 'YXZ';
      group.rotation.y = Math.PI - s.heading;
      group.rotation.x = s.pitch;
      group.userData.dist = d;
      group.userData.laneX = lane * CONFIG.laneSpacing;
      if (group.userData.billboard) {
        group.userData.roadPitch = s.pitch;
        billboards.push(group);
      }
      worldGroup.add(group);
      items.push(group);
    }
    d += minGap + rng() * (maxGap - minGap);
  }
  return items;
}


/* ------------------------- ゲーム状態 ------------------------- */
const state = {
  level: 1,
  distance: 0,
  totalLength: 0,
  lives: CONFIG.lives,
  xOffset: 0,
  xVel: 0,
  smoothInput: 0,
  currentSpeed: 0,
  visualSteer: 0,
  balanceClock: 0,
  cameraBank: 0,
  cameraShakeT: 0,
  crest: 0,
  lap: 1,
  speedScale: 1,
  impactFlash: 0,
  invincibleT: 0,
  running: false,
  paused: false,
  path: null,
  items: [],
};

let player = buildPlayer();
const cameraAim = new THREE.Vector3();

/* 世界づくり（重い・0.2秒ちかくかかる）と、走行状態のもどし（軽い）を分ける。
   同じ坂を何周でも走るので、2周目からは世界を作りなおさなくてよい。       */
let worldBuilt = false;

function buildWorld() {
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
  buildCoastalModels(state.path, state.totalLength);
  buildPanoramaIslands(state.path, state.totalLength);
  // 障害物を置かず、海へ落ちる坂と大きな右カーブの動きを主役にする。
  state.items = [];
  worldBuilt = true;
}

function resetRun() {
  state.level = 1;
  state.distance = 0;
  state.xOffset = 0;
  state.xVel = 0;
  state.smoothInput = 0;
  state.currentSpeed = 0;
  resetInput();
  state.visualSteer = 0;
  state.balanceClock = 0;
  state.cameraBank = 0;
  state.cameraShakeT = 0;
  state.crest = 0;
  state.impactFlash = 0;
  state.lives = CONFIG.lives;
  state.invincibleT = 0;
  state.paused = false;

  // リトライ時に前のゴール地点から長く補間しないよう、カメラも即座に戻す。
  const start = sampleAt(state.path, 0);
  const startCam = start.pos.clone().addScaledVector(start.forward, -CONFIG.cameraBack);
  startCam.y += CONFIG.cameraHeight + start.grade * CONFIG.cameraBack;
  camera.position.copy(startCam);
  const startLook = sampleAt(state.path, CONFIG.cameraLookAhead).pos.clone();
  startLook.y += CONFIG.cameraLookLift;
  cameraAim.copy(startLook);
  camera.lookAt(cameraAim);
  camera.fov = 62;
  camera.updateProjectionMatrix();
  skyDome.position.copy(camera.position);

  document.getElementById('progressLabel').textContent = state.lap > 1 ? `${state.lap} 周目` : '港へ';
  renderLives();
  updateHUD();
}

function startLevel(level) {
  buildWorld();
  resetRun();
}

/* 画像がとどいたあと、世界を組みなおす。
   走っている最中に呼ばれることがあるので、乗り手とカメラの状態は
   ひとつ残らず持ちこすこと。ひとつでも取りこぼすと、走行中に
   スタート地点へワープしたように見える。                              */
function rebuildLevel() {
  const keep = {
    distance: state.distance, lives: state.lives, running: state.running, paused: state.paused,
    xOffset: state.xOffset, xVel: state.xVel, visualSteer: state.visualSteer,
    cameraBank: state.cameraBank, crest: state.crest, invincibleT: state.invincibleT,
    impactFlash: state.impactFlash, cameraShakeT: state.cameraShakeT,
    lap: state.lap, speedScale: state.speedScale,
  };
  const camPos = camera.position.clone();
  const camQuat = camera.quaternion.clone();
  const camFov = camera.fov;

  buildWorld();
  Object.assign(state, keep);

  camera.position.copy(camPos);
  camera.quaternion.copy(camQuat);
  camera.fov = camFov;
  camera.updateProjectionMatrix();
  skyDome.position.copy(camera.position);
  renderLives();
  updateHUD();
}


/* ------------------------- 7. HUD ------------------------- */
function renderLives() {
  const box = document.getElementById('livesBox');
  if (!box) return;
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
  document.getElementById('speedValue').textContent = Math.round(state.currentSpeed);
  document.getElementById('distanceValue').textContent = Math.max(0, Math.round(state.totalLength - state.distance));
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

    if (state.invincibleT <= 0) {
      state.lives -= 1;
      state.invincibleT = 1.2;
      state.cameraShakeT = CONFIG.hitShake;
      state.impactFlash = 1;
      state.xVel += dx < 0 ? 6 : -6;
      createBurst(item.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xff5a46, 24);
      playThud();
      renderLives();
      if (state.lives <= 0) {
        endGame(false);
      }
    }
  }
}


/* ------------------------- 音（ファイルなしで その場で合成） -------------------------
   風・車輪・衝突・ゴールの4つだけ。画像とちがい 音は Web Audio でつくれるので、
   よみこみを1バイトも増やさずに鳴らせる。
   スマホは「最初のタップより前」に音を出せない決まりなので、
   スタートボタンから startSound() で目をさまさせる。                              */
const sound = { ctx: null, on: true, master: null, windGain: null, windFilter: null, rollGain: null };
try { sound.on = localStorage.getItem('teshima-sound') !== '0'; } catch (e) { /* 使えなくても平気 */ }

function makeNoiseBuffer(ctx, seconds = 2) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    // まっさらな雑音より、低い音を強めにしたほうが「風」に聞こえる
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

function startSound() {
  if (sound.ctx) {
    if (sound.ctx.state === 'suspended') sound.ctx.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  sound.ctx = ctx;
  const noise = makeNoiseBuffer(ctx);

  sound.master = ctx.createGain();
  sound.master.gain.value = sound.on ? 0.9 : 0;
  sound.master.connect(ctx.destination);

  // 風＝帯域をしぼった雑音。速さで音の高さと大きさを変える。
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = noise;
  windSrc.loop = true;
  sound.windFilter = ctx.createBiquadFilter();
  sound.windFilter.type = 'bandpass';
  sound.windFilter.frequency.value = 620;
  sound.windFilter.Q.value = 0.7;
  sound.windGain = ctx.createGain();
  sound.windGain.gain.value = 0;
  windSrc.connect(sound.windFilter).connect(sound.windGain).connect(sound.master);
  windSrc.start();

  // 車輪＝低いところだけ残した雑音。アスファルトのゴロゴロ。
  const rollSrc = ctx.createBufferSource();
  rollSrc.buffer = noise;
  rollSrc.loop = true;
  const rollFilter = ctx.createBiquadFilter();
  rollFilter.type = 'lowpass';
  rollFilter.frequency.value = 250;
  sound.rollGain = ctx.createGain();
  sound.rollGain.gain.value = 0;
  rollSrc.connect(rollFilter).connect(sound.rollGain).connect(sound.master);
  rollSrc.start();
}

function updateSound(s) {
  if (!sound.ctx || !sound.windGain) return;
  const t = sound.ctx.currentTime;
  // 坂がきついほど速く感じるので、勾配も音に混ぜる
  const speedT = state.running && !state.paused ? THREE.MathUtils.clamp(0.45 + s.grade * 1.1, 0, 1.2) : 0;
  sound.windGain.gain.setTargetAtTime(0.17 * speedT, t, 0.25);
  sound.windFilter.frequency.setTargetAtTime(540 + 520 * speedT, t, 0.3);
  sound.rollGain.gain.setTargetAtTime(0.3 * speedT, t, 0.2);
}

function playThud() {
  if (!sound.ctx) return;
  const ctx = sound.ctx, t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(46, t + 0.22);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(g).connect(sound.master);
  osc.start(t);
  osc.stop(t + 0.32);
}

function playChime() {
  if (!sound.ctx) return;
  const ctx = sound.ctx, t0 = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    const g = ctx.createGain();
    const t = t0 + i * 0.11;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(g).connect(sound.master);
    osc.start(t);
    osc.stop(t + 0.6);
  });
}

function setSoundOn(on) {
  sound.on = on;
  if (sound.ctx && sound.master) sound.master.gain.setTargetAtTime(on ? 0.9 : 0, sound.ctx.currentTime, 0.05);
  const btn = document.getElementById('soundBtn');
  if (btn) {
    btn.textContent = on ? '🔊' : '🔇';
    btn.setAttribute('aria-label', on ? '音を消す' : '音を出す');
  }
  try { localStorage.setItem('teshima-sound', on ? '1' : '0'); } catch (e) { /* 使えなくても平気 */ }
}


/* ------------------------- 8. ゲームループ ------------------------- */
const clock = new THREE.Clock();
let animationTime = 0;

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
  // 海面画像は世界に固定する。時間による光の変化だけを shadeOcean で描く。
  // 画像全体を流すと、岸まで滑って動くように見えてしまう。

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
  impactFlash.style.opacity = (state.impactFlash * 0.55).toFixed(3);
  speedVignette.style.opacity = state.running ? '0.72' : '0';
}

function updateSpritePose(time, dt) {
  if (!player.userData.spriteMode) return;
  const mesh = player.userData.riderMesh;
  if (state.running) state.balanceClock += dt;
  const phase = state.balanceClock * Math.PI * 2 / CONFIG.balancePeriod;
  const steer = THREE.MathUtils.clamp(state.visualSteer, -1, 1);
  const sway = reduceMotion ? 0 : Math.sin(phase) * CONFIG.balanceSway * (1 - Math.abs(steer) * 0.75);
  const breath = reduceMotion ? 0 : Math.sin(phase * 2) * 0.007;
  const positions = mesh.geometry.attributes.position;
  const rest = mesh.userData.restPositions;
  for (let i = 0; i < positions.count; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
    const height = (y + 1.425) / 2.85;
    // 下の18%（車輪・足元）は固定。腰から肩へ徐々に重心を移す。
    const upper = THREE.MathUtils.smoothstep(height, 0.18, 1);
    const lean = steer * CONFIG.riderLean + sway;
    positions.setXYZ(i,
      x + lean * upper,
      y + (breath - Math.abs(steer) * 0.035) * upper,
      z + Math.abs(steer) * 0.035 * upper);
  }
  positions.needsUpdate = true;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const activeDt = state.paused ? 0 : dt;
  animationTime += activeDt;

  applyPendingRebuilds();

  // 板はカメラのほうを向く。ただし地面に立っているものは たてのまま向きだけ変える。
  // カメラのかたむきまで真似ると、下り坂で板がのけぞり、足もとが地面から浮いて見える。
  for (const b of billboards) {
    if (b.userData.courseDistance !== undefined) {
      const ahead = b.userData.courseDistance - state.distance;
      b.visible = ahead > -65 && ahead < CONFIG.sceneryViewDistance;
      if (!b.visible) continue;
      const fadeIn = 1 - THREE.MathUtils.smoothstep(ahead, CONFIG.sceneryViewDistance - 100, CONFIG.sceneryViewDistance);
      const fadeOut = THREE.MathUtils.smoothstep(ahead, -65, -35);
      b.userData.fadeMaterial.opacity = fadeIn * fadeOut;
    }
    if (b.userData.sky) {
      b.quaternion.copy(camera.quaternion);
    } else {
      b.rotation.order = 'YXZ';
      b.rotation.y = Math.atan2(camera.position.x - b.position.x, camera.position.z - b.position.z);
      // 路上の車などは、坂のかたむきに乗せたままカメラを向かせる
      b.rotation.x = b.userData.roadPitch || 0;
      b.rotation.z = 0;
    }
  }

  const time = animationTime;
  oceanTime.value = time;

  if (!reduceMotion) updateSceneryMotion(time, activeDt);
  updateWind(activeDt);
  updateBursts(activeDt);
  updateScreenFeedback(activeDt);

  // 操作そのものより少しだけ遅れて体が倒れこむ。
  const poseBlend = 1 - Math.exp(-activeDt / CONFIG.poseBlendTime);
  state.visualSteer += (state.smoothInput - state.visualSteer) * poseBlend;

  if (state.running && !state.paused) {
    // 1秒を最大120回に分け、30 / 60 / 120fpsでも同じ操作感にする。
    RidePhysics.advance(state, input, CONFIG, activeDt);
    if (state.invincibleT > 0) state.invincibleT -= activeDt;

    updateHUD();

    if (state.distance >= state.totalLength) {
      endGame(true);
    }
  }

  // プレイヤー配置（むきは ヨー=進行方向 / ピッチ=坂なり / ロール=左右のかたむき）
  const s = sampleAt(state.path, state.distance);
  const p = s.pos.clone().addScaledVector(s.right, state.xOffset);
  player.position.set(p.x, p.y, p.z);
  contactShadow.position.copy(p);
  contactShadow.position.y += 0.075;
  contactShadow.rotation.order = 'YXZ';
  contactShadow.rotation.y = -s.heading;
  contactShadow.rotation.x = -Math.PI / 2 - s.pitch;
  contactShadow.material.uniforms.strength.value = state.running ? 0.28 : 0.22;
  updateSpritePose(time, activeDt);
  if (player.userData.spriteMode) {
    // 1枚の人物の傾きに、ごく小さなロールを足して操作と連動させる。
    player.quaternion.copy(camera.quaternion);
    player.rotateZ(-state.visualSteer * 0.035 + state.xVel * 0.0025);
  } else {
    player.rotation.order = 'YXZ';
    player.rotation.y = Math.PI - s.heading;
    player.rotation.x = s.pitch;
    player.rotation.z = state.visualSteer * 0.12 + state.xVel * 0.006;
  }
  player.visible = state.invincibleT <= 0 || Math.floor(time * 20) % 2 === 0;

  // 坂の頂上（この先で急に落ちこむ場所）を見つけて、カメラを持ち上げる。
  // 一瞬だけ道の先が消えて、海だけが正面に広がる。
  // うねり（slopeWave）ではなく COURSE に書いた勾配の変わり目で出す。
  // うねりで判定すると 230 ユニットごとに中途半端に発火して、意味が伝わらない。
  const aheadCourse = sampleAt(state.path, state.distance + 40).courseGrade;
  const crestTarget = THREE.MathUtils.clamp((aheadCourse - s.courseGrade) * 9, 0, 1);
  state.crest += (crestTarget - state.crest) * (1 - Math.exp(-activeDt * 4));

  // カメラ追従
  const arrival = THREE.MathUtils.smoothstep(state.distance, state.totalLength - 65, state.totalLength);
  const heroCurve = bigCurves.find(curve => curve.photoCurve);
  const previewIn = heroCurve
    ? THREE.MathUtils.smoothstep(state.distance, Math.max(0, heroCurve.start - 140), heroCurve.start - 30)
    : 0;
  const previewOut = heroCurve
    ? THREE.MathUtils.smoothstep(state.distance, heroCurve.end - 10, heroCurve.end + 65)
    : 1;
  const curvePreview = previewIn * (1 - previewOut);
  const cameraBack = THREE.MathUtils.lerp(CONFIG.cameraBack, 9, arrival);
  const cameraDistance = state.distance - cameraBack + state.currentSpeed * CONFIG.cameraResponse;
  const camS = sampleAt(state.path, cameraDistance);
  const camPos = camS.pos.clone().addScaledVector(camS.right, state.xOffset * 0.45);
  camPos.y += THREE.MathUtils.lerp(CONFIG.cameraHeight, 4.2, arrival)
    + state.crest * CONFIG.crestLift + curvePreview * 0.4;
  const rideShake = state.running && !reduceMotion ? CONFIG.cameraShake : 0;
  if (state.cameraShakeT > 0) state.cameraShakeT = Math.max(0, state.cameraShakeT - activeDt);
  const hitRatio = CONFIG.hitShake > 0 ? state.cameraShakeT / CONFIG.hitShake : 0;
  const shake = reduceMotion ? 0 : rideShake + hitRatio * 0.12;
  camPos.x += Math.sin(time * 36) * shake;
  camPos.y += Math.sin(time * 47 + 1.3) * shake * 0.55;
  camPos.z += Math.sin(time * 41 + 0.5) * shake * 0.45;
  camera.position.lerp(camPos, 1 - Math.exp(-activeDt / CONFIG.cameraResponse));
  const lookAheadS = sampleHarborAt(state.path, state.distance + state.currentSpeed * CONFIG.cameraResponse + CONFIG.cameraLookAhead
    + state.crest * CONFIG.crestLookAhead + curvePreview * 10);
  const lookAhead = lookAheadS.pos.clone().addScaledVector(lookAheadS.right, state.xOffset * 0.3);
  // 道路より少し水平寄りを見ると、前方へ落ちていく坂の傾斜が伝わる。
  // 縦画面（スマホ）は そのままだと画面の6割が路面になるので、さらに上を見る。
  const portraitLift = camera.aspect < 1
    ? THREE.MathUtils.lerp(1, 1.75, THREE.MathUtils.clamp((1 - camera.aspect) / 0.45, 0, 1))
    : 1;
  lookAhead.y += THREE.MathUtils.lerp(CONFIG.cameraLookLift, 3.2, arrival) * portraitLift;
  cameraAim.lerp(lookAhead, 1 - Math.exp(-activeDt / CONFIG.cameraResponse));
  camera.lookAt(cameraAim);
  const curveBank = THREE.MathUtils.clamp((lookAheadS.heading - s.heading) * 2.5, -1, 1);
  const targetBank = reduceMotion ? 0 : -state.visualSteer * CONFIG.cameraBank - curveBank * CONFIG.routeBank;
  state.cameraBank += (targetBank - state.cameraBank) * (1 - Math.exp(-activeDt * 7));
  camera.rotateZ(state.cameraBank);
  // 急な下りほど画角をひろげ、落ちていく加速感を出す。
  const steepT = THREE.MathUtils.clamp((s.grade - CONFIG.slopeRate) / 0.22, 0, 1);
  const targetFov = 62 + (state.running && !reduceMotion
    ? CONFIG.cameraFovBoost + steepT * CONFIG.steepFovBoost
      + Math.abs(curveBank) * 0.8 + curvePreview
    : 0);
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-activeDt * 3.5));
  camera.updateProjectionMatrix();

  // 空のドームはカメラについてこさせる。原点に置いたままだと、
  // コースを 500 下ったころには 描かれた水平線が 17度も浮きあがってしまう。
  skyDome.position.copy(camera.position);

  if (player.userData.spriteMode) {
    player.quaternion.copy(camera.quaternion);
    player.rotateZ(-state.visualSteer * 0.035 + state.xVel * 0.0025);
  }
  updateSound(s);
  renderer.render(scene, camera);
}


/* ------------------------- 9. 入力 ------------------------- */
const input = { steer: 0, brake: false };
const keys = new Set();
const pointerControls = new Map();
let canvasPointer = null;
let pointerSteer = 0;

function updateInput() {
  let steer = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) steer -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) steer += 1;
  for (const action of pointerControls.values()) {
    if (action === 'left') steer -= 1;
    if (action === 'right') steer += 1;
  }
  input.steer = state.running && !state.paused ? THREE.MathUtils.clamp(steer + pointerSteer, -1, 1) : 0;
  input.brake = state.running && !state.paused && (keys.has('ArrowDown') || keys.has('KeyS') || [...pointerControls.values()].includes('brake'));
}
function resetInput() {
  keys.clear(); pointerControls.clear(); canvasPointer = null; pointerSteer = 0;
  input.steer = 0; input.brake = false;
  for (const button of document.querySelectorAll('[data-control]')) button.classList.remove('pressed');
}
window.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea, button, a')) return;
  if (e.code === 'Space' || e.code === 'Escape') {
    e.preventDefault(); if (!e.repeat) togglePause(); return;
  }
  if (!['ArrowLeft','ArrowRight','ArrowDown','KeyA','KeyD','KeyS'].includes(e.code)) return;
  e.preventDefault(); keys.add(e.code); updateInput();
});
window.addEventListener('keyup', e => { keys.delete(e.code); updateInput(); });
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => {
  if (!state.running || state.paused || canvasPointer !== null || e.button !== 0) return;
  canvasPointer = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  pointerSteer = e.clientX < innerWidth / 2 ? -0.65 : 0.65;
  updateInput();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== canvasPointer) return;
  const position = (e.clientX / innerWidth - 0.5) * 2;
  pointerSteer = Math.abs(position) < 0.08 ? 0 : THREE.MathUtils.clamp(position / 0.7, -1, 1);
  updateInput();
});
function releaseCanvas(e) {
  if (e.pointerId !== canvasPointer) return;
  canvasPointer = null; pointerSteer = 0; updateInput();
}
for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, releaseCanvas);
for (const button of document.querySelectorAll('[data-control]')) {
  button.addEventListener('pointerdown', e => {
    if (!state.running || state.paused || e.button !== 0) return;
    e.preventDefault(); button.setPointerCapture(e.pointerId);
    pointerControls.set(e.pointerId, button.dataset.control); button.classList.add('pressed'); updateInput();
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, e => {
    pointerControls.delete(e.pointerId); button.classList.remove('pressed'); updateInput();
  });
}
function pauseWhenAway() {
  resetInput();
  if (state.running && !state.paused) togglePause();
}
window.addEventListener('blur', pauseWhenAway);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseWhenAway(); });

/* ------------------------- 画面遷移 ------------------------- */
function showOverlay(id) {
  for (const el of document.querySelectorAll('.overlay')) el.classList.add('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function togglePause() {
  if (!document.getElementById('labPanel').classList.contains('hidden')) return;
  if (!state.running) return;
  state.paused = !state.paused;
  resetInput();
  document.getElementById('pauseScreen').classList.toggle('hidden', !state.paused);
  // 復帰した最初のフレームに、停止中の時間をまとめて加算しない。
  if (!state.paused) { clock.getDelta(); document.activeElement?.blur(); }
}

function endGame(cleared) {
  state.running = false;
  state.paused = false;
  document.getElementById('pauseScreen').classList.add('hidden');
  resetInput();
  if (cleared) {
    playChime();
    document.getElementById('clearLap').textContent = state.lap;
    showOverlay('clearScreen');
  } else {
    showOverlay('gameOverScreen');
  }
}

// 何周でも同じ坂を走る。周をかさねると すこしだけ速くなる。
function runLap(nextLap) {
  state.lap = nextLap;
  state.speedScale = 1 + Math.min(CONFIG.lapSpeedMax, (nextLap - 1) * CONFIG.lapSpeedGain);
  if (!worldBuilt) buildWorld();
  resetRun();
  document.getElementById('pauseScreen').classList.add('hidden');
  startSound();
  state.running = true;
  document.activeElement?.blur();
}

/* スタートを待たせるしくみ。
   画像がとどくと世界を組みなおすので、走っている最中に届くとつっかえる。
   ぜんぶそろってから走りださせる（おそい回線でも12秒であきらめて始める）。 */
const startBtn = document.getElementById('startBtn');
let startReady = false;
function markStartReady() {
  if (startReady) return;
  startReady = true;
  applyPendingRebuilds();   // よみこんだ絵を反映してから、押せるようにする
  startBtn.disabled = false;
  startBtn.textContent = '🛹 タップしてスタート';
}
if (texPending === 0) {
  markStartReady();
} else {
  startBtn.disabled = true;
  startBtn.textContent = '⏳ けしきを よみこみ中…';
  onAllTexturesReady = markStartReady;
  setTimeout(markStartReady, 12000);
}

const soundBtn = document.getElementById('soundBtn');
if (soundBtn) {
  soundBtn.addEventListener('click', () => {
    startSound();
    setSoundOn(!sound.on);
  });
}
setSoundOn(sound.on);

startBtn.addEventListener('click', () => {
  if (!startReady) return;
  runLap(1);
  document.getElementById('startScreen').classList.add('hidden');
  startBtn.blur();
});
document.getElementById('retryBtn').addEventListener('click', () => {
  runLap(state.lap);
  document.getElementById('gameOverScreen').classList.add('hidden');
});
document.getElementById('nextBtn').addEventListener('click', () => {
  runLap(state.lap + 1);
  document.getElementById('clearScreen').classList.add('hidden');
});
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('pauseBtn').addEventListener('click', togglePause);

const labPanel = document.getElementById('labPanel');
const labDefaults = { speed: CONFIG.speed, steerAccel: CONFIG.steerAccel, cameraShake: CONFIG.cameraShake };
let labWasPaused = false;
function syncLab() {
  for (const slider of labPanel.querySelectorAll('input[data-setting]')) {
    const key = slider.dataset.setting;
    slider.value = CONFIG[key];
    document.getElementById(key + 'Output').textContent = CONFIG[key];
  }
  document.getElementById('labCode').textContent = `speed: ${CONFIG.speed},\nsteerAccel: ${CONFIG.steerAccel},\ncameraShake: ${CONFIG.cameraShake},`;
}
document.getElementById('labBtn').addEventListener('click', () => {
  labWasPaused = state.paused;
  state.paused = true; resetInput(); syncLab();
  labPanel.classList.remove('hidden');
  document.getElementById('labClose').focus();
});
function closeLab() {
  labPanel.classList.add('hidden'); state.paused = labWasPaused;
  resetInput(); clock.getDelta();
  if (state.running && !state.paused) document.activeElement?.blur();
  else document.getElementById('labBtn').focus();
}
document.getElementById('labClose').addEventListener('click', closeLab);
labPanel.addEventListener('keydown', e => {
  if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLab(); }
  if (e.code === 'Tab') {
    const items = [...labPanel.querySelectorAll('button, input, a')];
    if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
  }
});
for (const slider of labPanel.querySelectorAll('input[data-setting]')) slider.addEventListener('input', () => {
  CONFIG[slider.dataset.setting] = Number(slider.value); syncLab();
});
document.getElementById('labReset').addEventListener('click', () => { Object.assign(CONFIG, labDefaults); syncLab(); });

// 起動直後は道だけ見せておく
buildWorld();
resetRun();
state.running = false;
animate();

