/* 豊島ダウンヒル：海・山・雲を「絵」ではなく「コード」で描くファイル
   画像を貼るかわりに、ノイズ（なめらかな でたらめ）と光の計算で景色を作る。
   - 海：浅いところは底が透けて見え、ゆれる光の網（コースティクス）が走る
   - 山と島：尾根と谷、木のしげみ、こけむした岩、砂浜まで全部ノイズ
   - 雲：もこもこした形と、上は白く・下は青くかげる光を毎フレーム計算
   game.js はここの関数を呼んで、海・島・山・雲を組み立てる。              */

/* ------------------------- 1. JavaScript のノイズ（形づくり用） ------------------------- */
// 同じ seed なら毎回同じ地形になる。周回ごとに山の形が変わらないようにするため。
function natureHash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function natureNoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = natureHash(ix, iy, seed), b = natureHash(ix + 1, iy, seed);
  const c = natureHash(ix, iy + 1, seed), d = natureHash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function natureFbm(x, y, seed = 0, octaves = 5) {
  let value = 0, amp = 0.5, total = 0;
  for (let i = 0; i < octaves; i++) {
    value += natureNoise(x, y, seed + i * 31) * amp;
    total += amp;
    x = x * 2.03 + 17.1; y = y * 2.03 - 9.7; amp *= 0.5;
  }
  return value / total;
}
// 尾根ノイズ：折り返して とがった稜線を作る。瀬戸内の島の やせ尾根に近い。
function natureRidged(x, y, seed = 0, octaves = 5) {
  let value = 0, amp = 0.5, total = 0, weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(natureNoise(x, y, seed + i * 53) * 2 - 1);
    n *= n * weight;
    weight = Math.min(1, n * 1.6);
    value += n * amp;
    total += amp;
    x = x * 2.1 + 5.3; y = y * 2.1 + 11.9; amp *= 0.5;
  }
  return value / total;
}

/* ------------------------- 2. GLSL の共通部品 ------------------------- */
// 太陽の向き。空のドームの太陽と同じ方向にして、海のきらめきを太陽の下へ出す。
const NATURE_SUN_DIR = new THREE.Vector3(-0.55, 0.48, -0.7).normalize();
// 山を照らす光。前から当てると島の立体が読みやすいので、太陽とは別にしている。
const NATURE_LIGHT_DIR = new THREE.Vector3(80, 140, 60).normalize();
const NATURE_HAZE = new THREE.Color(0xc9e6f2);

const NATURE_GLSL_NOISE = `
  float nHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float nHash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(nHash(i), nHash(i + vec2(1.0, 0.0)), u.x),
               mix(nHash(i + vec2(0.0, 1.0)), nHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float vnoise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(nHash3(i), nHash3(i + vec3(1,0,0)), u.x),
                  mix(nHash3(i + vec3(0,1,0)), nHash3(i + vec3(1,1,0)), u.x), u.y);
    float b = mix(mix(nHash3(i + vec3(0,0,1)), nHash3(i + vec3(1,0,1)), u.x),
                  mix(nHash3(i + vec3(0,1,1)), nHash3(i + vec3(1,1,1)), u.x), u.y);
    return mix(a, b, u.z);
  }
  float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p + 3.1; a *= 0.5; }
    return v / 0.96875;
  }
  float fbm3(vec3 p, float detail) {
    float v = 0.0, a = 0.5, total = 0.0;
    for (int i = 0; i < 4; i++) {
      float w = i < 2 ? 1.0 : detail;
      v += a * w * vnoise3(p); total += a * w;
      p = p * 2.07 + vec3(1.7, 9.2, 4.3); a *= 0.5;
    }
    return v / total;
  }
  // 空の色。海に映る空と、空のドームで同じ式を使う。
  vec3 natureSky(vec3 d) {
    float height = pow(smoothstep(0.0, 0.45, max(d.y, 0.0)), 0.48);
    vec3 color = mix(vec3(0.84, 0.95, 0.99), vec3(0.015, 0.38, 0.96), height);
    float sunDot = max(dot(d, normalize(vec3(-0.55, 0.48, -0.7))), 0.0);
    color += vec3(0.22, 0.20, 0.12) * pow(sunDot, 12.0) + vec3(0.38, 0.34, 0.22) * pow(sunDot, 240.0);
    return color;
  }
`;

/* ------------------------- 3. 空 ------------------------- */
// 夏の青空と、高いところを流れる うすい すじ雲。
function createSkyMaterial(timeUniform) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: timeUniform },
    vertexShader: `varying vec3 skyDirection;
      void main() { skyDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec3 skyDirection;
      ${NATURE_GLSL_NOISE}
      void main() {
        vec3 d = normalize(skyDirection);
        vec3 color = natureSky(d);
        // すじ雲：空を高い天井に見立てて、そこへノイズを流す
        if (d.y > 0.04) {
          vec2 p = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
          vec2 streak = vec2(p.x * 0.55 + p.y * 0.35, p.y * 1.9 - p.x * 0.4);
          float wisp = fbm2(streak + vec2(fbm2(p * 0.7) * 1.8, 0.0));
          float amount = smoothstep(0.55, 0.85, wisp) * smoothstep(0.04, 0.3, d.y);
          color = mix(color, vec3(0.97, 0.99, 1.0), amount * 0.45);
        }
        gl_FragColor = vec4(color, 1.0);
      }`
  });
}

/* ------------------------- 4. 海 ------------------------- */
// 岸までの距離の地図。陸地を真上から撮り、そこから距離を計算してテクスチャに入れる。
// コースを書きかえても、海の浅瀬と白波がその形に合わせて変わる。
const SHORE_MAP_SIZE = 1024;
const SHORE_RANGE = 96;   // この距離（ユニット）より沖は「深い海」
const shoreUniforms = {
  shoreMap: { value: null },
  shoreBounds: { value: new THREE.Vector4(0, 0, 1, 1) }, // minX, maxZ, 幅, 奥行き
  shoreReady: { value: 0 },
};

function bakeShoreMap(renderer, root, seaLevel, bounds, isHidden) {
  const N = SHORE_MAP_SIZE;
  const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
  // 真上から見て、海面より高いものを白、それ以外を黒で描く。
  const mask = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { seaLevel: { value: seaLevel } },
    vertexShader: `varying float worldY;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 w = modelMatrix * p;
        worldY = w.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform float seaLevel; varying float worldY;
      void main() { gl_FragColor = vec4(vec3(step(seaLevel + 0.05, worldY)), 1.0); }`,
  });
  const box = new THREE.Box3().setFromObject(root);
  const top = box.max.y + 50;
  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 1, top - box.min.y + 100);
  cam.position.set((bounds.minX + bounds.maxX) / 2, top, (bounds.minZ + bounds.maxZ) / 2);
  cam.up.set(0, 0, -1);
  cam.lookAt(cam.position.x, 0, cam.position.z);
  cam.updateMatrixWorld();

  const hidden = [];
  root.traverse(object => {
    if (object.visible && (object.isLine || object.isPoints || object.isSprite || isHidden(object))) {
      hidden.push(object);
      object.visible = false;
    }
  });
  const parent = root.parent;
  const tmpScene = new THREE.Scene();
  tmpScene.overrideMaterial = mask;
  tmpScene.add(root);
  const target = new THREE.WebGLRenderTarget(N, N);
  const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(target);
  renderer.render(tmpScene, cam);
  const pixels = new Uint8Array(N * N * 4);
  renderer.readRenderTargetPixels(target, 0, 0, N, N, pixels);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clearColor, clearAlpha);
  target.dispose();
  mask.dispose();
  if (parent) parent.add(root);
  for (const object of hidden) object.visible = true;

  // 2回なぞるだけの「距離の計算」（チャンファー距離変換）。
  // 海のマスは いちばん近い陸まで、陸のマスは いちばん近い海までの距離を持つ。
  const land = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) land[i] = pixels[i * 4] > 127 ? 1 : 0;
  const INF = 1e9, D1 = 1, D2 = Math.SQRT2;
  function distanceTo(targetValue) {
    const dist = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) dist[i] = land[i] === targetValue ? 0 : INF;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let d = dist[i];
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, dist[i - 1] + D1);
      if (y > 0) {
        d = Math.min(d, dist[i - N] + D1);
        if (x > 0) d = Math.min(d, dist[i - N - 1] + D2);
        if (x < N - 1) d = Math.min(d, dist[i - N + 1] + D2);
      }
      dist[i] = d;
    }
    for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
      const i = y * N + x;
      let d = dist[i];
      if (d === 0) continue;
      if (x < N - 1) d = Math.min(d, dist[i + 1] + D1);
      if (y < N - 1) {
        d = Math.min(d, dist[i + N] + D1);
        if (x < N - 1) d = Math.min(d, dist[i + N + 1] + D2);
        if (x > 0) d = Math.min(d, dist[i + N - 1] + D2);
      }
      dist[i] = d;
    }
    return dist;
  }
  const toLand = distanceTo(1), toSea = distanceTo(0);
  const unit = Math.max(width, depth) / N;
  let data = shoreUniforms.shoreMap.value?.image.data;
  if (!data) data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    // 岸を 0.5 にした「符号つき距離」。海は 0.5 より大きく、陸は小さい。
    const signed = (land[i] ? -(toSea[i] - 0.5) : (toLand[i] - 0.5)) * unit;
    const v = Math.round(THREE.MathUtils.clamp(0.5 + signed / (2 * SHORE_RANGE), 0, 1) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  if (!shoreUniforms.shoreMap.value) {
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    shoreUniforms.shoreMap.value = tex;
  }
  shoreUniforms.shoreMap.value.needsUpdate = true;
  shoreUniforms.shoreBounds.value.set(bounds.minX, bounds.maxZ, width, depth);
  shoreUniforms.shoreReady.value = 1;
}

function createOceanMaterial(timeUniform, clearness = 1) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    sunDir: { value: NATURE_SUN_DIR.clone() },
    shoreRange: { value: SHORE_RANGE },
    clearness: { value: clearness },
  }]);
  // 時間と岸の地図は複製せず、同じものを指す（merge に入れると複製されてしまう）
  uniforms.uTime = timeUniform;
  uniforms.shoreMap = shoreUniforms.shoreMap;
  uniforms.shoreBounds = shoreUniforms.shoreBounds;
  uniforms.shoreReady = shoreUniforms.shoreReady;
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms,
    vertexShader: `varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D shoreMap;
      uniform vec4 shoreBounds;
      uniform float shoreReady, shoreRange, clearness;
      uniform vec3 sunDir;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${NATURE_GLSL_NOISE}

      // 波：長いうねりを数本かさね、その上に細かなさざ波のノイズをのせる。
      // footprint は「画面の1点が海の上で何ユニットぶんか」。
      // 波長がその数倍より短い波は描かない（描くと縞模様＝モアレになる）。
      float waveFade(float wavelength, float footprint) {
        return 1.0 - smoothstep(0.18, 0.42, footprint / wavelength);
      }
      vec2 waveSlope(vec2 p, float t, float footprint) {
        vec2 g = vec2(0.0);
        vec4 waves[6];
        // xy: 向き, z: 波長, w: 高さ。瀬戸内は波がおだやかなので低めにする。
        waves[0] = vec4(0.80, 0.60, 41.0, 0.12);
        waves[1] = vec4(-0.45, 0.89, 27.0, 0.08);
        waves[2] = vec4(0.97, -0.24, 16.5, 0.05);
        waves[3] = vec4(0.12, 0.99, 10.3, 0.035);
        waves[4] = vec4(-0.78, -0.62, 6.7, 0.022);
        waves[5] = vec4(0.55, -0.83, 4.3, 0.014);
        // 場所によって波の強さを変え、規則正しい縞に見せない
        float gustA = 0.45 + 1.1 * vnoise(p * 0.009 + 3.7);
        float gustB = 0.45 + 1.1 * vnoise(p * 0.014 - 8.1);
        for (int i = 0; i < 6; i++) {
          vec4 w = waves[i];
          vec2 dir = normalize(w.xy);
          float k = 6.2831 / w.z;
          float phase = dot(dir, p) * k - t * sqrt(9.8 * k) * 0.55 + float(i) * 1.7;
          float gust = mod(float(i), 2.0) < 0.5 ? gustA : gustB;
          g += dir * w.w * k * cos(phase) * gust * waveFade(w.z, footprint);
        }
        // さざ波：ノイズの坂を差分でとる。遠くでは消して、ちらつかせない。
        float fine1 = waveFade(2.4, footprint), fine2 = waveFade(0.9, footprint);
        if (fine1 > 0.01) {
          vec2 q = p * 0.42 + vec2(t * 0.35, -t * 0.22);
          float e = 0.35;
          float n0 = vnoise(q), nx = vnoise(q + vec2(e, 0.0)), nz = vnoise(q + vec2(0.0, e));
          g += vec2(nx - n0, nz - n0) / e * 0.07 * fine1;
          vec2 r = p * 1.1 + vec2(-t * 0.6, t * 0.45);
          float m0 = vnoise(r), mx = vnoise(r + vec2(e, 0.0)), mz = vnoise(r + vec2(0.0, e));
          g += vec2(mx - m0, mz - m0) / e * 0.028 * fine2;
        }
        return g;
      }

      // 光の網（コースティクス）：波の面はレンズ。へこんだ所・ふくらんだ所で光が集まったり散ったりする。
      // 光が海底へ届く位置の「ゆがみ具合」（ヤコビアン）が 0 に近い所ほど、光がぎゅっと集まって明るい線になる。
      float caustics(vec2 p, float t, float focus) {
        p += 1.2 * vec2(vnoise(p * 0.13), vnoise(p * 0.13 + 3.7));
        vec4 cw[6];
        // xy: 向き, z: 波長, w: 強さ
        cw[0] = vec4(0.94, 0.34, 5.3, 0.33);
        cw[1] = vec4(-0.52, 0.85, 4.1, 0.27);
        cw[2] = vec4(0.18, -0.98, 6.7, 0.36);
        cw[3] = vec4(-0.87, -0.49, 3.4, 0.2);
        cw[4] = vec4(0.63, -0.77, 2.9, 0.16);
        cw[5] = vec4(-0.2, 0.98, 7.9, 0.34);
        float hxx = 0.0, hxy = 0.0, hyy = 0.0;
        for (int i = 0; i < 6; i++) {
          vec4 w = cw[i];
          vec2 k = normalize(w.xy) * (6.2831 / w.z);
          float c = -w.w / dot(k, k) * cos(dot(k, p) - t * (0.9 + 0.15 * float(i)) + float(i) * 2.1);
          hxx += c * k.x * k.x; hxy += c * k.x * k.y; hyy += c * k.y * k.y;
        }
        float det = (1.0 + focus * hxx) * (1.0 + focus * hyy) - focus * focus * hxy * hxy;
        float light = 1.0 / max(abs(det), 0.07);
        return clamp((light - 0.85) * 0.34, 0.0, 2.6);
      }
      // 海の底：白っぽい花こう岩の砂、砂のさざ波もよう、こけと海藻のついた岩、アマモ場。
      vec3 seabed(vec2 p) {
        float ripple = sin(dot(p, vec2(0.83, 0.55)) * 1.7 + vnoise(p * 0.18) * 5.0) * 0.5 + 0.5;
        vec3 sand = vec3(0.88, 0.82, 0.64) * (0.86 + 0.14 * ripple) * (0.9 + 0.2 * vnoise(p * 0.9));
        // 岩：大きめのセルのうち、いくつかだけを岩にする
        vec2 cell = p * 0.13;
        vec2 ci = floor(cell), cf = fract(cell);
        float rock = 0.0, rockShade = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y));
          float h = nHash(ci + o + 91.7);
          if (h < 0.7) continue;               // 岩があるのは4マスに1つくらい
          vec2 c = o + 0.3 + 0.4 * vec2(nHash(ci + o), nHash(ci + o + 5.3)) - cf;
          float size = 0.12 + 0.9 * (h - 0.7);  // 小石から大岩まで
          // 輪郭をノイズでゆがめ、丸いお皿に見せない
          vec2 dir = c / max(length(c), 0.001);
          size *= 0.72 + 0.5 * vnoise(dir * 1.8 + (ci + o) * 7.3) + 0.12 * vnoise((p + c) * 1.3);
          float r = length(c);
          float m = 1.0 - smoothstep(size - 0.04, size, r);
          if (m > rock) { rock = m; rockShade = 1.0 - r / size; }
        }
        float moss = smoothstep(0.35, 0.75, vnoise(p * 0.55));
        // 岩は上が明るく、こけ（緑）と海藻（茶）がまだらにつく
        vec3 rockColor = mix(vec3(0.58, 0.55, 0.47), vec3(0.28, 0.42, 0.16), moss);
        rockColor = mix(rockColor, vec3(0.36, 0.30, 0.16), smoothstep(0.6, 0.9, vnoise(p * 1.7 + 3.0)) * 0.5);
        rockColor *= 0.5 + 0.75 * sqrt(max(rockShade, 0.0));
        vec3 bed = mix(sand, rockColor, rock);
        // アマモ場：砂の上にひろがる濃い緑のまだら
        float eelgrass = smoothstep(0.58, 0.72, fbm2(p * 0.035 + 7.0)) * (1.0 - rock);
        bed = mix(bed, vec3(0.14, 0.27, 0.12) * (0.8 + 0.4 * vnoise(p * 2.3)), eelgrass * 0.85);
        return bed;
      }

      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dCam = length(toCam);
        vec3 V = toCam / dCam;
        float detail = 1.0 - smoothstep(90.0, 650.0, dCam);
        // 画面1点ぶんの海の広さ。ななめに見るほど奥行き方向に引きのばされる。
        float footprint = dCam * 0.0017 / max(V.y, 0.08);

        vec2 slope = waveSlope(vWorld.xz, uTime, footprint);
        vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

        // 岸からの距離（ユニット）。地図の外は深い海。
        float shore = shoreRange;
        vec2 suv = vec2((vWorld.x - shoreBounds.x) / shoreBounds.z, (shoreBounds.y - vWorld.z) / shoreBounds.w);
        if (shoreReady > 0.5 && suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
          shore = (texture2D(shoreMap, suv).r - 0.5) * 2.0 * shoreRange;
        }
        // 岸の線をまっすぐにしないよう、少しだけノイズでゆらす
        shore += (vnoise(vWorld.xz * 0.045) - 0.5) * 7.0;
        // 岸から沖へ、ゆるやかに深くなる遠浅の海。
        float waterDepth = clamp(shore, 0.0, shoreRange) * 0.085;
        float shallow = 1.0 - smoothstep(18.0, 90.0, shore);

        vec3 deepColor = vec3(0.04, 0.34, 0.43);
        vec3 scatterColor = vec3(0.09, 0.58, 0.6);
        vec3 underwater = deepColor;
        if (shallow > 0.002) {
          // 水面で光が折れ曲がるので、底の見える位置が波といっしょにゆれる
          vec3 Nr = normalize(mix(vec3(0.0, 1.0, 0.0), N, 0.6));
          vec3 R = refract(-V, Nr, 0.75);
          float cosT = max(-R.y, 0.18);
          vec2 bedP = vWorld.xz + R.xz / cosT * waterDepth;
          vec3 bed = seabed(bedP);
          // 光の網は細いので、遠くでは平均の明るさに置きかえる（ちらつき防止）
          float causticFade = 1.0 - smoothstep(0.12, 0.35, footprint / 3.1);
          // 深いほど光の焦点が合い、線がくっきりする
          float focus = clamp(0.8 + waterDepth * 0.2, 0.8, 1.9);
          float light = mix(0.2, caustics(bedP, uTime * 1.3, focus), causticFade) * exp(-waterDepth * 0.1);
          bed *= 0.75 + 0.9 * light;
          // 赤い光ほど水に吸われるので、深いほど青緑になる（ベール・ランベルトの法則）
          float path = (waterDepth / cosT + waterDepth) / max(clearness, 0.1);
          vec3 transmit = exp(-vec3(0.30, 0.052, 0.042) * path);
          vec3 inscatter = mix(scatterColor, deepColor, 1.0 - exp(-waterDepth * 0.09));
          vec3 clear = bed * transmit + inscatter * (1.0 - transmit);
          underwater = mix(deepColor, clear, shallow);
        }
        // 水の中から にじみ出る光。波の山が少し明るく透ける。
        underwater += vec3(0.02, 0.10, 0.09) * clamp(slope.x * 1.5 + slope.y, 0.0, 1.0) * detail;

        // 空の映りこみ（フレネル：ななめに見るほど鏡のようになる）
        vec3 Rf = reflect(-V, N);
        Rf.y = abs(Rf.y);
        // 映る空は少しだけ淡くする（真上の濃い青がそのまま映ると、海が紺色になりすぎる）
        vec3 sky = mix(natureSky(Rf), vec3(0.72, 0.87, 0.95), 0.25);
        float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 color = mix(underwater, sky, min(fresnel, 0.85));

        // 太陽のきらめき：するどい光の粒と、ひろい光の帯
        vec3 H = normalize(V + sunDir);
        float nh = max(dot(N, H), 0.0);
        // 遠くは細かな波を描かないぶん、光をぼかして「光の道」として見せる
        float rough = 1.0 - waveFade(13.0, footprint);
        color += vec3(1.0, 0.95, 0.82) * (pow(nh, mix(900.0, 90.0, rough)) * mix(1.6, 0.8, rough) + pow(nh, 60.0) * 0.12);

        // 波打ちぎわの白波：岸へ寄せては返す
        float surge = (sin(uTime * 1.15 + vnoise(vWorld.xz * 0.08) * 6.2831) * 0.5 + 0.5) * 2.6;
        float foamZone = 1.0 - smoothstep(0.0, 2.2 + surge, shore);
        float foamNoise = vnoise(vWorld.xz * 0.7 + vec2(uTime * 0.25, -uTime * 0.18));
        float foam = foamZone * smoothstep(0.45, 0.7, foamNoise + foamZone * 0.45);
        foam += (1.0 - smoothstep(0.0, 0.9, abs(shore - surge - 1.2))) * 0.35 * smoothstep(0.3, 0.6, foamNoise);
        color = mix(color, vec3(0.96, 0.99, 1.0), clamp(foam, 0.0, 1.0) * 0.85 * shallow);

        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }`,
  });
}

/* ------------------------- 5. 山と島 ------------------------- */
// 木のしげみ・こけむした岩・砂浜・遠くほど青くかすむ空気を、1つの材質で描く。
function createTerrainMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      lightDir: { value: NATURE_LIGHT_DIR.clone() },
      hazeColor: { value: (opts.hazeColor || NATURE_HAZE).clone() },
      hazeDensity: { value: opts.hazeDensity ?? 0.00055 },
      hazeMax: { value: opts.hazeMax ?? 0.82 },
      seaLevel: { value: opts.seaLevel ?? 0 },
      detailScale: { value: opts.detailScale ?? 0.075 },
    },
    vertexShader: `varying vec3 vWorld; varying vec3 vNormalW; varying vec3 vTint;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        // たて横で大きさを変えた山でも、面の向きが正しくなる計算（normalMatrix 経由）
        vNormalW = normalize((vec4(normalMatrix * normal, 0.0) * viewMatrix).xyz);
        vTint = color;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 lightDir, hazeColor;
      uniform float hazeDensity, hazeMax, seaLevel, detailScale;
      varying vec3 vWorld; varying vec3 vNormalW; varying vec3 vTint;
      ${NATURE_GLSL_NOISE}
      void main() {
        vec3 n = normalize(vNormalW);
        float dCam = distance(cameraPosition, vWorld);
        float fine = 1.0 - smoothstep(220.0, 1500.0, dCam);
        vec3 p = vWorld * detailScale;

        // 木のしげみ：大きなかたまり と ひとつひとつの樹冠
        float canopy = fbm3(p, fine);
        float crown = vnoise3(p * 3.3);
        // 樹冠のでこぼこで、光の当たり方を少しずつ変える
        float e = 0.4;
        vec3 q = p * 3.3;
        vec3 bump = vec3(vnoise3(q + vec3(e, 0.0, 0.0)) - crown, 0.0, vnoise3(q + vec3(0.0, 0.0, e)) - crown) / e;
        vec3 bn = normalize(n - bump * 0.22 * fine);

        float slope = 1.0 - n.y;
        float h = vWorld.y - seaLevel;

        vec3 forestDark = vec3(0.09, 0.24, 0.15);
        vec3 forestLight = vec3(0.33, 0.52, 0.24);
        float leaf = smoothstep(0.25, 0.8, canopy * 0.72 + crown * 0.28 * fine + 0.08);
        vec3 color = mix(forestDark, forestLight, leaf) * vTint;
        // ゆるい斜面には畑や草地（棚田）が開ける
        float field = smoothstep(0.6, 0.7, fbm2(vWorld.xz * 0.011 + vTint.xy * 13.0)) * (1.0 - smoothstep(0.1, 0.3, slope));
        color = mix(color, vec3(0.56, 0.64, 0.36) * (0.85 + 0.3 * crown), field * 0.75);
        // 急な斜面は花こう岩がのぞき、くぼみに こけが残る
        float rockMask = smoothstep(0.42, 0.66, slope + (canopy - 0.5) * 0.4);
        vec3 rock = mix(vec3(0.66, 0.63, 0.55), vec3(0.42, 0.41, 0.37), crown);
        rock = mix(rock, vec3(0.27, 0.40, 0.20), smoothstep(0.45, 0.75, canopy) * 0.65);
        color = mix(color, rock, rockMask);
        // 海ぎわの砂浜と、ぬれた岩
        float edge = vnoise(vWorld.xz * 0.07) * 1.6;
        float beach = 1.0 - smoothstep(1.4 + edge, 3.4 + edge, h);
        vec3 sand = mix(vec3(0.45, 0.43, 0.37), vec3(0.86, 0.81, 0.66), smoothstep(0.7, 1.5, h));
        color = mix(color, sand, beach * step(-5.0, h));

        // 光：空からの光 + 太陽の光。しげみのすき間は暗くなる。
        float diffuse = max(dot(bn, lightDir), 0.0);
        vec3 ambient = mix(vec3(0.30, 0.33, 0.28), vec3(0.64, 0.76, 0.88), bn.y * 0.5 + 0.5);
        float cavity = mix(1.0, 0.62 + 0.5 * canopy, (1.0 - rockMask) * (1.0 - beach) * fine);
        vec3 lit = color * (ambient * 0.78 * cavity + vec3(1.0, 0.95, 0.84) * diffuse * 0.92);

        // 空気遠近法：遠い山ほど空の色にとける。低いところほど もやが濃い。
        float haze = 1.0 - exp(-dCam * hazeDensity * (1.0 + 0.6 * exp(-max(h, 0.0) * 0.02)));
        lit = mix(lit, hazeColor, min(haze, hazeMax));
        gl_FragColor = vec4(lit, 1.0);
      }`,
  });
}

// 海からもり上がる島。外周は海面より上にして、そこから海中へ裾を垂らす（波打ちぎわがちらつかない）。
function makeIslandGeometry({ x, z, rx, rz, height, seaY, seed, tint, rings = 30, slices = 120 }) {
  const vertices = [], colors = [], indices = [];
  const phase = natureHash(seed, 7, 3) * 6.28;
  const peakAx = -0.28 + (natureHash(seed, 1, 1) - 0.5) * 0.2;
  const peakBx = 0.3 + (natureHash(seed, 2, 1) - 0.5) * 0.2;
  const c = new THREE.Color(tint);
  for (let r = 0; r <= rings + 1; r++) {
    const radius = Math.min(r, rings) / rings;
    const underwater = r > rings;
    for (let j = 0; j <= slices; j++) {
      const a = j / slices * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // 海岸線：ゆるい出入り + 細かな岬と入り江
      const shore = 1 + 0.10 * Math.sin(a * 3 + phase) + 0.06 * Math.cos(a * 5 - phase)
        + 0.07 * (natureFbm(ca * 2.2 + seed, sa * 2.2, seed, 4) - 0.5);
      const u = ca * radius, v = sa * radius;
      const peakA = Math.exp(-((u - peakAx) ** 2 * 7 + (v - 0.03) ** 2 * 4));
      const peakB = Math.exp(-((u - peakBx) ** 2 * 10 + (v + 0.08) ** 2 * 7));
      // 瀬戸内の島は丸い。肩をふくらませてから、尾根と谷をうすく刻む。
      const massif = Math.pow(peakA * 0.66 + peakB * 0.8, 0.8);
      const ridge = natureRidged(u * 2.4 + seed * 3.1, v * 2.4 - seed, seed, 5);
      const gully = natureFbm(u * 5 + seed, v * 5, seed + 9, 4);
      const falloff = 1 - Math.pow(radius, 5);
      const h = (massif * (0.8 + 0.28 * ridge) + 0.08 * (gully - 0.4) * (1 - radius)) * falloff * height;
      const px = x + ca * rx * radius * shore, pz = z + sa * rz * radius * shore;
      vertices.push(px, seaY + (underwater ? -6 : 0.8 + h), pz);
      const shade = 0.92 + 0.14 * natureNoise(px * 0.02, pz * 0.02, seed);
      colors.push(c.r * shade, c.g * shade, c.b * shade);
      if (r <= rings && j < slices) {
        const i = r * (slices + 1) + j;
        indices.push(i, i + 1, i + slices + 1, i + 1, i + slices + 2, i + slices + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// 対岸の山なみ：横に長い帯の地形。稜線は尾根ノイズで、ひとつづきにつなげる。
function makeRidgeGeometry({ width, depth, height, seed, tint, cols = 200, rows = 16 }) {
  const vertices = [], colors = [], indices = [];
  const c = new THREE.Color(tint);
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const x = (u - 0.5) * width;
      const zLocal = v * depth;
      const ends = THREE.MathUtils.smoothstep(u, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(u, 0.88, 1));
      const profile = 0.3 + 0.7 * natureRidged(u * 7.5 + seed, seed * 0.37, seed, 5);
      const across = Math.pow(Math.sin(Math.PI * v), 0.75);
      const bumps = 0.8 + 0.4 * natureFbm(u * 30 + seed, v * 3, seed + 3, 4);
      const y = (r === 0 || r === rows) ? -8 : height * profile * across * bumps * ends - 4;
      vertices.push(x, y, zLocal);
      colors.push(c.r, c.g, c.b);
      if (r < rows && i < cols) {
        const a = r * (cols + 1) + i;
        indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// 道ぞいの丘（壇山のすそ）：半球をノイズでゆがめた、木におおわれた丸い山。
// 底の半径1・高さ1。置くときに大きさを変える。
function makeHillGeometry(seed, tint = 0xffffff) {
  const geo = new THREE.SphereGeometry(1, 56, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const c = new THREE.Color(tint);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = natureFbm(x * 1.8 + seed, z * 1.8 - seed, seed, 5);
    const ridge = natureRidged(x * 1.3 + seed * 2, z * 1.3, seed + 4, 4);
    // 高さだけをゆがめ、ふもと（y=0）は そのまま地面に置く
    const lift = y * (0.7 + 0.45 * n + 0.35 * ridge);
    const spread = 1 + 0.12 * (n - 0.5) * (1 - y);
    pos.setXYZ(i, x * spread, lift, z * spread);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------- 6. 雲 ------------------------- */
// 板1枚に、もこもこの積雲を描く。いくつもの「球」を重ね、手前の球ほど強く効かせて面の向きを決め、光を計算する。
// 上と日なた側は白く、底と かげ側は空の青を映した灰色。ふちはノイズでゆらし、ゆっくり形を変える。
function createCloudMaterial(timeUniform, seed, aspect, lightSide = 0) {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uTime: timeUniform,
      seed: { value: seed },
      aspect: { value: aspect },
      lightSide: { value: lightSide },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, seed, aspect, lightSide;
      varying vec2 vUv;
      ${NATURE_GLSL_NOISE}
      void main() {
        vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
        float t = uTime * 0.02;
        // ふちのもこもこ：座標をノイズで少しゆがめる（時間でゆっくり変わる）
        vec2 wob = vec2(vnoise(p * 6.0 + vec2(seed, t)), vnoise(p * 6.0 + vec2(t, seed + 4.0))) - 0.5;
        vec2 wob2 = vec2(vnoise(p * 17.0 + vec2(seed * 2.0, -t)), vnoise(p * 17.0 + vec2(-t, seed + 8.0))) - 0.5;
        vec2 pw = p + wob * 0.07 + wob2 * 0.022;
        bool tower = aspect < 1.0;
        float halfW = aspect * 0.5;
        float baseY = tower ? -0.42 : -0.27;
        float edge = 0.0;
        vec3 nSum = vec3(0.0);
        for (int i = 0; i < 16; i++) {
          float fi = float(i);
          float h1 = nHash(vec2(seed, fi * 7.13));
          float h2 = nHash(vec2(fi * 3.7, seed + 1.9));
          float h3 = nHash(vec2(seed + fi, 11.1));
          vec2 c; float r;
          if (tower) {
            // 下から上へ積み上がる入道雲。上ほど細く、こぶは左右にずれる。
            float k = fi / 15.0;
            float w = mix(0.22, 0.1, k);
            r = mix(0.19, 0.09, k) * (0.8 + 0.4 * h1);
            c = vec2((h2 - 0.5) * 2.0 * w * 0.7, baseY + 0.1 + k * 0.64);
          } else if (i < 9) {
            // 下の段：横に並ぶ大きな こぶ。たがいに深く重ねて ひとかたまりにする。
            float k = fi / 8.0;
            float center = 1.0 - abs(k - 0.5) * 2.0;
            float spread = min(halfW - 0.3, 0.55 + 0.25 * h3);
            r = (0.17 + 0.07 * h1) * (0.65 + 0.45 * center);
            c = vec2((k - 0.5) * 2.0 * spread + (h2 - 0.5) * 0.06, baseY + r * 0.5 + 0.02 * h3);
          } else {
            // 上の段：まん中に もり上がる頭
            float k = (fi - 9.0) / 6.0;
            float center = 1.0 - abs(k - 0.5) * 2.0;
            r = 0.14 + 0.07 * h1;
            c = vec2((k - 0.5) * 2.0 * min(halfW - 0.3, 0.4) + (h2 - 0.5) * 0.1,
                     baseY + 0.22 + 0.1 * h3 + 0.12 * center);
            r = min(r, 0.46 - c.y);
          }
          vec2 d = (pw - c) / r;
          float q = dot(d, d);
          if (q < 1.0) {
            float z = sqrt(1.0 - q);
            // 手前にある こぶ ほど強く効かせ、重なり目の向きは なめらかにまぜる（折り目を出さない）
            float front = z * r + h3 * 0.04;
            float weight = exp(110.0 * (front - 0.34));
            nSum += vec3(d, z) * weight;
            edge = max(edge, (1.0 - sqrt(q)) * r);
          }
        }
        vec3 n = normalize(nSum + vec3(0.0, 0.0, 1e-24));
        float alpha = smoothstep(0.0, 0.014, edge) * smoothstep(baseY - 0.01, baseY + 0.035, pw.y);
        if (alpha < 0.01) discard;
        // こまかな もこもこ（カリフラワーのような凹凸）で面の向きをゆらす
        vec2 bump = vec2(vnoise(pw * 13.0 + seed), vnoise(pw * 13.0 + seed + 9.0)) - 0.5;
        n = normalize(n + vec3(bump * 0.7, 0.0));
        vec3 L = normalize(vec3(lightSide, 0.85, 0.45));
        float diffuse = max(dot(n, L), 0.0);
        float wrap = dot(n, L) * 0.5 + 0.5;
        vec3 color = mix(vec3(0.64, 0.72, 0.85), vec3(1.0, 0.985, 0.95), smoothstep(0.15, 0.85, wrap * 0.6 + diffuse * 0.55));
        // 底は平らで、空の青を映して暗い
        float lowness = 1.0 - smoothstep(baseY, baseY + 0.22, pw.y);
        color = mix(color, vec3(0.6, 0.67, 0.8), lowness * 0.55);
        // ふちは光がすけて少し明るい
        color += vec3(0.1, 0.1, 0.08) * pow(1.0 - n.z, 3.0);
        gl_FragColor = vec4(color, alpha);
      }`,
  });
  return material;
}
